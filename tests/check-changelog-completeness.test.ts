import {
  checkCompleteness,
  hasChangelogEntry,
  isReleaseTriggering,
} from "../src/commands/check-completeness.js";
import { describe, expect, it } from "vitest";

describe("isReleaseTriggering", () => {
  it("is true for feat", () => {
    expect(isReleaseTriggering("feat: add a skill")).toBe(true);
  });

  it("is true for fix", () => {
    expect(isReleaseTriggering("fix: handle nullable")).toBe(true);
  });

  it("is true for a scoped feat", () => {
    expect(isReleaseTriggering("feat(cleanup-repo): add prune step")).toBe(
      true,
    );
  });

  it("is true for a breaking bang on any type", () => {
    expect(isReleaseTriggering("refactor!: drop legacy API")).toBe(true);
    expect(isReleaseTriggering("feat!: remove skill")).toBe(true);
  });

  it("is true for perf", () => {
    expect(isReleaseTriggering("perf: speed up")).toBe(true);
  });

  it("is true for revert", () => {
    expect(isReleaseTriggering("revert: undo foo")).toBe(true);
  });

  it("is false for non-release types", () => {
    for (const title of [
      "docs: update readme",
      "chore: bump dep",
      "ci: harden workflow",
      "refactor: tidy internals",
      "test: add cases",
      "build: tweak config",
      "style: reformat",
    ]) {
      expect(isReleaseTriggering(title)).toBe(false);
    }
  });

  it("tolerates leading/trailing whitespace", () => {
    expect(isReleaseTriggering("  feat: trimmed  ")).toBe(true);
  });
});

describe("hasChangelogEntry", () => {
  it("is true when a dated changelog entry is in the diff", () => {
    expect(
      hasChangelogEntry([
        "skills/cleanup-repo/SKILL.md",
        "changelog/20260623-101010-add-cleanup-step.md",
      ]),
    ).toBe(true);
  });

  it("ignores changelog/README.md", () => {
    expect(
      hasChangelogEntry([
        "changelog/README.md",
        "skills/cleanup-repo/SKILL.md",
      ]),
    ).toBe(false);
  });

  it("is false when no changelog entry is present", () => {
    expect(
      hasChangelogEntry(["package.json", "skills/cleanup-repo/SKILL.md"]),
    ).toBe(false);
  });
});

describe("checkCompleteness", () => {
  it("passes a non-release-triggering PR with no entry", () => {
    const result = checkCompleteness("docs: tidy", ["README.md"]);
    expect(result.ok).toBe(true);
  });

  it("passes a release-triggering PR that carries an entry", () => {
    const result = checkCompleteness("feat: add skill", [
      "skills/cleanup-repo/SKILL.md",
      "changelog/20260623-101010-add-cleanup-step.md",
    ]);
    expect(result.ok).toBe(true);
  });

  it("fails a release-triggering PR with no entry", () => {
    const result = checkCompleteness("fix: handle nullable", [
      "skills/cleanup-repo/scripts/prune.sh",
    ]);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/no changelog/);
  });

  it("fails a breaking PR with no entry", () => {
    const result = checkCompleteness("feat!: drop skill", [
      "skills/cleanup-repo/SKILL.md",
    ]);
    expect(result.ok).toBe(false);
  });
});
