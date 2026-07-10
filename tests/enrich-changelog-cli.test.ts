import { enrichEntry, readEnvironmentInput } from "../src/commands/enrich.js";
import { parseFrontmatter } from "../src/lib/frontmatter.js";
import { describe, expect, it } from "vitest";

// The env-var interface enrich-changelogs.yml passes, one run per merged entry.
const ENV = {
  ADDITIONS: "10",
  BRANCH_NAME: "asw-123-fix-a-thing",
  CHANGED_FILES: "3",
  DELETIONS: "2",
  MERGE_SHA: "abc1234def5678",
  MERGED_AT: "2026-05-24T09:00:00Z",
  PR_NUMBER: "42",
};

function placeholderEntry(): string {
  return [
    "---",
    'title: "Fix a thing"',
    'created_at: "2026-05-23T14:55:37Z"',
    'branch: "asw-123-fix-a-thing"',
    "merged_at:",
    "pr: 42",
    "commit:",
    "category: fix",
    "breaking: false",
    "---",
    "",
    "## Fixed",
    "",
    "- A thing",
    "",
  ].join("\n");
}

describe("readEnvironmentInput", () => {
  it("maps the full env-var interface to an EnrichInput", () => {
    expect(readEnvironmentInput(ENV)).toEqual({
      additions: "10",
      branch: "asw-123-fix-a-thing",
      changedFiles: "3",
      deletions: "2",
      mergedAt: "2026-05-24T09:00:00Z",
      mergeSha: "abc1234def5678",
      prNumber: "42",
    });
  });

  it("turns absent and empty-string vars into null (so blank() guards fire)", () => {
    const input = readEnvironmentInput({
      BRANCH_NAME: "asw-1-x",
      CHANGED_FILES: "", // empty string must become null, not "" (no NaN downstream)
      MERGE_SHA: "abc1234",
      MERGED_AT: "2026-05-24T09:00:00Z",
      // ADDITIONS / DELETIONS / PR_NUMBER absent entirely
    });
    expect(input).toEqual({
      additions: null,
      branch: "asw-1-x",
      changedFiles: null,
      deletions: null,
      mergedAt: "2026-05-24T09:00:00Z",
      mergeSha: "abc1234",
      prNumber: null,
    });
  });
});

describe("enrichEntry", () => {
  it("fills merged_at, commit (7 chars) and stats; keeps the authored pr", () => {
    const out = enrichEntry(placeholderEntry(), readEnvironmentInput(ENV));
    expect(out).not.toBeNull();
    const { data } = parseFrontmatter(out as string);
    expect(data.merged_at).toBe("2026-05-24T09:00:00Z");
    expect(data.commit).toBe("abc1234");
    expect(data.pr).toBe(42);
    expect(data.stats).toEqual({
      files_changed: 3,
      loc_added: 10,
      loc_removed: 2,
    });
  });

  it("returns null on an already-enriched entry (idempotent no-op)", () => {
    const once = enrichEntry(placeholderEntry(), readEnvironmentInput(ENV));
    expect(enrichEntry(once as string, readEnvironmentInput(ENV))).toBeNull();
  });

  it("re-running never overwrites a fill-once field but re-stamps stats authoritatively", () => {
    const once = enrichEntry(
      placeholderEntry(),
      readEnvironmentInput(ENV),
    ) as string;
    const again = enrichEntry(
      once,
      readEnvironmentInput({
        ...ENV,
        ADDITIONS: "100",
        CHANGED_FILES: "9",
        DELETIONS: "5",
        MERGE_SHA: "9999999",
        MERGED_AT: "2099-01-01T00:00:00Z",
      }),
    );
    // Stats changed, so it's not a no-op; fill-once fields stay put.
    expect(again).not.toBeNull();
    const { data } = parseFrontmatter(again as string);
    expect(data.merged_at).toBe("2026-05-24T09:00:00Z");
    expect(data.commit).toBe("abc1234");
    expect(data.stats).toEqual({
      files_changed: 9,
      loc_added: 100,
      loc_removed: 5,
    });
  });

  it("leaves pr as a placeholder when only the required vars are set", () => {
    const input = readEnvironmentInput({
      BRANCH_NAME: "asw-123-fix-a-thing",
      MERGE_SHA: "abc1234def5678",
      MERGED_AT: "2026-05-24T09:00:00Z",
    });
    const raw = placeholderEntry().replace("pr: 42", "pr:");
    const out = enrichEntry(raw, input);
    const { data } = parseFrontmatter(out as string);
    expect(data.commit).toBe("abc1234");
    expect(data.merged_at).toBe("2026-05-24T09:00:00Z");
    // pr stays as its (null) placeholder; stats stays empty.
    expect(data.pr ?? "").toBe("");
    expect(data.stats).toEqual({});
  });

  it("leaves created_at untouched and introduces no affected_packages", () => {
    const out = enrichEntry(placeholderEntry(), readEnvironmentInput(ENV));
    const { data } = parseFrontmatter(out as string);
    expect(data.created_at).toBe("2026-05-23T14:55:37Z");
    expect(data).not.toHaveProperty("affected_packages");
  });
});
