// Canonical issue-key helpers — the single source of truth for deriving a
// Linear issue-key regex from a branch name or prose.
//
// Pure and zero-dependency by design: the host loads its own config and
// passes the configured keys in.

/**
 * Escape regex metacharacters so a configured key such as `C++` or `MY.KEY`
 * can't throw at construction or silently widen the match.
 */
export function escapeRegex(source: string): string {
  return source.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build the `\b(?:KEY|…)-\d+\b` matcher (global flag) from configured issue keys.
 *
 * Returns `null` when no keys are configured: an empty alternation would match
 * the empty string before every `-<digits>` and inject bogus links (e.g. `-2`).
 * A single key needs no `(?:…)` wrapper — only wrap when there's an alternation,
 * because the naive join `\bA|B-\d+\b` parses as `\bA` *or* `B-\d+\b` (matching a
 * bare `A` and missing `A-7`).
 */
export function buildIssueRe(keys: string[]): null | RegExp {
  if (!Array.isArray(keys) || keys.length === 0) {
    return null;
  }

  const alternation = keys.map(escapeRegex).join("|");
  const group = keys.length > 1 ? `(?:${alternation})` : alternation;
  return new RegExp(`\\b${group}-\\d+\\b`, "g");
}
