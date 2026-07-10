import { isCliEntry } from "../src/lib/cli-entry.js";
import {
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

// Exercises the BUNDLE helper directly (the distributed `.mjs`). isCliEntry backs
// the CLI guard for every changelog script, so its branches are covered here rather
// than only indirectly through each script's `--self-test`.
//
// Real files (and a real symlink) are used so every branch is genuinely hit: the
// symlink case proves resolution on both sides, and the mismatch case compares two
// distinct *resolvable* paths so it reaches the `===`-returns-false branch rather
// than the `catch`. `argv` inside the helper is `process.argv` (same array
// reference), so tests mutate `process.argv[1]` and restore it.
describe("isCliEntry", () => {
  const originalArgv1 = process.argv[1];
  let target = "";
  let link = "";
  let other = "";
  let missing = "";

  beforeAll(() => {
    // realpath the temp base: macOS tmpdir is /var → /private/var, and the helper
    // realpaths both sides, so anchoring on the resolved dir keeps comparisons clear.
    const directory = realpathSync(mkdtempSync(join(tmpdir(), "cli-entry-")));
    target = join(directory, "target.mjs");
    other = join(directory, "other.mjs");
    link = join(directory, "link.mjs");
    missing = join(directory, "does-not-exist.mjs");
    writeFileSync(target, "// entry\n");
    writeFileSync(other, "// a different real file\n");
    symlinkSync(target, link);
  });

  afterAll(() => {
    if (target) {
      rmSync(join(target, ".."), { force: true, recursive: true });
    }
  });

  afterEach(() => {
    process.argv[1] = originalArgv1;
  });

  it("returns true when the module path is the process entrypoint", () => {
    process.argv[1] = target;
    expect(isCliEntry(target)).toBe(true);
  });

  it("returns true when a symlinked module path resolves to the entrypoint", () => {
    // argv[1] is the real target; the module is reached via a symlink to it. Only
    // realpath resolution on both sides makes these compare equal.
    process.argv[1] = target;
    expect(isCliEntry(link)).toBe(true);
  });

  it("returns false via the comparison when two distinct real paths differ", () => {
    // Both paths resolve cleanly (no throw), so this reaches the `===` branch
    // returning false — an inverted comparison would be caught here, not by the
    // unresolvable-path test below.
    process.argv[1] = target;
    expect(isCliEntry(other)).toBe(false);
  });

  it("returns false when there is no entrypoint (imported, not run)", () => {
    process.argv[1] = "";
    expect(isCliEntry(target)).toBe(false);
  });

  it("returns false when a path cannot be resolved (realpathSync throws)", () => {
    process.argv[1] = target;
    expect(isCliEntry(missing)).toBe(false);
  });
});
