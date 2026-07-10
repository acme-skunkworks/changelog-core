// Validates the individual dated changelog entries under `changelog/`.
//
// The single authored changelog validator (A-369): this is the only copy —
// the root `validate:changelog` script and consumers both run it.
//   - `version` is accepted (typed-when-present semver string).
//   - `affected_packages` is accepted (typed-when-present string array) — owned
//     by the merge-time set-affected-packages step on monorepo consumers.
//   - the REQUIRED set is relaxed to title/created_at/category/breaking so that
//     both backfilled historical entries (no branch/author/stats) and in-flight
//     entries (no version/merged_at/pr/commit/stats until enriched) validate.
//
// The pure `validateEntry(name, raw)` returns an array of error strings (empty
// means valid), so it's trivially unit-testable; main() walks the directory.
// Zero-dep — Node built-ins + the package's frontmatter parser.

import { isCliEntry } from "../lib/cli-entry.js";
import { loadConfig } from "../lib/config.js";
import { parseFrontmatter } from "../lib/frontmatter.js";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { argv } from "node:process";

const FILENAME_RE = /^(\d{8})-(\d{6})-([a-z0-9-]+)\.md$/;
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
// SemVer 2.0.0: prerelease and build identifiers are dot-separated and may
// contain ASCII alphanumerics and hyphens (e.g. 1.2.3-rc-1, 1.2.3+build-45).
const SEMVER_RE =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const SHA7_RE = /^[0-9a-f]{7}$/;
const ISSUE_RE = /^[A-Z]+-\d+$/;
const CATEGORIES = new Set([
  "chore",
  "docs",
  "feature",
  "fix",
  "perf",
  "refactor",
]);
const SECTION_RE = /^##\s+(Breaking|Added|Changed|Fixed)\b/m;

const REQUIRED = ["title", "created_at", "category", "breaking"] as const;

/**
 * True when a value is set to something meaningful (not null/undefined/"").
 */
