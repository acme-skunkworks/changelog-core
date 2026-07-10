// Imports the BUNDLE scripts directly (the distributed `.mjs`). The empty-data
// overwrite guard and the canonical-slot insertion are covered against the
// bundle in ./changelog-frontmatter.test.ts; this suite
// covers the path->package derivation feeding the rebuild and the idempotent
// overwrite of an existing affected_packages.
import { buildAffectedPackagesFrontmatter } from "../src/commands/set-affected-packages.js";
import { derivePackagesFromPaths } from "../src/lib/derive-packages.js";
import { describe, expect, it } from "vitest";

const DERIVE_OPTS = {
  changelogDir: "changelog",
  fallbackPackage: "infrastructure",
  packageRoots: ["skills"],
};

describe("affected_packages derivation -> frontmatter", () => {
  it("derives package names from changed paths and writes them in the canonical slot", () => {
    const packages = derivePackagesFromPaths(
      [
        "skills/changelog/scripts/add-links.mjs",
        "skills/send-it/SKILL.md",
        "infrastructure/scripts/validate-skills.ts",
      ],
      DERIVE_OPTS,
    );
    expect(packages).toEqual(["changelog", "infrastructure", "send-it"]);

    const fm = buildAffectedPackagesFrontmatter(
      { branch: "my-branch", stats: { files_changed: 3 } },
      packages,
    );
    // affected_packages lands immediately before stats.
    expect(Object.keys(fm)).toEqual(["branch", "affected_packages", "stats"]);
    expect(fm.affected_packages).toEqual([
      "changelog",
      "infrastructure",
      "send-it",
    ]);
  });

  it("idempotently overwrites an existing affected_packages with the freshly derived set", () => {
    const stale = {
      affected_packages: ["old-package"],
      branch: "my-branch",
      stats: { files_changed: 1 },
    };
    const fresh = derivePackagesFromPaths(
      ["skills/changelog/SKILL.md"],
      DERIVE_OPTS,
    );
    const fm = buildAffectedPackagesFrontmatter(stale, fresh);
    expect(fm.affected_packages).toEqual(["changelog"]);
    // The key keeps its canonical position (before stats), not its old slot.
    expect(Object.keys(fm)).toEqual(["branch", "affected_packages", "stats"]);

    // Re-running over the already-rebuilt object yields the same result.
    const again = buildAffectedPackagesFrontmatter(fm, fresh);
    expect(again).toEqual(fm);
  });

  it("falls back to the fallback package for paths outside the package roots", () => {
    const packages = derivePackagesFromPaths(
      ["README.md", "package.json", ".github/workflows/release.yml"],
      DERIVE_OPTS,
    );
    expect(packages).toEqual(["infrastructure"]);
  });

  it("appends affected_packages when there is no stats anchor", () => {
    const fm = buildAffectedPackagesFrontmatter(
      { branch: "my-branch", title: "x" },
      ["changelog"],
    );
    expect(Object.keys(fm)).toEqual(["branch", "title", "affected_packages"]);
    expect(fm.affected_packages).toEqual(["changelog"]);
  });
});
