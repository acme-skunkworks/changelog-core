// Imports the BUNDLE script directly (the distributed `.mjs`), so the published
// bundle stays test-free whilst the parser/serialiser is still covered in CI.
//
// Edge-case throws (unterminated inline arrays, blank block scalars, missing
// colons) are covered against the bundle in
// ./changelog-frontmatter.test.ts; this suite covers the
// broad happy-path parse + stringify round-trips that the changelog frontmatter
// relies on.
import {
  parseFrontmatter,
  stringifyFrontmatter,
} from "../src/lib/frontmatter.js";
import { describe, expect, it } from "vitest";

describe("parseFrontmatter — scalar shapes", () => {
  it("parses strings, integers, booleans and the null literal", () => {
    const raw =
      "---\n" +
      "title: A change\n" +
      "pr: 42\n" +
      "breaking: false\n" +
      "draft: true\n" +
      "release_note:\n" +
      "---\n" +
      "body\n";
    const { data } = parseFrontmatter(raw);
    expect(data).toMatchObject({
      breaking: false,
      draft: true,
      pr: 42,
      release_note: null,
      title: "A change",
    });
  });

  it("unquotes single- and double-quoted scalars", () => {
    const raw =
      "---\n" +
      "single: 'it''s quoted'\n" +
      'double: "a \\"quoted\\" word"\n' +
      "---\n" +
      "body\n";
    const { data } = parseFrontmatter(raw);
    expect(data.single).toBe("it's quoted");
    expect(data.double).toBe('a "quoted" word');
  });

  it("returns empty data and the raw text as content when there is no frontmatter", () => {
    const raw = "no frontmatter here\n";
    const { content, data } = parseFrontmatter(raw);
    expect(data).toEqual({});
    expect(content).toBe(raw);
  });

  it("strips a leading BOM before parsing", () => {
    // parseFrontmatter drops a leading U+FEFF before looking for fences, so a
    // BOM-prefixed file is not misread as having no frontmatter / stray bytes.
    const raw = "﻿no frontmatter here\n";
    const { content, data } = parseFrontmatter(raw);
    expect(data).toEqual({});
    expect(content).toBe("no frontmatter here\n");
  });

  it("preserves the markdown body byte-for-byte", () => {
    const body = "## Added\n\n- A change\n\n## Fixed\n\n- A fix\n";
    const { content } = parseFrontmatter(`---\ntitle: x\n---\n${body}`);
    expect(content).toBe(body);
  });
});

describe("parseFrontmatter — arrays and nested mappings", () => {
  it("parses an inline array", () => {
    const { data } = parseFrontmatter(
      '---\nco_authors: ["alice", "bob"]\n---\nbody\n',
    );
    expect(data.co_authors).toEqual(["alice", "bob"]);
  });

  it("parses an empty inline array", () => {
    const { data } = parseFrontmatter("---\nco_authors: []\n---\nbody\n");
    expect(data.co_authors).toEqual([]);
  });

  it("parses a block (`- item`) array", () => {
    const { data } = parseFrontmatter(
      "---\nissues:\n  - A-1\n  - A-2\n---\nbody\n",
    );
    expect(data.issues).toEqual(["A-1", "A-2"]);
  });

  it("parses a nested `stats:` mapping", () => {
    const raw =
      "---\n" +
      "stats:\n" +
      "  files_changed: 3\n" +
      "  loc_added: 120\n" +
      "  loc_removed: 7\n" +
      "---\n" +
      "body\n";
    const { data } = parseFrontmatter(raw);
    expect(data.stats).toEqual({
      files_changed: 3,
      loc_added: 120,
      loc_removed: 7,
    });
  });
});

describe("parseFrontmatter — block scalars", () => {
  it("folds a `>-` block to a single line", () => {
    const raw = "---\nrelease_note: >-\n  Tidied the\n  parser.\n---\nbody\n";
    expect(parseFrontmatter(raw).data.release_note).toBe("Tidied the parser.");
  });

  it("keeps interior newlines in a `|` literal block but strips the trailing one", () => {
    // The bundle deliberately treats `|` like `|-` (clip → strip): per the
    // comment in frontmatter.mjs `parseBlockScalar`, the changelog corpus only
    // ever uses `>-`, so block scalars always drop the final newline. Interior
    // newlines are preserved; the trailing one is not. This pins the bundle's
    // actual, intended behaviour, not standard YAML `|` clip semantics.
    const raw = "---\nnote: |\n  line one\n  line two\n---\nbody\n";
    expect(parseFrontmatter(raw).data.note).toBe("line one\nline two");
  });
});

describe("stringifyFrontmatter — round-trips", () => {
  it("emits a fenced block whose body is preserved", () => {
    const out = stringifyFrontmatter("body\n", { title: "x" });
    expect(out).toBe("---\ntitle: x\n---\nbody\n");
  });

  it("quotes a scalar that would otherwise reparse as a non-string", () => {
    // A bare `true` / `42` / leading-digit date would reparse as a non-string.
    const out = stringifyFrontmatter("body\n", {
      created_at: "2026-06-25T00:00:00Z",
      flagish: "true",
      numish: "42",
    });
    const back = parseFrontmatter(out).data;
    expect(back.created_at).toBe("2026-06-25T00:00:00Z");
    expect(back.flagish).toBe("true");
    expect(back.numish).toBe("42");
  });

  it("round-trips inline arrays as block arrays without losing items", () => {
    const data = { co_authors: ["alice", "bob"], issues: ["A-1"] };
    const out = stringifyFrontmatter("body\n", data);
    expect(parseFrontmatter(out).data).toEqual(data);
  });

  it("round-trips a nested mapping", () => {
    const data = {
      branch: "my-branch",
      stats: { files_changed: 2, loc_added: 5, loc_removed: 0 },
    };
    const out = stringifyFrontmatter("body\n", data);
    expect(parseFrontmatter(out).data).toEqual(data);
  });

  it("round-trips an empty mapping as {} (not null)", () => {
    // Regression: the serialiser used to emit a bare `stats:` for an empty
    // object, which re-parsed as null — silently corrupting an empty `stats: {}`
    // (e.g. an enriched entry with no stat inputs). It now emits `{}` and parses
    // back to an empty object, mirroring `[]` for an empty array.
    expect(parseFrontmatter("---\nstats: {}\n---\nbody\n").data.stats).toEqual(
      {},
    );
    const out = stringifyFrontmatter("body\n", { stats: {} });
    expect(out).toBe("---\nstats: {}\n---\nbody\n");
    expect(parseFrontmatter(out).data).toEqual({ stats: {} });
  });

  it("round-trips a multiline string via a quoted escape", () => {
    const data = { note: "line one\nline two" };
    const out = stringifyFrontmatter("body\n", data);
    expect(parseFrontmatter(out).data.note).toBe("line one\nline two");
  });

  it("round-trips booleans, integers and null", () => {
    const data = { breaking: false, pr: 7, release_note: null };
    const out = stringifyFrontmatter("body\n", data);
    expect(parseFrontmatter(out).data).toEqual(data);
  });
});
