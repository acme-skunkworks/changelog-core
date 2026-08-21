/**
 * Public API for @acme-studio/changelog-core.
 *
 * Library helpers and command pure functions — the CLI lives in `cli.ts`.
 */

// --- commands (pure helpers) ------------------------------------------------

export {
  frontmatterBranch,
  rewriteBody,
  splitFrontmatter,
} from "./commands/add-links.js";
export { backfillEntry, resolvePrNumber } from "./commands/backfill-commits.js";
export {
  changelogEntryPattern,
  checkCompleteness,
  type CompletenessResult,
  hasChangelogEntry,
  isReleaseTriggering,
} from "./commands/check-completeness.js";
export { enrichEntry, readEnvironmentInput } from "./commands/enrich.js";
export {
  finaliseEntry,
  makeResolver,
  type PrResolver,
  type ResolvedPr,
} from "./commands/finalise.js";
export { buildAffectedPackagesFrontmatter } from "./commands/set-affected-packages.js";
export { validateEntry } from "./commands/validate.js";

// --- lib --------------------------------------------------------------------

export { blank } from "./lib/blank.js";
export { findEntryByBranch } from "./lib/changelog.js";
export { isCliEntry } from "./lib/cli-entry.js";
export {
  nonMergeCommitCount,
  realRunner,
  type Runner,
} from "./lib/commit-count.js";
export {
  type ChangelogConfig,
  loadConfig,
  parseConfig,
  resetConfigCache,
} from "./lib/config.js";
export {
  derivePackagesFromPaths,
  type DerivePackagesOptions,
} from "./lib/derive-packages.js";
export { enrichFrontmatter, type EnrichInput } from "./lib/enrich.js";
export {
  type FrontmatterData,
  type FrontmatterValue,
  type ParsedFrontmatter,
  parseFrontmatter,
  stringifyFrontmatter,
} from "./lib/frontmatter.js";
export { readPackageVersion, stampVersion } from "./lib/stamp.js";
export { buildIssueRe, escapeRegex } from "./lib/vendor/issue-keys.js";
