// Pure enrichment of a changelog entry's frontmatter — fills the fields that
// are only knowable once the PR has merged (merged_at / commit / pr) plus
// authoritative stats. `version` is filled separately by lib/stamp.
// created_at is never touched.
//
// This is a library module (no CLI): the release-time orchestrator finalise
// composes it with the PR data it resolves from `gh`. Kept pure so it's
// trivially unit-testable. Zero-dep — uses the package's frontmatter parser.

import { parseFrontmatter, stringifyFrontmatter } from "./frontmatter.js";

export type EnrichInput = {
  additions?: null | string;
  /**
   * Feature branch name — the stable lookup key.
   */
  branch: string;
  changedFiles?: null | string;
  /**
   * Non-merge commit count as a string, or null.
   */
  commits?: null | string;
  deletions?: null | string;
  /**
   * PR merged_at timestamp (ISO 8601 UTC).
   */
  mergedAt: string;
  /**
   * Merge commit SHA (full or short); only the first 7 chars are stored.
   */
  mergeSha: string;
  prNumber?: null | string;
};

/**
 * True when a value is unset (null/undefined/"").
 */
function blank(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

/**
 * Apply enrichment to a single entry's raw markdown and return the rewritten
 * markdown. Fill-once for merged_at/commit/pr; authoritative overwrite for
 * stats. created_at is never touched.
 */
export function enrichFrontmatter(raw: string, input: EnrichInput): string {
  const parsed = parseFrontmatter(raw);
  const fm = { ...parsed.data };

  if (!fm.created_at) {
    throw new Error("entry has no created_at; refusing to enrich");
  }

  const shortSha = input.mergeSha.slice(0, 7);

  if (blank(fm.merged_at)) {
    fm.merged_at = input.mergedAt;
  }

  if (blank(fm.commit)) {
    fm.commit = shortSha;
  }

  if (blank(fm.pr) && input.prNumber) {
    fm.pr = Number.parseInt(input.prNumber, 10);
  }

  // Authoritative overwrites from the GH API, always under stats: { ... }.
  const stats =
    typeof fm.stats === "object" &&
    fm.stats !== null &&
    !Array.isArray(fm.stats)
      ? { ...fm.stats }
      : {};
  // Guard with blank() (not just null/undefined): an empty string would slip
  // through and Number.parseInt("", 10) is NaN, which the validator rejects.
  if (!blank(input.additions)) {
    stats.loc_added = Number.parseInt(input.additions!, 10);
  }

  if (!blank(input.deletions)) {
    stats.loc_removed = Number.parseInt(input.deletions!, 10);
  }

  if (!blank(input.changedFiles)) {
    stats.files_changed = Number.parseInt(input.changedFiles!, 10);
  }

  if (!blank(input.commits)) {
    stats.commits = Number.parseInt(input.commits!, 10);
  }

  fm.stats = stats;

  return stringifyFrontmatter(parsed.content, fm);
}
