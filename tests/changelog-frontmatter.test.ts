import { buildAffectedPackagesFrontmatter } from "../src/commands/set-affected-packages.js";
import { findEntryByBranch } from "../src/lib/changelog.js";
// Edge-case throws and the affected_packages frontmatter rebuild.
import { parseFrontmatter } from "../src/lib/frontmatter.js";
import type { FrontmatterData } from "../src/lib/frontmatter.js";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("parseFrontmatter — inline arrays (bug 1)", () => {
  it("throws on an unterminated quoted inline-array item", () => {
    const raw = '---\nco_authors: ["Smith, Jr.]\n---\nbody\n';
    expect(() => parseFrontmatter(raw)).toThrow(/Unterminated quoted item/);
  });

  it("still parses a well-formed quoted inline array (comma inside quotes preserved)", () => {
    const raw = '---\nco_authors: ["Smith, Jr. <a@b>", bob]\n---\nbody\n';
    expect(parseFrontmatter(raw).data.co_authors).toEqual([
      "Smith, Jr. <a@b>",
      "bob",
    ]);
  });
});

describe("parseFrontmatter — block arrays (bug 2)", () => {
  it("does not emit null entries for blank lines between block-array items", () => {
    const raw =
      "---\n" +
      "co_authors:\n" +
      "  - alice@example.com\n" +
      "\n" +
      "  - bob@example.com\n" +
      "---\n" +
      "body\n";
    expect(parseFrontmatter(raw).data.co_authors).toEqual([
      "alice@example.com",
      "bob@example.com",
    ]);
  });

  it("parses a contiguous block array unchanged", () => {
    const raw = "---\nitems:\n  - a\n  - b\n  - c\n---\nbody\n";
    expect(parseFrontmatter(raw).data.items).toEqual(["a", "b", "c"]);
  });

  it("parses a block array whose first collected line is blank", () => {
    const raw = "---\nitems:\n\n  - a\n  - b\n---\nbody\n";
    expect(parseFrontmatter(raw).data.items).toEqual(["a", "b"]);
  });
});

describe("parseFrontmatter — block scalars (bug 3)", () => {
  it("yields an empty string for an all-whitespace folded block (no collapse to a newline run)", () => {
    const raw = "---\nrelease_note: >-\n   \n   \n---\nbody\n";
    expect(parseFrontmatter(raw).data.release_note).toBe("");
  });

  it("yields an empty string for an all-whitespace literal block", () => {
    const raw = "---\nrelease_note: |\n   \n   \n---\nbody\n";
    expect(parseFrontmatter(raw).data.release_note).toBe("");
  });

  it("still parses a normal folded block scalar", () => {
    const raw =
      "---\nrelease_note: >-\n  Hardened the parser\n  and link masking.\n---\nbody\n";
    expect(parseFrontmatter(raw).data.release_note).toBe(
      "Hardened the parser and link masking.",
    );
  });

  it("still preserves newlines in a normal literal block scalar", () => {
    const raw = "---\nrelease_note: |\n  line one\n  line two\n---\nbody\n";
    expect(parseFrontmatter(raw).data.release_note).toBe("line one\nline two");
  });
});

describe("findEntryByBranch — parse-error context (bug 6)", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "changelog-find-"));
  });

  afterEach(() => {
    rmSync(directory, { force: true, recursive: true });
  });

  it("names the offending file when an entry has malformed frontmatter", () => {
    // A frontmatter line with no `:` makes parseMapping throw.
    const bad = join(directory, "20260101-000000-bad.md");
    writeFileSync(bad, "---\nthis line has no colon\n---\nbody\n");
    expect(() => findEntryByBranch("any-branch", directory)).toThrow(
      /Failed to parse changelog frontmatter in .*20260101-000000-bad\.md/,
    );
  });

  it("returns the matching entry path for a well-formed corpus", () => {
    const good = join(directory, "20260101-000000-good.md");
    writeFileSync(good, "---\nbranch: my-branch\n---\nbody\n");
    expect(findEntryByBranch("my-branch", directory)).toBe(good);
    expect(findEntryByBranch("other-branch", directory)).toBeNull();
  });
});

describe("buildAffectedPackagesFrontmatter — destructive-overwrite guard (bug 5)", () => {
  it("throws when the parsed data is empty (no branch key)", () => {
    expect(() => buildAffectedPackagesFrontmatter({}, ["web"])).toThrow(
      /missing the `branch` key/,
    );
  });

  it("throws when data lacks the branch key but has other fields", () => {
    expect(() =>
      buildAffectedPackagesFrontmatter({ title: "x" }, ["web"]),
    ).toThrow(/missing the `branch` key/);
  });

  it("inserts affected_packages immediately before stats for a valid entry", () => {
    // Input key order is load-bearing: the function preserves insertion order
    // and slots affected_packages in just before `stats`. Build the fixture by
    // assignment so its branch→title→stats order survives (an inline literal
    // would be alphabetised by the sort-objects lint).
    const entry: FrontmatterData = {};
    entry.branch = "my-branch";
    entry.title = "x";
    entry.stats = { added: 1 };

    const fm = buildAffectedPackagesFrontmatter(entry, ["api", "web"]);
    expect(Object.keys(fm)).toEqual([
      "branch",
      "title",
      "affected_packages",
      "stats",
    ]);
    expect(fm.affected_packages).toEqual(["api", "web"]);
  });

  it("appends affected_packages when there is no stats anchor", () => {
    const fm = buildAffectedPackagesFrontmatter(
      { branch: "my-branch", title: "x" },
      ["web"],
    );
    expect(Object.keys(fm)).toEqual(["branch", "title", "affected_packages"]);
  });

  it("replaces an existing affected_packages in its canonical slot", () => {
    // Build by assignment so the branch→affected_packages→stats order is
    // preserved (an inline literal would be alphabetised by sort-objects).
    const entry: FrontmatterData = {};
    entry.branch = "my-branch";
    entry.affected_packages = ["stale"];
    entry.stats = { added: 1 };

    const fm = buildAffectedPackagesFrontmatter(entry, ["fresh"]);
    expect(Object.keys(fm)).toEqual(["branch", "affected_packages", "stats"]);
    expect(fm.affected_packages).toEqual(["fresh"]);
  });
});
