import { finaliseEntry, makeResolver } from "../src/commands/finalise.js";
import type { ResolvedPr } from "../src/commands/finalise.js";
import { parseFrontmatter } from "../src/lib/frontmatter.js";
import { describe, expect, it } from "vitest";

type Runner = (cmd: string, args: readonly string[]) => string;

const PR: ResolvedPr = {
  additions: "10",
  changedFiles: "3",
  commits: "4",
  deletions: "2",
  mergedAt: "2026-05-24T09:00:00Z",
  mergeSha: "abc1234def",
  prNumber: "42",
};

function placeholderEntry(): string {
  return [
    "---",
    'title: "Fix a thing"',
    "version:",
    'created_at: "2026-05-23T14:55:37Z"',
    "merged_at:",
    'branch: "asw-123-fix-a-thing"',
    "pr:",
    "commit:",
    "category: fix",
    "breaking: false",
    'issues: ["A-123"]',
    "---",
    "",
    "## Fixed",
    "",
    "- A thing for A-123.",
    "",
  ].join("\n");
}

describe("finaliseEntry", () => {
  it("enriches, stamps version, and links an un-finalised entry", () => {
    const out = finaliseEntry(placeholderEntry(), "1.2.0", () => PR);
    expect(out).not.toBeNull();
    const { content, data } = parseFrontmatter(out as string);
    expect(data.version).toBe("1.2.0");
    expect(data.merged_at).toBe("2026-05-24T09:00:00Z");
    expect(data.commit).toBe("abc1234");
    expect(data.pr).toBe(42);
    expect(data.stats).toEqual({
      commits: 4,
      files_changed: 3,
      loc_added: 10,
      loc_removed: 2,
    });
    expect(content).toContain(
      "[A-123](https://linear.app/rheged-studio/issue/A-123)",
    );
  });

  it("re-enriches when stats is present but the commits child is missing (A-579)", () => {
    // An entry finalised between stats existing (A-380) and stats.commits
    // (A-560): every other post-merge field is set and stats is populated, but
    // commits is absent. The gate must still treat it as enrichable so the
    // resolver fills commits — before version-stamping makes it permanent.
    const raw = [
      "---",
      'title: "Fix a thing"',
      "version:",
      'created_at: "2026-05-23T14:55:37Z"',
      'merged_at: "2026-05-24T09:00:00Z"',
      'branch: "asw-123-fix-a-thing"',
      "pr: 42",
      'commit: "abc1234"',
      "category: fix",
      "breaking: false",
      "stats:",
      "  files_changed: 3",
      "  loc_added: 10",
      "  loc_removed: 2",
      'issues: ["A-123"]',
      "---",
      "",
      "## Fixed",
      "",
      "- A thing for A-123.",
      "",
    ].join("\n");
    let called = false;
    const out = finaliseEntry(raw, "1.2.0", () => {
      called = true;
      return PR;
    });
    expect(called).toBe(true);
    expect(out).not.toBeNull();
    const { data } = parseFrontmatter(out as string);
    expect(data.version).toBe("1.2.0");
    expect(data.stats).toEqual({
      commits: 4,
      files_changed: 3,
      loc_added: 10,
      loc_removed: 2,
    });
  });

  it("returns null for an already-finalised entry (version set)", () => {
    const raw = placeholderEntry().replace("version:", 'version: "1.0.0"');
    expect(finaliseEntry(raw, "1.2.0", () => PR)).toBeNull();
  });

  it("stamps + links even when no PR is found (resolver returns null)", () => {
    const out = finaliseEntry(placeholderEntry(), "1.2.0", () => null);
    const { data } = parseFrontmatter(out as string);
    expect(data.version).toBe("1.2.0");
    expect(data.merged_at ?? "").toBe(""); // not enriched
    expect(data.pr ?? "").toBe("");
  });

  it("enriches multi-commit stats from a 2-parent mergeCommit OID (A-825)", () => {
    const multiCommitPr: ResolvedPr = {
      additions: "120",
      changedFiles: "15",
      commits: "5",
      deletions: "30",
      mergedAt: "2026-08-01T12:00:00Z",
      mergeSha: "aabbccddeeff00112233445566778899aabbccdd",
      prNumber: "8",
    };
    const out = finaliseEntry(placeholderEntry(), "1.3.0", () => multiCommitPr);
    expect(out).not.toBeNull();
    const { data } = parseFrontmatter(out as string);
    expect(data.commit).toBe("aabbccd"); // first 7 of mergeSha
    expect(data.pr).toBe(8);
    expect(data.stats).toEqual({
      commits: 5,
      files_changed: 15,
      loc_added: 120,
      loc_removed: 30,
    });
  });

  it("does not call the resolver when the entry has no branch", () => {
    const raw = placeholderEntry().replace(
      'branch: "asw-123-fix-a-thing"',
      "branch:",
    );
    let called = false;
    const out = finaliseEntry(raw, "9.9.9", () => {
      called = true;
      return PR;
    });
    expect(called).toBe(false);
    expect(parseFrontmatter(out as string).data.version).toBe("9.9.9");
  });
});

type Call = { args: readonly string[]; cmd: string };

