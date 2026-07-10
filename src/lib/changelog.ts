// Shared helpers for locating changelog entries on disk.
//
// `findEntryByBranch` is the one entry-lookup rule the enrichment scripts share,
// so the rule can't drift between callers — the same reasoning that produced
// derive-packages.ts.

import { parseFrontmatter } from "./frontmatter.js";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_CHANGELOG_DIR = "changelog";

/**
 * Find the changelog entry whose frontmatter `branch:` equals `branch`.
 * Returns the matching entry's path, or null if none matches.
 */
export function findEntryByBranch(
  branch: string,
  changelogDirectory = DEFAULT_CHANGELOG_DIR,
): null | string {
  let names: string[];
  try {
    names = readdirSync(changelogDirectory);
  } catch (error) {
    // A repo with no `changelog/` directory yet means "no entry found", not a
    // crash — callers (e.g. set-affected-packages) already handle null.
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return null;
    }

    throw error;
  }

  const files = names
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .map((name) => join(changelogDirectory, name));
  for (const entryPath of files) {
    let data;
    try {
      ({ data } = parseFrontmatter(readFileSync(entryPath, "utf8")));
    } catch (error) {
      // Rethrow with the offending file named — the raw parser error carries no
      // filename, so a malformed entry anywhere in the corpus is hard to locate.
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to parse changelog frontmatter in ${entryPath}: ${message}`,
      );
    }

    if (data?.branch === branch) {
      return entryPath;
    }
  }

  return null;
}
