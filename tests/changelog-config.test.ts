// Imports the BUNDLE loader directly (the distributed `.mjs`). `parseConfig` is
// exported so the fail-loud contract is testable without filesystem setup.
import { parseConfig } from "../src/lib/config.js";
import { describe, expect, it } from "vitest";

const VALID = {
  issueKeys: ["A"],
  linearWorkspaceSlug: "rheged-studio",
};

function raw(object: unknown): string {
  return JSON.stringify(object);
}

describe("parseConfig", () => {
  it("merges structural defaults over a minimal valid config", () => {
    expect(parseConfig(raw(VALID))).toEqual({
      affectedPackages: false,
      baseBranch: "main",
      changelogDir: "changelog",
      fallbackPackage: "infrastructure",
      issueKeys: ["A"],
      linearWorkspaceSlug: "rheged-studio",
      packageRoots: ["apps", "packages", "services"],
    });
  });

  it("defaults affectedPackages off and accepts an explicit boolean", () => {
    // Off by default — single-package repos must not emit affected_packages.
    expect(parseConfig(raw(VALID)).affectedPackages).toBe(false);
    // Monorepos opt in.
    expect(
      parseConfig(raw({ ...VALID, affectedPackages: true })).affectedPackages,
    ).toBe(true);
  });

  it("fails loudly when affectedPackages is not a boolean", () => {
    expect(() =>
      parseConfig(raw({ ...VALID, affectedPackages: "yes" })),
    ).toThrow(/affectedPackages/);
  });

  it("lets config override the structural defaults", () => {
    const out = parseConfig(
      raw({ ...VALID, changelogDir: "history", packageRoots: ["modules"] }),
    );
    expect(out.changelogDir).toBe("history");
    expect(out.packageRoots).toEqual(["modules"]);
  });

  it("throws on malformed JSON", () => {
    expect(() => parseConfig("{ not json")).toThrow();
  });

  it("rejects a non-object JSON root (null / array / primitive)", () => {
    expect(() => parseConfig("null")).toThrow(/JSON object/);
    expect(() => parseConfig("42")).toThrow(/JSON object/);
    expect(() => parseConfig("[]")).toThrow(/JSON object/);
  });

  it("rejects blank (whitespace-only) string values", () => {
    expect(() =>
      parseConfig(raw({ issueKeys: ["A"], linearWorkspaceSlug: "   " })),
    ).toThrow(/linearWorkspaceSlug/);
    expect(() =>
      parseConfig(raw({ ...VALID, issueKeys: ["A", "  "] })),
    ).toThrow(/issueKeys/);
    expect(() =>
      parseConfig(raw({ ...VALID, packageRoots: ["apps", ""] })),
    ).toThrow(/packageRoots/);
  });

  it("fails loudly when issueKeys is missing", () => {
    expect(() => parseConfig(raw({ linearWorkspaceSlug: "x" }))).toThrow(
      /issueKeys/,
    );
  });

  it("fails loudly on an empty issueKeys array", () => {
    expect(() => parseConfig(raw({ ...VALID, issueKeys: [] }))).toThrow(
      /issueKeys/,
    );
  });

  it("fails loudly when issueKeys contains a non-string", () => {
    expect(() => parseConfig(raw({ ...VALID, issueKeys: ["A", 7] }))).toThrow(
      /issueKeys/,
    );
  });

  it("fails loudly when linearWorkspaceSlug is missing or empty", () => {
    expect(() => parseConfig(raw({ issueKeys: ["A"] }))).toThrow(
      /linearWorkspaceSlug/,
    );
    expect(() =>
      parseConfig(raw({ ...VALID, linearWorkspaceSlug: "" })),
    ).toThrow(/linearWorkspaceSlug/);
  });

  it("fails loudly on a mistyped structural key (packageRoots as string)", () => {
    expect(() => parseConfig(raw({ ...VALID, packageRoots: "apps" }))).toThrow(
      /packageRoots/,
    );
  });

  it("fails loudly on a mistyped baseBranch", () => {
    expect(() => parseConfig(raw({ ...VALID, baseBranch: 3 }))).toThrow(
      /baseBranch/,
    );
  });

  it("includes an actionable hint pointing at the config source", () => {
    expect(() => parseConfig(raw({}), "/some/path/config.json")).toThrow(
      /\/some\/path\/config\.json/,
    );
  });
});
