// One-off backfill of `stats.commits` across the dated changelog backlog (A-560).
//
// The `commits` stat joins the existing post-merge stats rail (files_changed /
// loc_added / loc_removed), but those were only ever filled going forward by the
// release-time enrichment. This walks the existing `changelog/*.md` entries and
// stamps `stats.commits` for each one whose merged PR can be resolved, so the
// backlog carries the same field as new entries will.
//
// Deliberately narrow: it sets ONLY `stats.commits` and touches no other field —
// unlike `finalise`, which also stamps `version` (owned by release-please) and
// the other post-merge fields. Running finalise to backfill would mis-stamp the
// not-yet-finalised entries; this stays in its lane.
//
// Idempotent: re-running is a no-op once `stats.commits` matches the resolved
// count. Best-effort per entry — a gh/network failure on one entry warns and
// skips it rather than aborting the run.
//
// The new line is spliced into the raw `stats:` block textually rather than via
// a parse → re-serialise round-trip. Re-serialising would re-canonicalise the
// whole frontmatter (quote styles, inline-vs-block arrays) on older,
// differently-formatted entries — a noisy diff that buries the one line that
// actually changed. Textual insertion keeps each entry's diff to a single added
// line. (Release-time enrichment can re-serialise freely because it only runs on
// freshly-authored, already-canonical entries.)
//
// Zero-dep: composes the package's own lib modules and the frontmatter parser,
// so it runs under bare `node`.

import { isCliEntry } from "../lib/cli-entry.js";
import { nonMergeCommitCount } from "../lib/commit-count.js";
import type { Runner } from "../lib/commit-count.js";
import { loadConfig } from "../lib/config.js";
import { parseFrontmatter } from "../lib/frontmatter.js";
import type { FrontmatterData } from "../lib/frontmatter.js";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { argv } from "node:process";

function realRunner(cmd: string, args: readonly string[]): string {
  return execFileSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    timeout: 30_000,
  });
}

/**
 * Resolve the merged PR number for an entry: prefer the recorded `pr` field,
 * else look it up from the `branch`. Returns the number, or null when there's no
 * resolvable merged PR (e.g. an entry whose PR never merged or predates GitHub).
 * Throws (rather than returning null) if the gh output isn't valid JSON —
 * main()'s per-entry try/catch owns that, so a malformed response skips the
 * entry loudly instead of being mistaken for "no PR".
 */
export function resolvePrNumber(
  run: Runner,
  fm: FrontmatterData,
): null | number {
  if (typeof fm.pr === "number") {
    return fm.pr;
  }

  const branch = typeof fm.branch === "string" ? fm.branch : "";
  if (!branch) {
    return null;
  }

  const list: unknown = JSON.parse(
    run("gh", [
      "pr",
      "list",
      "--head",
      branch,
      "--state",
      "merged",
      "--limit",
      "1",
      "--json",
      "number",
    ]),
  );
  if (!Array.isArray(list) || list.length === 0) {
    return null;
  }

  const first = list[0] as { number?: number };
  return first.number ?? null;
}

/**
 * Splice a `commits: <n>` line into an entry's raw `stats:` block — replacing an
 * existing `commits:` line, else appending after the block's last child. When the
 * entry omits `stats` entirely (the contract allows it), synthesise a minimal
 * `stats:` block carrying just the commits count. Leaves every other byte of the
 * entry untouched.
 */
