// `rewriteBody` loads config via the shared vitest setup (issue key A,
// workspace acme-skunkworks). Reference-style label masking is covered in
// ./add-links-reference-masking.test.ts; this suite covers the issue-key
// rewrite happy path plus inline-code / fenced-block masking and the
// splitFrontmatter contract.
import {
  frontmatterBranch,
  rewriteBody,
  splitFrontmatter,
} from "../src/commands/add-links.js";
import { describe, expect, it } from "vitest";

function url(id: string) {
  return `https://linear.app/acme-skunkworks/issue/${id}`;
}

describe("rewriteBody — issue-key linking (happy path)", () => {
  it("links a bare issue ID for each configured team key", () => {
    expect(rewriteBody("Closes A-12.")).toBe(`Closes [A-12](${url("A-12")}).`);
    expect(rewriteBody("Closes A-3.")).toBe(`Closes [A-3](${url("A-3")}).`);
    expect(rewriteBody("Closes A-9.")).toBe(`Closes [A-9](${url("A-9")}).`);
    expect(rewriteBody("Closes A-401.")).toBe(
      `Closes [A-401](${url("A-401")}).`,
    );
  });

  it("links several IDs in one body", () => {
    expect(rewriteBody("A-1 and A-2 both landed.")).toBe(
      `[A-1](${url("A-1")}) and [A-2](${url("A-2")}) both landed.`,
    );
  });

  it("leaves unknown team keys untouched", () => {
    const body = "ZZ-9 is not a configured key.";
    expect(rewriteBody(body)).toBe(body);
  });

  it("is idempotent — a second pass does not double-link", () => {
    const once = rewriteBody("Closes A-12.");
    expect(rewriteBody(once)).toBe(once);
  });
});

describe("rewriteBody — masking", () => {
  it("does not link an ID inside inline code", () => {
    const body = "Run `validate A-12` before merge.";
    expect(rewriteBody(body)).toBe(body);
  });

  it("does not link an ID inside a fenced code block", () => {
    const body = "```\nbranch A-12 created\n```\n";
    expect(rewriteBody(body)).toBe(body);
  });

  it("does not re-link an already-linked inline ID", () => {
    const body = `See [A-12](${url("A-12")}) for detail.`;
    expect(rewriteBody(body)).toBe(body);
  });

  it("round-trips inline code nested inside a link without leaking NUL bytes", () => {
    // The inner inline-code span masks first, then the whole `[<token>](url)`
    // masks again — the unmask must be reentrant or a literal NUL token survives
    // and turns the entry into a binary blob (A-577).
    const body = "See [`A-12`](https://example.test/A-12) for the helper.";
    const out = rewriteBody(body);
    expect(out).toBe(body);
    expect(out).not.toContain("\u0000");
  });

  it("links a bare ID whilst leaving a fenced/inline-code occurrence masked", () => {
    const body = "Closes A-12; see `A-12` and:\n```\nA-12\n```\n";
    expect(rewriteBody(body)).toBe(
      `Closes [A-12](${url("A-12")}); see \`A-12\` and:\n\`\`\`\nA-12\n\`\`\`\n`,
    );
  });

  it("leaves literal text that looks like a mask token untouched", () => {
    // Pre-sentinel, the restore pass would have mangled bare "FENCE0"/"LINK0".
    expect(rewriteBody("Set placeholder FENCE0 and LINK0 in the doc.")).toBe(
      "Set placeholder FENCE0 and LINK0 in the doc.",
    );
  });

  it("links an ID even when a mask-token-like string is also present", () => {
    expect(rewriteBody("FENCE0 — closes A-9.")).toBe(
      `FENCE0 — closes [A-9](${url("A-9")}).`,
    );
  });
});

describe("splitFrontmatter", () => {
  it("splits leading frontmatter from the body", () => {
    const raw = "---\ntitle: x\n---\n## Added\n\n- A change\n";
    expect(splitFrontmatter(raw)).toEqual({
      body: "## Added\n\n- A change\n",
      fm: "---\ntitle: x\n---\n",
    });
  });

  it("returns the whole string as body when there is no frontmatter", () => {
    const raw = "## Added\n\n- A change\n";
    expect(splitFrontmatter(raw)).toEqual({ body: raw, fm: "" });
  });

  it("splits CRLF frontmatter from the body", () => {
    // splitFrontmatter's fence regex accepts `\r?\n`, so a Windows-authored
    // changelog file must split the same way as an LF one.
    const raw = "---\r\ntitle: x\r\n---\r\n## Added\r\n";
    expect(splitFrontmatter(raw)).toEqual({
      body: "## Added\r\n",
      fm: "---\r\ntitle: x\r\n---\r\n",
    });
  });
});

describe("frontmatterBranch — branch-scoped default (A-603)", () => {
  it("reads the branch from an entry's frontmatter", () => {
    const raw =
      "---\ntitle: x\nbranch: a-603-add-links-scope\nversion:\n---\n## Added\n";
    expect(frontmatterBranch(raw)).toBe("a-603-add-links-scope");
  });

  it("strips surrounding quotes", () => {
    expect(frontmatterBranch('---\nbranch: "a-1-foo"\n---\nbody')).toBe(
      "a-1-foo",
    );
  });

  it("returns null when there is no branch field", () => {
    expect(frontmatterBranch("---\ntitle: x\n---\nbody")).toBeNull();
  });

  it("returns null when there is no frontmatter at all", () => {
    expect(frontmatterBranch("## Added\n\n- a change\n")).toBeNull();
  });

  it("returns null for a blank branch value", () => {
    expect(frontmatterBranch("---\nbranch:\n---\nbody")).toBeNull();
  });

  it("only reads the frontmatter region, not a `branch:`-like line in the body", () => {
    const raw =
      "---\ntitle: x\n---\nThe branch: main note in prose is ignored.\n";
    expect(frontmatterBranch(raw)).toBeNull();
  });
});
