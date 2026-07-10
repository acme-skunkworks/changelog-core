import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const packageVersion = (
  JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    version: string;
  }
).version;

describe("changelog-core --version", () => {
  it("prints the package.json version", () => {
    const stdout = execFileSync(
      process.execPath,
      ["--import", "tsx", join(root, "src/cli.ts"), "--version"],
      { cwd: root, encoding: "utf8" },
    ).trim();

    expect(stdout).toBe(packageVersion);
  });
});
