import {
  backfillEntry,
  resolvePrNumber,
} from "../src/commands/backfill-commits.js";
import { parseFrontmatter } from "../src/lib/frontmatter.js";
import { describe, expect, it } from "vitest";

type Runner = (cmd: string, args: readonly string[]) => string;

// Prefix-matched fake runner, mirroring the finalise-changelog test helper.
function makeRunner(handlers: Record<string, () => string>): Runner {
  return (cmd, args) => {
    const key = `${cmd} ${args.join(" ")}`;
    for (const prefix of Object.keys(handlers).toSorted(
      (a, b) => b.length - a.length,
    )) {
      if (key.startsWith(prefix)) {
        return handlers[prefix]();
      }
    }

    return "";
  };
}

function COMMITS(count: number): string {
  return JSON.stringify(
    Array.from({ length: count }, () => ({ parents: [{ sha: "p" }] })),
  );
}

// An entry with a recorded `pr` and a blank-placeholder stats block.
function entryWithPr(): string {
  return [
    "---",
    'title: "Fix a thing"',
    "branch: a-1-fix",
    "pr: 42",
    "category: fix",
    "breaking: false",
    "stats:",
    "  files_changed:",
    "  loc_added:",
    "  loc_removed:",
    "---",
    "",
    "## Fixed",
    "",
    "- A thing.",
    "",
  ].join("\n");
}

describe("backfillEntry", () => {
  it("appends a single commits line to the stats block, leaving all else byte-identical", () => {
    const raw = entryWithPr();
    const out = backfillEntry(raw, makeRunner({ "gh api": () => COMMITS(5) }));
    expect(out).not.toBeNull();

    // The only change is one inserted line.
    const added = (out as string)
      .split("\n")
      .filter((line) => !raw.split("\n").includes(line));
    expect(added).toEqual(["  commits: 5"]);
    expect(
      (parseFrontmatter(out as string).data.stats as { commits: number })
        .commits,
    ).toBe(5);
  });

  it("mirrors the stats-block child indent rather than hard-coding two spaces (A-581)", () => {
    // A stats block indented four spaces must get a four-space commits line, or
    // the inserted line is no longer a child of stats:.
    const raw = [
      "---",
      'title: "Fix a thing"',
      "branch: a-1-fix",
      "pr: 42",
      "stats:",
      "    files_changed: 3",
      "    loc_added: 10",
      "    loc_removed: 2",
      "---",
      "",
      "## Fixed",
      "",
      "- A thing.",
      "",
    ].join("\n");
    const out = backfillEntry(
      raw,
      makeRunner({ "gh api": () => COMMITS(6) }),
    ) as string;
    expect(out).not.toBeNull();
    const added = out
      .split("\n")
      .filter((line) => !raw.split("\n").includes(line));
    expect(added).toEqual(["    commits: 6"]);
    expect(
      (parseFrontmatter(out).data.stats as { commits: number }).commits,
    ).toBe(6);
  });

  it("synthesises a stats block for an entry that omits stats entirely (A-613)", () => {
    // The contract allows an entry to omit `stats` altogether; backfill must
    // create the block rather than throwing "no stats block to extend".
    const raw = [
      "---",
      'title: "Fix a thing"',
      "branch: a-1-fix",
      "pr: 42",
      "category: fix",
      "breaking: false",
      "---",
      "",
      "## Fixed",
      "",
      "- A thing.",
      "",
    ].join("\n");
    const out = backfillEntry(
      raw,
      makeRunner({ "gh api": () => COMMITS(4) }),
    ) as string;
    expect(out).not.toBeNull();
    // A minimal stats: block is appended as the last frontmatter field.
    const added = out
      .split("\n")
      .filter((line) => !raw.split("\n").includes(line));
    expect(added).toEqual(["stats:", "  commits: 4"]);
    expect(
      (parseFrontmatter(out).data.stats as { commits: number }).commits,
    ).toBe(4);
    // Idempotent on the synthesised block, too.
    expect(
      backfillEntry(out, makeRunner({ "gh api": () => COMMITS(4) })),
    ).toBeNull();
  });

  it("is idempotent — re-running yields no change", () => {
    const run = makeRunner({ "gh api": () => COMMITS(5) });
    const once = backfillEntry(entryWithPr(), run) as string;
    expect(backfillEntry(once, run)).toBeNull();
  });

  it("replaces an existing commits line when the count changed", () => {
    const run = makeRunner({ "gh api": () => COMMITS(8) });
    const seeded = entryWithPr().replace(
      "  loc_removed:",
      "  loc_removed:\n  commits: 2",
    );
    const out = backfillEntry(seeded, run) as string;
    expect(
      (parseFrontmatter(out).data.stats as { commits: number }).commits,
    ).toBe(8);
    expect(out.match(/commits:/g)).toHaveLength(1); // not duplicated
  });

  it("resolves the PR from the branch when pr is blank", () => {
    const raw = entryWithPr().replace("pr: 42", "pr:");
    const run = makeRunner({
      "gh api": () => COMMITS(3),
      "gh pr list": () => JSON.stringify([{ number: 77 }]),
    });
    const out = backfillEntry(raw, run);
    expect(
      (parseFrontmatter(out as string).data.stats as { commits: number })
        .commits,
    ).toBe(3);
  });

  it("returns null when no merged PR resolves", () => {
    const raw = entryWithPr().replace("pr: 42", "pr:");
    const run = makeRunner({ "gh pr list": () => "[]" });
    expect(backfillEntry(raw, run)).toBeNull();
  });
});

describe("resolvePrNumber", () => {
  it("prefers the recorded pr field without calling gh", () => {
    let called = false;
    function run(): string {
      called = true;
      return "[]";
    }

    expect(resolvePrNumber(run, { pr: 42 })).toBe(42);
    expect(called).toBe(false);
  });

  it("returns null when there's neither a pr nor a branch", () => {
    expect(resolvePrNumber(() => "[]", {})).toBeNull();
  });
});
