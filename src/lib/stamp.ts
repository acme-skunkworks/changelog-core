// Pure helpers for release-time version stamping: set `version` on an entry
// that doesn't have one, and read the version from package.json.
//
// Library module (no CLI): the release-time orchestrator finalise composes
// these. Kept pure so they're trivially unit-testable. Zero-dep — uses the
// package's frontmatter parser.

import { blank } from "./blank.js";
import { parseFrontmatter, stringifyFrontmatter } from "./frontmatter.js";

/**
 * Stamp `version` onto an entry if it has none. Returns the rewritten markdown,
 * or null when the entry already has a version (no write needed).
 */
export function stampVersion(raw: string, version: string): null | string {
  const parsed = parseFrontmatter(raw);
  const fm = { ...parsed.data };
  if (!blank(fm.version)) {
    return null;
  }

  fm.version = version;
  return stringifyFrontmatter(parsed.content, fm);
}

/**
 * Read the `version` field from a package.json string.
 */
export function readPackageVersion(packageJsonRaw: string): string {
  const pkg: unknown = JSON.parse(packageJsonRaw);
  if (
    !pkg ||
    typeof pkg !== "object" ||
    Array.isArray(pkg) ||
    typeof (pkg as { version?: unknown }).version !== "string" ||
    (pkg as { version: string }).version.length === 0
  ) {
    throw new Error("package.json is missing a string `version`");
  }

  return (pkg as { version: string }).version;
}
