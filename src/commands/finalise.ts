// Release-time finalisation of changelog entries — in-repo via
// `reusable-changelog-enrich.yml` mode `finalise` / `changelog-core finalise`
// after release-please bumps package.json (A-801 retired the central orchestrator
// finalise). Reads the just-bumped version from package.json.
//
// For every entry that isn't finalised yet (empty `version`):
//   1. resolve its merged PR from the `branch` field via `gh` and enrich
//      (merged_at / commit / pr / stats);
//   2. stamp `version` with the just-bumped package.json version;
//   3. rewrite bare Linear IDs to links.
//
// The pure `finaliseEntry(raw, version, resolvePr)` is unit-testable with a fake
// resolver; main() wires the real `gh`/`git` resolver and walks the directory.
//
// Zero-dep: composes the package's own modules (lib/enrich, lib/stamp,
// add-links) and the frontmatter parser — no gray-matter, no tsx — so it runs
// under bare `node`. The Linear workspace/issue keys come from config.json via
// add-links, not hardcoded constants.

import { blank } from "../lib/blank.js";
import { isCliEntry } from "../lib/cli-entry.js";
import { nonMergeCommitCount, realRunner } from "../lib/commit-count.js";
import type { Runner } from "../lib/commit-count.js";
import { loadConfig } from "../lib/config.js";
import { enrichFrontmatter } from "../lib/enrich.js";
import { parseFrontmatter } from "../lib/frontmatter.js";
import { readPackageVersion, stampVersion } from "../lib/stamp.js";
import { rewriteBody, splitFrontmatter } from "./add-links.js";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { argv } from "node:process";

export type ResolvedPr = {
  additions: null | string;
  changedFiles: null | string;
  commits: null | string;
  deletions: null | string;
  mergedAt: string;
  mergeSha: string;
  prNumber: string;
};

/**
 * Resolve the merged PR for a branch, or null when none is found.
 */
export type PrResolver = (branch: string) => null | ResolvedPr;

/**
 * Finalise one entry's raw markdown for release. Returns the rewritten markdown,
 * or null when nothing changed (already finalised).
 */
export function finaliseEntry(
  raw: string,
  version: string,
  resolvePr: PrResolver,
): null | string {
  const fm = parseFrontmatter(raw).data;
  if (!blank(fm.version)) {
    return null; // already shipped in a release
  }

  let next = raw;

  const branch = typeof fm.branch === "string" ? fm.branch : "";
  // Include blank(fm.stats) so a hand-authored entry that pre-fills
  // merged_at/commit/pr but leaves stats blank still gets stats from the PR.
  // Also treat a populated-but-commits-less stats block as enrichable: an entry
  // finalised in the window between `stats` first existing (A-380) and
  // `stats.commits` being added (A-560) has every other field set, so without
  // the `stats.commits` check needsEnrich is false, enrich is skipped, the entry
  // is version-stamped, and the later version short-circuit makes the missing
  // `commits` un-backfillable through finalise forever (A-579).
  const stats =
    typeof fm.stats === "object" &&
    fm.stats !== null &&
    !Array.isArray(fm.stats)
      ? fm.stats
      : null;
  const needsEnrich =
    blank(fm.merged_at) ||
    blank(fm.commit) ||
    blank(fm.pr) ||
    blank(fm.stats) ||
    blank(stats?.commits);
  if (branch && needsEnrich) {
    const pr = resolvePr(branch);
    if (pr) {
      next = enrichFrontmatter(next, {
        additions: pr.additions,
        branch,
        changedFiles: pr.changedFiles,
        commits: pr.commits,
        deletions: pr.deletions,
        mergedAt: pr.mergedAt,
        mergeSha: pr.mergeSha,
        prNumber: pr.prNumber,
      });
    }
  }

  next = stampVersion(next, version) ?? next;

  const { body, fm: fmText } = splitFrontmatter(next);
  next = fmText + rewriteBody(body);

  return next === raw ? null : next;
}

/**
 * Build a PR resolver backed by `gh` (injectable runner for tests).
 */
