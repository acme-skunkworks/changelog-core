import { realpathSync } from "node:fs";
import { argv } from "node:process";

/**
 * True when the calling module is the process entry point — i.e. it was run as a
 * CLI, not imported (e.g. by unit tests exercising its pure helpers).
 *
 * Pass the caller's `import.meta.filename`. Both sides are resolved with
 * `realpathSync` so a symlinked entry point (macOS `/var`→`/private/var`, pnpm's
 * store) isn't a false negative that skips `main()`.
 */
export function isCliEntry(moduleFilename: string): boolean {
  const entry = argv[1];
  if (!entry) {
    return false;
  }

  try {
    return realpathSync(moduleFilename) === realpathSync(entry);
  } catch {
    return false;
  }
}