function makeRunner(handlers: Record<string, () => string>): {
  calls: Call[];
  run: Runner;
} {
  const calls: Call[] = [];
  function run(cmd: string, args: readonly string[]): string {
    calls.push({ args, cmd });
    const key = `${cmd} ${args.join(" ")}`;
    for (const prefix of Object.keys(handlers).toSorted(
      (a, b) => b.length - a.length,
    )) {
      if (key.startsWith(prefix)) {
        return handlers[prefix]();
      }
    }

    return "";
  }

  return { calls, run };
}

// A Runner that always throws, for the "gh fails" path. Module-scoped because
// it closes over nothing (unicorn/consistent-function-scoping).
function throwingRunner(): string {
  throw new Error("gh: API rate limit exceeded");
}

describe("makeResolver", () => {
  it("maps gh JSON to ResolvedPr from a squash-shaped mergeCommit OID", () => {
    // Squash merges land as a single-parent commit on trunk; mergeCommit.oid is
    // that squash SHA (not a 2-parent merge commit).
    const { run } = makeRunner({
      "gh pr list": () =>
        JSON.stringify([
          {
            additions: 10,
            changedFiles: 3,
            deletions: 2,
            headRefOid: "head999",
            mergeCommit: { oid: "merge111" },
            mergedAt: "2026-05-24T09:00:00Z",
            number: 42,
          },
        ]),
      "git cat-file": () => "tree x\nparent p1\nauthor a\n",
    });
    const resolved = makeResolver(run)("asw-123-fix-a-thing");
    expect(resolved).toEqual({
      additions: "10",
      changedFiles: "3",
      // No `gh api` handler wired here, so the commit-count call fails softly.
      commits: null,
      deletions: "2",
      mergedAt: "2026-05-24T09:00:00Z",
      mergeSha: "merge111",
      prNumber: "42",
    });
  });

  it("maps a 2-parent merge-commit OID and counts authored commits (A-825)", () => {
    const { run } = makeRunner({
      "gh api": () =>
        JSON.stringify([
          { parents: [{ sha: "p1" }] },
          { parents: [{ sha: "p2" }] },
          { parents: [{ sha: "p3" }] },
          { parents: [{ sha: "p4" }] },
          { parents: [{ sha: "p5" }] },
          // The 2-parent merge commit on trunk is excluded from the count.
          { parents: [{ sha: "p6" }, { sha: "p7" }] },
        ]),
      "gh pr list": () =>
        JSON.stringify([
          {
            additions: 10,
            changedFiles: 3,
            deletions: 2,
            mergeCommit: {
              oid: "aabbccddeeff00112233445566778899aabbccdd",
            },
            mergedAt: "2026-05-24T09:00:00Z",
            number: 8,
          },
        ]),
    });
    const resolved = makeResolver(run)("a-825-multi-commit-branch");
    expect(resolved?.mergeSha).toBe("aabbccddeeff00112233445566778899aabbccdd");
    expect(resolved?.commits).toBe("5");
  });

  it("resolves the non-merge commit count from the PR commits API", () => {
    const { run } = makeRunner({
      "gh api": () =>
        JSON.stringify([
          { parents: [{ sha: "p1" }] },
          { parents: [{ sha: "p2" }] },
          // A merge commit (two parents) is excluded from the count.
          { parents: [{ sha: "p3" }, { sha: "p4" }] },
          { parents: [{ sha: "p5" }] },
        ]),
      "gh pr list": () =>
        JSON.stringify([{ mergeCommit: { oid: "merge111" }, number: 42 }]),
      "git cat-file": () => "tree x\nparent p1\n",
    });
    expect(makeResolver(run)("a-1-branch")?.commits).toBe("3");
  });

  it("leaves commits null (without discarding other stats) when the count call fails", () => {
    const { run } = makeRunner({
      "gh api": () => {
        throw new Error("gh: API rate limit exceeded");
      },
      "gh pr list": () =>
        JSON.stringify([
          { additions: 10, mergeCommit: { oid: "merge111" }, number: 42 },
        ]),
      "git cat-file": () => "tree x\nparent p1\n",
    });
    const resolved = makeResolver(run)("a-1-branch");
    expect(resolved?.commits).toBeNull();
    expect(resolved?.additions).toBe("10"); // other stats survive
  });

  it("returns null when no merged PR is found", () => {
    const { run } = makeRunner({ "gh pr list": () => "[]" });
    expect(makeResolver(run)("missing")).toBeNull();
  });

  it("returns null (does not throw) when gh fails, so the release isn't blocked", () => {
    expect(makeResolver(throwingRunner)("any-branch")).toBeNull();
  });

  it("returns an empty mergeSha when the PR has no merge commit", () => {
    const { run } = makeRunner({
      "gh pr list": () => JSON.stringify([{ number: 1 }]),
    });
    expect(makeResolver(run)("b")?.mergeSha).toBe("");
  });

  it("returns null stat fields when gh omits them (so no NaN is written)", () => {
    const { run } = makeRunner({
      "gh pr list": () =>
        JSON.stringify([{ mergeCommit: { oid: "m" }, number: 7 }]),
      "git cat-file": () => "tree x\nparent p1\n",
    });
    const resolved = makeResolver(run)("b");
    expect(resolved?.additions).toBeNull();
    expect(resolved?.deletions).toBeNull();
    expect(resolved?.changedFiles).toBeNull();
  });
});