function present(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isNonNegInt(value: unknown): boolean {
  return isInt(value) && value >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function asIso(value: unknown): string {
  // The frontmatter parser only ever yields strings for timestamps, so a
  // non-string is treated as absent.
  return typeof value === "string" ? value : "";
}

/**
 * Validate one entry. Returns an array of human-readable error strings.
 */
export function validateEntry(name: string, raw: string): string[] {
  const errors: string[] = [];
  function fail(message: string): void {
    errors.push(`${name}: ${message}`);
  }

  if (!FILENAME_RE.test(name)) {
    fail("filename must match YYYYMMDD-HHMMSS-<slug>.md (slug: [a-z0-9-]+)");
    return errors;
  }

  let parsed;
  try {
    parsed = parseFrontmatter(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`frontmatter unparseable: ${message}`);
    return errors;
  }

  const fm = parsed.data ?? {};
  const body = parsed.content ?? "";

  for (const key of REQUIRED) {
    if (!(key in fm)) {
      fail(`missing required field: ${key}`);
    }
  }

  if (
    "title" in fm &&
    (typeof fm.title !== "string" || fm.title.trim() === "")
  ) {
    fail("title must be a non-empty string");
  }

  if (
    "release_note" in fm &&
    fm.release_note !== null &&
    typeof fm.release_note !== "string"
  ) {
    fail("release_note must be a string or null when present");
  }

  if (
    present(fm.version) &&
    (typeof fm.version !== "string" || !SEMVER_RE.test(fm.version))
  ) {
    fail(
      `version must be a semver string when set (got ${JSON.stringify(fm.version)})`,
    );
  }

  if ("created_at" in fm && !ISO_UTC_RE.test(asIso(fm.created_at))) {
    fail(
      `created_at must be ISO 8601 UTC with Z suffix (got ${JSON.stringify(fm.created_at)})`,
    );
  }

  if (present(fm.merged_at) && !ISO_UTC_RE.test(asIso(fm.merged_at))) {
    fail("merged_at must be ISO 8601 UTC with Z suffix when set");
  }

  if (
    "branch" in fm &&
    (typeof fm.branch !== "string" || fm.branch.trim() === "")
  ) {
    fail("branch must be a non-empty string when present");
  }

  if (present(fm.pr) && !isInt(fm.pr)) {
    fail("pr must be an integer when set");
  }

  if (present(fm.commit) && !SHA7_RE.test(String(fm.commit))) {
    fail("commit must be a 7-char hex SHA when set");
  }

  if (
    "author" in fm &&
    (typeof fm.author !== "string" || fm.author.trim() === "")
  ) {
    fail("author must be a non-empty string when present");
  }

  if ("co_authors" in fm && !isStringArray(fm.co_authors)) {
    fail("co_authors must be an array of strings (use [] when none)");
  }

  if ("category" in fm && !CATEGORIES.has(String(fm.category))) {
    fail(`category must be one of: ${[...CATEGORIES].join(", ")}`);
  }

  if ("breaking" in fm && typeof fm.breaking !== "boolean") {
    fail("breaking must be a boolean");
  }

  if ("issues" in fm) {
    if (isStringArray(fm.issues)) {
      for (const id of fm.issues) {
        if (!ISSUE_RE.test(id)) {
          fail(`issues entry ${JSON.stringify(id)} must match [A-Z]+-\\d+`);
        }
      }
    } else {
      fail("issues must be an array of strings when present");
    }
  }

  // affected_packages is owned by the merge-time set-affected-packages step on
  // monorepo consumers. The author emits an empty array as a placeholder; the
  // step overwrites it with the canonical list derived from the PR diff. Only
  // enforce structure (string array) when present.
  if (
    "affected_packages" in fm &&
    fm.affected_packages !== null &&
    !isStringArray(fm.affected_packages)
  ) {
    fail(
      "affected_packages must be an array of strings (use [] when unpopulated)",
    );
  }

  // PR stats live under stats: { files_changed, loc_added, loc_removed, commits }.
  const statKeys = ["files_changed", "loc_added", "loc_removed", "commits"];
  for (const key of statKeys) {
    if (key in fm) {
      fail(`${key} must be under stats, not top-level`);
    }
  }

  // stats is optional (filled by enrichment), but must be a well-formed object
  // with non-negative integer values when present.
  if (present(fm.stats)) {
    if (typeof fm.stats !== "object" || Array.isArray(fm.stats)) {
      fail("stats must be an object");
    } else {
      const stats = fm.stats as Record<string, unknown>;
      for (const key of statKeys) {
        if (key in stats && present(stats[key]) && !isNonNegInt(stats[key])) {
          fail(`stats.${key} must be a non-negative integer when set`);
        }
      }
    }
  }

  // The schema requires "## Breaking" to be the FIRST body section when
  // breaking: true — not merely present somewhere.
  if (fm.breaking === true) {
    const firstSection = body.match(/^##\s+([A-Za-z]+)\b/m)?.[1];
    if (firstSection !== "Breaking") {
      fail('breaking: true requires "## Breaking" as the first body section');
    }
  }

  if (!SECTION_RE.test(body)) {
    fail(
      "body must contain at least one of: ## Breaking | ## Added | ## Changed | ## Fixed",
    );
  }

  return errors;
}

const USAGE = `validate — validate the dated changelog/ entries against the contract

Usage:
  changelog-core validate            Validate every changelog/<ts>-<slug>.md entry
  changelog-core validate --self-test  Run the built-in offline smoke test
  changelog-core validate --help     Show this message (alias: -h)

Exits 1 when an entry is invalid, 2 when the changelog directory is missing.`;

// Offline smoke test: run the pure validateEntry over a known-good and a
// known-bad entry. This is a light check that the exported logic is wired up,
// with no filesystem or network access.
function selfTest(): void {
  const cases: Array<{ name: string; ok: boolean }> = [];

  const goodName = "20260101-000000-a-1-sample.md";
  const goodRaw = `---
title: A sample entry
created_at: '2026-01-01T00:00:00Z'
category: feature
breaking: false
---

## Added

- Something.
`;
  cases.push({
    name: "a well-formed entry produces no errors",
    ok: validateEntry(goodName, goodRaw).length === 0,
  });

  cases.push({
    name: "a bad filename is rejected",
    ok: validateEntry("not-a-valid-name.md", goodRaw).length > 0,
  });

  const badCategory = goodRaw.replace("category: feature", "category: nope");
  cases.push({
    name: "an unknown category is rejected",
    ok: validateEntry(goodName, badCategory).length > 0,
  });

  const missingSection = `---
title: No body section
created_at: '2026-01-01T00:00:00Z'
category: docs
breaking: false
---

Just prose, no heading.
`;
  cases.push({
    name: "a body with no recognised section is rejected",
    ok: validateEntry(goodName, missingSection).length > 0,
  });

  let failed = 0;
  for (const { name, ok } of cases) {
    if (ok) {
      console.log(`  ok    ${name}`);
    } else {
      failed += 1;
      console.log(`  FAIL  ${name}`);
    }
  }

  console.log(`\n${cases.length - failed}/${cases.length} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

function listEntries(directory: string): string[] {
  let stat;
  try {
    stat = statSync(directory);
  } catch {
    console.error(`changelog directory not found: ${directory}`);
    process.exit(2);
  }

  if (!stat.isDirectory()) {
    console.error(`${directory} is not a directory`);
    process.exit(2);
  }

  return readdirSync(directory)
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .map((name) => join(directory, name));
}

export function main(): void {
  const args = argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    return;
  }

  if (args.includes("--self-test")) {
    selfTest();
    return;
  }

  const files = listEntries(loadConfig().changelogDir);
  const errors: string[] = [];
  for (const file of files) {
    errors.push(...validateEntry(basename(file), readFileSync(file, "utf8")));
  }

  if (errors.length > 0) {
    console.error(
      `Changelog validation failed with ${errors.length} error(s):\n`,
    );
    for (const message of errors) {
      console.error(`  - ${message}`);
    }

    process.exit(1);
  }

  console.log(
    `Changelog validation passed (${files.length} entr${files.length === 1 ? "y" : "ies"} checked).`,
  );
}

// Only run the filesystem pass when invoked as a CLI, not when imported (e.g.
// by unit tests exercising validateEntry).
if (isCliEntry(import.meta.filename)) {
  main();
}
