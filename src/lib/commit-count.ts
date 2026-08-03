// Resolve a merged PR's commit count EXCLUDING merge commits, via the GitHub
// REST commits endpoint. Shared by finalise (release-time enrichment) and
// backfill-commits (the one-off backlog backfill) — A-560.
//
// Works for both squash and merge-commit trunk strategies (A-825):
//
// - **Squash:** the per-commit count is lost from local trunk history (the PR
//   lands as a single-parent squash SHA), but the PR commits endpoint still
//   returns the original branch commits post-merge, so the count stays
//   recoverable.
// - **Merge commits on trunk:** branch history is preserved on `main`; the same
//   PR commits endpoint still yields the authored (non-merge) count. Excluding
//   commits with more than one parent also drops the merge commit itself and
//   any `main`-merge upkeep commits on the branch.
//
// In both cases the REST commit object's `parents` array is the reliable signal
// (`gh pr view --json commits` omits parent data).
//
// Runner-injectable `(cmd, args) -> stdout`, mirroring finalise's makeResolver,
// so it's unit-testable with a fake runner and never reaches the network in
// tests. `gh api --paginate` substitutes `{owner}`/`{repo}` from the repo's
// remote and merges the paged arrays, so PRs with more than one page of commits
// still count correctly.

import { execFileSync } from "node:child_process";

export type Runner = (cmd: string, args: readonly string[]) => string;

/**
 * Default Runner backed by `execFileSync` — shared by finalise and
 * backfill-commits so the timeout / stdio options can't drift.
 */
export function realRunner(cmd: string, args: readonly string[]): string {
  return execFileSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    // Fail fast if gh/git stalls (network/auth). Enrichment is best-effort, so
    // a timeout throws → callers' try/catch falls back rather than hanging the
    // release until the whole job times out.
    timeout: 30_000,
  });
}

/**
 * Count a merged PR's commits, excluding merge commits (more than one parent).
 * Returns the non-merge commit count as a string, or null when the response
 * isn't an array. Throws (rather than returning null) if the gh output isn't
 * valid JSON — a network/auth failure must surface to the caller, not be
 * silently recorded as a count; both callers own that (finalise's resolver and
 * backfill's main() each wrap the call).
 */
export function nonMergeCommitCount(
  run: Runner,
  prNumber: number | string,
): null | string {
  const json = run("gh", [
    "api",
    "--paginate",
    `repos/{owner}/{repo}/pulls/${prNumber}/commits`,
  ]);
  const commits: unknown = JSON.parse(json);
  if (!Array.isArray(commits)) {
    return null;
  }

  // Exclude only commits we can positively identify as merges (>1 parent). The
  // REST commits endpoint always includes `parents`, so a missing/malformed
  // `parents` is anomalous — treat it as 0 parents (a normal commit) so we err
  // toward counting authored work rather than silently dropping it; a real merge
  // always arrives with its two parents present.
  const count = commits.filter((commit: unknown) => {
    const parents =
      commit !== null &&
      typeof commit === "object" &&
      "parents" in commit &&
      Array.isArray((commit as { parents: unknown }).parents)
        ? (commit as { parents: unknown[] }).parents
        : [];
    return parents.length <= 1;
  }).length;
  return String(count);
}