function setStatsCommits(raw: string, commits: number): string {
  const lines = raw.split("\n");
  if (lines[0]?.trim() !== "---") {
    throw new Error("entry has no frontmatter fence");
  }

  let fmEnd = -1;
  for (let index = 1; index < lines.length; index++) {
    if (lines[index]!.trim() === "---") {
      fmEnd = index;
      break;
    }
  }

  if (fmEnd === -1) {
    throw new Error("unterminated frontmatter");
  }

  let statsIndex = -1;
  for (let index = 1; index < fmEnd; index++) {
    if (/^stats:\s*$/.test(lines[index]!)) {
      statsIndex = index;
      break;
    }
  }

  if (statsIndex === -1) {
    // The contract lets an entry omit `stats` entirely (A-613). Rather than
    // throwing, synthesise a minimal block carrying just the commits count,
    // appended as the last frontmatter field (its canonical position) so no
    // existing line shifts. The other stats children stay absent — this script
    // sets only stats.commits.
    lines.splice(fmEnd, 0, "stats:", `  commits: ${commits}`);
    return lines.join("\n");
  }

  // Walk the indented children of the stats block. The first dedented (or
  // closing-fence) line ends it. Track the last child to append after, any
  // existing commits line to replace in place, and the child indent so an
  // inserted line nests under stats: at the same depth (don't hard-code two
  // spaces — a 4-space block would otherwise be mis-nested; A-581).
  let lastChild = statsIndex;
  let commitsIndex = -1;
  let childIndent: null | string = null;
  for (let index = statsIndex + 1; index < fmEnd; index++) {
    const line = lines[index]!;
    if (line.trim() === "") {
      continue;
    }

    const indentMatch = /^(\s+)/.exec(line);
    if (!indentMatch) {
      break;
    }

    if (childIndent === null) {
      childIndent = indentMatch[1]!;
    }

    lastChild = index;
    if (/^\s+commits:/.test(line)) {
      commitsIndex = index;
    }
  }

  // Fall back to two spaces only when the stats block has no children to mirror.
  const indent = childIndent ?? "  ";
  const newLine = `${indent}commits: ${commits}`;
  if (commitsIndex === -1) {
    lines.splice(lastChild + 1, 0, newLine);
  } else {
    lines[commitsIndex] = newLine;
  }

  return lines.join("\n");
}

/**
 * Pure backfill of a single entry's raw markdown. Returns the rewritten markdown
 * with `stats.commits` set, or null when nothing changed (unresolvable PR, or
 * the count already matches).
 */
export function backfillEntry(raw: string, run: Runner): null | string {
  const { data } = parseFrontmatter(raw);

  const prNumber = resolvePrNumber(run, data);
  if (prNumber === null) {
    return null;
  }

  const count = nonMergeCommitCount(run, prNumber);
  if (count === null) {
    return null;
  }

  const commits = Number.parseInt(count, 10);
  const existing =
    typeof data.stats === "object" &&
    data.stats !== null &&
    !Array.isArray(data.stats)
      ? data.stats.commits
      : undefined;
  if (existing === commits) {
    return null; // already backfilled with the same count
  }

  return setStatsCommits(raw, commits);
}

const USAGE = `backfill-commits — one-off backfill of stats.commits across the changelog backlog

Walks the dated changelog/ entries and stamps stats.commits for each one whose
merged PR resolves (via gh). Sets ONLY stats.commits; idempotent; best-effort per
entry. WRITES to changelog/ files unless --dry-run.

Usage:
  changelog-core backfill-commits            Backfill every resolvable entry (writes; needs gh)
  changelog-core backfill-commits --dry-run  Report what would change without writing
  changelog-core backfill-commits --help     Show this message (alias: -h)`;

export function main(): void {
  const args = argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    return;
  }

  const dryRun = args.includes("--dry-run");
  const config = loadConfig();
  const run = realRunner;

  const files = readdirSync(config.changelogDir)
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .map((name) => join(config.changelogDir, name));

  let changed = 0;
  let skipped = 0;
  for (const file of files) {
    let next: null | string = null;
    try {
      next = backfillEntry(readFileSync(file, "utf8"), run);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`⚠️  Skipped ${file}: ${message}`);
      skipped++;
      continue;
    }

    if (next === null) {
      continue;
    }

    if (dryRun) {
      console.log(`would backfill: ${file}`);
    } else {
      writeFileSync(file, next);
      console.log(`backfilled: ${file}`);
    }

    changed++;
  }

  console.log(
    `\n${dryRun ? "Would backfill" : "Backfilled"} ${changed} entr${
      changed === 1 ? "y" : "ies"
    }${skipped ? `, skipped ${skipped} on error` : ""}.`,
  );
}

// Only run the filesystem pass when invoked as a CLI, not when imported by
// tests.
if (isCliEntry(import.meta.filename)) {
  main();
}
