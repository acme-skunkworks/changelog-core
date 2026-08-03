import { nonMergeCommitCount } from "../src/lib/commit-count.js";
import { describe, expect, it } from "vitest";

// The helper takes an injectable runner (cmd, args) -> stdout, so these exercise
// the parse/filter logic against canned `gh api` JSON without touching the network.
type Runner = (cmd: string, args: readonly string[]) => string;

function runnerReturning(json: string): Runner {
  return () => json;
}

describe("nonMergeCommitCount", () => {
  it("counts a PR's commits", () => {
    const run = runnerReturning(
      JSON.stringify([
        { parents: [{ sha: "p1" }] },
        { parents: [{ sha: "p2" }] },
        { parents: [{ sha: "p3" }] },
      ]),
    );
    expect(nonMergeCommitCount(run, 42)).toBe("3");
  });

  it("excludes merge commits (more than one parent)", () => {
    const run = runnerReturning(
      JSON.stringify([
        { parents: [{ sha: "p1" }] },
        // a `main`-merge resolution on the branch — two parents, excluded
        { parents: [{ sha: "p2" }, { sha: "p3" }] },
        { parents: [{ sha: "p4" }] },
      ]),
    );
    expect(nonMergeCommitCount(run, 7)).toBe("2");
  });

  it("treats a root commit (no parents) as a normal commit", () => {
    const run = runnerReturning(JSON.stringify([{ parents: [] }]));
    expect(nonMergeCommitCount(run, 1)).toBe("1");
  });

  it("counts a commit with a missing parents field as a normal commit (A-613)", () => {
    // The REST endpoint always includes `parents`; if a commit object arrives
    // without it, err toward counting authored work rather than dropping it.
    const run = runnerReturning(
      JSON.stringify([
        { parents: [{ sha: "p1" }] },
        { sha: "no-parents-field" },
      ]),
    );
    expect(nonMergeCommitCount(run, 5)).toBe("2");
  });

  it("returns '0' for a PR with no commits", () => {
    expect(nonMergeCommitCount(runnerReturning("[]"), 1)).toBe("0");
  });

  it("returns null when the response is not an array", () => {
    expect(
      nonMergeCommitCount(runnerReturning('{"message":"Not Found"}'), 1),
    ).toBeNull();
  });

  it("counts authored commits across a longer multi-commit PR history (A-825)", () => {
    // 6 single-parent authored commits + 2 merge commits (branch upkeep) → "6".
    const run = runnerReturning(
      JSON.stringify([
        { parents: [{ sha: "p1" }] },
        { parents: [{ sha: "p2" }] },
        { parents: [{ sha: "p3" }, { sha: "p4" }] }, // main merge on branch
        { parents: [{ sha: "p5" }] },
        { parents: [{ sha: "p6" }] },
        { parents: [{ sha: "p7" }, { sha: "p8" }] }, // second main merge
        { parents: [{ sha: "p9" }] },
        { parents: [{ sha: "pa" }] },
      ]),
    );
    expect(nonMergeCommitCount(run, 144)).toBe("6");
  });

  it("requests the merged PR's commits via the {owner}/{repo} REST endpoint", () => {
    const calls: Array<{ args: readonly string[]; cmd: string }> = [];
    function run(cmd: string, args: readonly string[]): string {
      calls.push({ args, cmd });
      return "[]";
    }

    nonMergeCommitCount(run, 99);
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe("gh");
    expect(calls[0].args).toContain("repos/{owner}/{repo}/pulls/99/commits");
    expect(calls[0].args).toContain("--paginate");
  });
});