export function makeResolver(run: Runner): PrResolver {
  function resolve(branch: string): null | ResolvedPr {
    const json = run("gh", [
      "pr",
      "list",
      "--head",
      branch,
      "--state",
      "merged",
      "--limit",
      "1",
      "--json",
      "number,mergedAt,additions,deletions,changedFiles,mergeCommit",
    ]);
    const list: unknown = JSON.parse(json);
    if (!Array.isArray(list) || list.length === 0) {
      return null;
    }

    const pr = list[0] as {
      additions?: number;
      changedFiles?: number;
      deletions?: number;
      mergeCommit?: { oid?: string };
      mergedAt?: string;
      number?: number;
    };
    const mergeSha = pr.mergeCommit?.oid ?? "";

    // Commit count is resolved separately (a second API call). Keep it
    // independently best-effort: a failure here leaves commits null but must NOT
    // discard the stats we already resolved, so it gets its own try/catch rather
    // than riding the outer one (which would null the whole ResolvedPr).
    let commits: null | string = null;
    if (pr.number !== undefined && pr.number !== null) {
      try {
        commits = nonMergeCommitCount(run, pr.number);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `⚠️  Could not resolve commit count for PR #${pr.number}: ${message}`,
        );
      }
    }

    // Absent numeric fields stay null (not ""), so the enrich guard skips them
    // rather than parsing "" into NaN.
    return {
      additions: pr.additions === undefined ? null : String(pr.additions),
      changedFiles:
        pr.changedFiles === undefined ? null : String(pr.changedFiles),
      commits,
      deletions: pr.deletions === undefined ? null : String(pr.deletions),
      mergedAt: pr.mergedAt ?? "",
      mergeSha,
      prNumber: String(pr.number ?? ""),
    };
  }

  return (branch) => {
    // Enrichment is best-effort metadata: a gh/git failure here must NOT abort
    // the release-please release-PR build and block the release. On any error,
    // warn and return null — the entry still gets version-stamped, just without
    // PR metadata.
    try {
      return resolve(branch);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`⚠️  Could not resolve PR for branch ${branch}: ${message}`);
      return null;
    }
  };
}

const USAGE = `finalise — release-time enrich + version-stamp the dated changelog/ entries

In-repo via \`reusable-changelog-enrich.yml\` mode \`finalise\` / \`changelog-core finalise\`
after release-please bumps package.json. Reads the just-bumped version, then for every
un-finalised entry: resolves its merged PR via \`gh\` to enrich (merged_at/commit/pr/stats),
stamps \`version\`, and rewrites bare Linear IDs to links. WRITES to changelog/ files.

Usage:
  changelog-core finalise            Finalise every un-finalised entry (writes; needs gh)
  changelog-core finalise --self-test  Run the built-in offline smoke test
  changelog-core finalise --help     Show this message (alias: -h)`;

// Offline smoke-test resolver — a fixed fake PR, no gh/git.
function fakeResolver(): ResolvedPr {
  return {
    additions: "10",
    changedFiles: "2",
    commits: "4",
    deletions: "3",
    mergedAt: "2026-01-02T00:00:00Z",
    mergeSha: "abcdef1234567890",
    prNumber: "42",
  };
}

// Offline smoke test: exercise the pure finaliseEntry with a fake resolver — no
// gh, no git, no real package.json, no filesystem writes.
function selfTest(): void {
  const cases: Array<{ name: string; ok: boolean }> = [];

  const unfinalised = `---
title: Sample
created_at: '2026-01-01T00:00:00Z'
merged_at:
branch: a-1-sample
pr:
commit:
version:
category: feature
breaking: false
stats:
  files_changed:
  loc_added:
  loc_removed:
---

## Added

- A thing.
`;
  const finalised = finaliseEntry(unfinalised, "1.2.3", () => fakeResolver());
  cases.push({
    name: "an un-finalised entry is rewritten",
    ok: typeof finalised === "string" && finalised !== unfinalised,
  });
  cases.push({
    name: "the bumped version is stamped",
    ok: typeof finalised === "string" && finalised.includes("version: 1.2.3"),
  });

  // An already-stamped entry is a no-op (returns null).
  const alreadyDone = (finalised ?? unfinalised).replace(/\n$/, "\n");
  cases.push({
    name: "an already-finalised entry returns null (no rewrite)",
    ok: finaliseEntry(alreadyDone, "1.2.3", () => fakeResolver()) === null,
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

  const config = loadConfig();
  const version = readPackageVersion(readFileSync("package.json", "utf8"));
  const resolvePr = makeResolver(realRunner);

  const files = readdirSync(config.changelogDir)
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .map((name) => join(config.changelogDir, name));

  let finalised = 0;
  for (const file of files) {
    const next = finaliseEntry(readFileSync(file, "utf8"), version, resolvePr);
    if (next !== null) {
      writeFileSync(file, next);
      finalised++;
      console.log(`finalised ${version}: ${file}`);
    }
  }

  console.log(
    `Changelog finalisation complete. ${finalised} entr${finalised === 1 ? "y" : "ies"} finalised with ${version}.`,
  );
}

// Only run the filesystem pass when invoked as a CLI, not when imported (e.g.
// by unit tests exercising finaliseEntry/makeResolver).
if (isCliEntry(import.meta.filename)) {
  main();
}
