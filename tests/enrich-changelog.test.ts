import { enrichFrontmatter } from "../src/lib/enrich.js";
import type { EnrichInput } from "../src/lib/enrich.js";
import { parseFrontmatter } from "../src/lib/frontmatter.js";
import { describe, expect, it } from "vitest";

const BASE: EnrichInput = {
  additions: "10",
  branch: "asw-123-fix-a-thing",
  changedFiles: "3",
  commits: "4",
  deletions: "2",
  mergedAt: "2026-05-24T09:00:00Z",
  mergeSha: "abc1234def5678",
  prNumber: "42",
};

function placeholderEntry(): string {
  return [
    "---",
    'title: "Fix a thing"',
    'created_at: "2026-05-23T14:55:37Z"',
    'branch: "asw-123-fix-a-thing"',
    "merged_at:",
    "pr:",
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

describe("enrichFrontmatter", () => {
  it("fills merged_at, commit (7 chars), pr and overwrites stats", () => {
    const out = enrichFrontmatter(placeholderEntry(), BASE);
    const { data } = parseFrontmatter(out);
    expect(data.merged_at).toBe("2026-05-24T09:00:00Z");
    expect(data.commit).toBe("abc1234");
    expect(data.pr).toBe(42);
    expect(data.stats).toEqual({
      commits: 4,
      files_changed: 3,
      loc_added: 10,
      loc_removed: 2,
    });
  });

  it("never overwrites an already-set fill-once field (idempotent re-run)", () => {
    const first = enrichFrontmatter(placeholderEntry(), BASE);
    const second = enrichFrontmatter(first, {
      ...BASE,
      mergedAt: "2099-01-01T00:00:00Z",
      mergeSha: "9999999",
      prNumber: "999",
    });
    const { data } = parseFrontmatter(second);
    expect(data.merged_at).toBe("2026-05-24T09:00:00Z");
    expect(data.commit).toBe("abc1234");
    expect(data.pr).toBe(42);
  });

  it("re-running still overwrites stats authoritatively", () => {
    const first = enrichFrontmatter(placeholderEntry(), BASE);
    const second = enrichFrontmatter(first, {
      ...BASE,
      additions: "100",
      changedFiles: "9",
      deletions: "5",
    });
    const { data } = parseFrontmatter(second);
    expect(data.stats).toEqual({
      commits: 4,
      files_changed: 9,
      loc_added: 100,
      loc_removed: 5,
    });
  });

  it("writes stats.commits from the commits input", () => {
    const out = enrichFrontmatter(placeholderEntry(), {
      ...BASE,
      commits: "7",
    });
    expect(
      (parseFrontmatter(out).data.stats as { commits: number }).commits,
    ).toBe(7);
  });

  it("treats an empty-string commits input as absent (no NaN written)", () => {
    const out = enrichFrontmatter(placeholderEntry(), { ...BASE, commits: "" });
    expect(parseFrontmatter(out).data.stats).not.toHaveProperty("commits");
  });

  it("leaves created_at untouched", () => {
    const out = enrichFrontmatter(placeholderEntry(), BASE);
    expect(parseFrontmatter(out).data.created_at).toBe("2026-05-23T14:55:37Z");
  });

  it("emits double-quoted ISO timestamps (Prettier-compatible)", () => {
    // A-1308: enrich must not rewrite authored double-quoted timestamps into
    // single quotes that fail consumer `prettier --check`.
    const out = enrichFrontmatter(placeholderEntry(), BASE);
    expect(out).toContain('created_at: "2026-05-23T14:55:37Z"');
    expect(out).toContain('merged_at: "2026-05-24T09:00:00Z"');
    expect(out).not.toMatch(/created_at: '/);
    expect(out).not.toMatch(/merged_at: '/);
  });

  it("does not introduce an affected_packages field", () => {
    const out = enrichFrontmatter(placeholderEntry(), BASE);
    expect(parseFrontmatter(out).data).not.toHaveProperty("affected_packages");
  });

  it("treats empty-string stat inputs as absent (no NaN written)", () => {
    const out = enrichFrontmatter(placeholderEntry(), {
      additions: "",
      branch: BASE.branch,
      changedFiles: "",
      deletions: "",
      mergedAt: BASE.mergedAt,
      mergeSha: BASE.mergeSha,
    });
    expect(parseFrontmatter(out).data.stats).toEqual({});
  });

  it("throws when created_at is missing", () => {
    const raw = "---\ntitle: x\nbranch: b\n---\n\n## Fixed\n\n- x\n";
    expect(() => enrichFrontmatter(raw, BASE)).toThrow(/no created_at/);
  });

  it("skips optional fields that aren't provided", () => {
    const out = enrichFrontmatter(placeholderEntry(), {
      branch: BASE.branch,
      mergedAt: BASE.mergedAt,
      mergeSha: BASE.mergeSha,
    });
    const { data } = parseFrontmatter(out);
    expect(data.commit).toBe("abc1234");
    expect(data.merged_at).toBe(BASE.mergedAt);
    // pr stays as its (null) placeholder; stats stays empty.
    expect(data.pr ?? "").toBe("");
    expect(data.stats).toEqual({});
  });
});
