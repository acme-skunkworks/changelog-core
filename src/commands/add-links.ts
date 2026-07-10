import { isCliEntry } from "../lib/cli-entry.js";
import { loadConfig } from "../lib/config.js";
import { buildIssueRe } from "../lib/vendor/issue-keys.js";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { argv } from "node:process";

const FENCE_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /`[^`]*`/g;
const ALREADY_LINKED_RE = /\[[^\]]*\]\([^)]*\)/g;
// Reference-link definition lines — `[A-123]: <url>`, plus any indented
// continuation lines. The label here is the definition's key, not prose, so
// masking it stops `ISSUE_RE` rewriting it into `[[A-123](url)]: <url>` and
// breaking the reference. CommonMark allows up to three leading spaces before
// the label (four or more would be an indented code block), so allow `{0,3}`.
// Must run before `REFERENCE_LINKED_RE` so a definition is never partially
// consumed as an in-text label.
const REFERENCE_DEFINITION_RE = /^ {0,3}\[[^\]]+\]:[^\n]*(?:\n[ \t][^\n]*)*/gm;
// Reference-style links — `[text][ref]` and the collapsed `[text][]` — also
// already point at a definition, so mask them too. Without this, `ISSUE_RE`
// rewrites inside the label (`[A-1][1]` -> `[[A-1](url)][1]`) and re-runs
// compound the corruption.
const REFERENCE_LINKED_RE = /\[[^\]]*\]\[[^\]]*\]/g;

function buildUrl(workspace: string, id: string): string {
  return `https://linear.app/${workspace}/issue/${id}`;
}

export function rewriteBody(body: string): string {
  // Lazy config load so `--config` / CHANGELOG_CONFIG set by the CLI dispatcher
  // (or tests via resetConfigCache) take effect before the first rewrite.
  const { issueKeys: teamKeys, linearWorkspaceSlug: workspace } = loadConfig();
  const issueRe = buildIssueRe(teamKeys);
  if (!issueRe) {
    return body;
  }

  // Mask fenced/inline code and existing links so issue-like text inside them
  // isn't linkified. Tokens are delimited with NUL bytes, which cannot occur in
  // a UTF-8 text file, so a token can never collide with real prose on restore
  // (the previous bare `FENCE0`/`INLINE1`/`LINK2` tokens could).
  const masks: string[] = [];
  function mask(match: string): string {
    masks.push(match);
    return `\u0000CR_MASK_${masks.length - 1}\u0000`;
  }

  const masked = body
    .replaceAll(FENCE_RE, mask)
    .replaceAll(INLINE_CODE_RE, mask)
    .replaceAll(ALREADY_LINKED_RE, mask)
    .replaceAll(REFERENCE_DEFINITION_RE, mask)
    .replaceAll(REFERENCE_LINKED_RE, mask)
    .replace(issueRe, (id) => `[${id}](${buildUrl(workspace, id)})`);

  // Unmask is reentrant. Masks can nest: inline code inside a Markdown link —
  // `` [`code`](url) `` — has the inner inline-code span masked first, then the
  // whole `[<token>](url)` masked again, so the outer mask's stored value still
  // contains the inner token. A single replace pass restores the outer token but
  // leaves that inner `\0…\0` token embedded, so literal NUL bytes survive into
  // the file (the entry becomes a binary blob). Restore to a fixed point instead.
  // Each token is stored before any token that embeds it, so every pass strictly
  // reduces the highest remaining index and the loop terminates.
  let unmasked = masked;
  let previous: string;
  do {
    previous = unmasked;
    unmasked = unmasked.replaceAll(
      /\0CR_MASK_(\d+)\0/g,
      (_, index: string) => masks[Number(index)]!,
    );
  } while (unmasked !== previous);

  return unmasked;
}

export function splitFrontmatter(raw: string): { body: string; fm: string } {
  // Match the opening/closing `---` fences with either LF or CRLF endings so a
  // file authored on Windows isn't treated as having no frontmatter (which
  // would let `rewriteBody` rewrite the frontmatter region too).
  const match = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  if (!match) {
    return { body: raw, fm: "" };
  }

  return { body: raw.slice(match[0].length), fm: match[0] };
}

// The `branch:` value from a changelog entry's frontmatter (quotes stripped), or
// `null` when the entry has no frontmatter or no `branch:` field. Used to scope
// the default write pass to the entry(ies) authored on the current branch.
export function frontmatterBranch(raw: string): null | string {
  const { fm } = splitFrontmatter(raw);
  const match = fm.match(/^branch:(.*)$/m);
  if (!match) {
    return null;
  }

  const value = match[1]!.trim().replaceAll(/^['"]|['"]$/g, "");
  return value || null;
}

// The current git branch, or `null` when git is unavailable or HEAD is detached
// — callers fall back to the full-directory sweep in that case.
function currentGitBranch(): null | string {
  try {
    const result = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
    });
    if (result.status !== 0) {
      return null;
    }

    const branch = result.stdout.trim();
    return branch && branch !== "HEAD" ? branch : null;
  } catch {
    return null;
  }
}

const USAGE = `add-links — rewrite bare Linear issue IDs in changelog bodies to Linear URLs

Usage:
  changelog-core add-links                 Linkify the current branch's entry/entries (writes)
  changelog-core add-links --all           Linkify every changelog/<ts>-<slug>.md body (writes)
  changelog-core add-links --check         Report which files would change across ALL entries; write nothing
  changelog-core add-links --dry-run       Alias for --check
  changelog-core add-links --self-test     Run the built-in offline smoke test
  changelog-core add-links --help          Show this message (alias: -h)

By default the write pass is scoped to the entry(ies) whose \`branch:\` frontmatter
matches the current git branch, so authoring a new entry never rewrites unrelated,
already-merged entries (A-603). Use --all for the historical full-directory sweep.
When git is unavailable the default falls back to the full sweep.

--check always scans every entry (it's a completeness gate) and exits 1 when a
rewrite is needed, 0 when nothing would change.`;

// Offline smoke test for the pure rewriteBody: linkify a sample body and check
// the masking rules (fenced/inline code and existing links are left alone).
function selfTest(): void {
  const cases: Array<{ name: string; ok: boolean }> = [];

  // Masking invariants hold whatever the config: an already-linked ID and an
  // inline-code ID must survive a rewrite untouched.
  const alreadyLinked = "See [A-1](https://example.test/A-1) for context.";
  cases.push({
    name: "an already-linked issue ID is left untouched",
    ok: rewriteBody(alreadyLinked) === alreadyLinked,
  });

  const inlineCode = "The token `A-1` is code, not a link.";
  cases.push({
    name: "an issue ID inside inline code is not linkified",
    ok: rewriteBody(inlineCode) === inlineCode,
  });

  const fenced = "```\nA-1 in a fence\n```";
  cases.push({
    name: "an issue ID inside a code fence is not linkified",
    ok: rewriteBody(fenced) === fenced,
  });

  // Inline code nested inside a Markdown link masks twice (inner span, then the
  // whole link). The reentrant unmask must restore both so no NUL token survives.
  const codeInLink = "See [`A-1`](https://example.test/A-1) for the helper.";
  const codeInLinkOut = rewriteBody(codeInLink);
  cases.push({
    name: "inline code nested inside a link round-trips with no NUL bytes",
    ok: codeInLinkOut === codeInLink && !codeInLinkOut.includes("\u0000"),
  });

  // When the host config has issue keys, a bare ID for the first key linkifies.
  const { issueKeys: teamKeys, linearWorkspaceSlug: workspace } = loadConfig();
  const issueRe = buildIssueRe(teamKeys);
  if (issueRe && teamKeys.length > 0) {
    const key = teamKeys[0]!;
    const id = `${key}-123`;
    const before = `Closes ${id}.`;
    const after = rewriteBody(before);
    cases.push({
      name: `a bare ${id} is rewritten to a Linear link`,
      ok: after === `Closes [${id}](${buildUrl(workspace, id)}).`,
    });
  } else {
    cases.push({
      name: "no issue keys configured — rewriteBody is a no-op",
      ok: rewriteBody("Closes A-1.") === "Closes A-1.",
    });
  }

  let failed = 0;
  for (const { name, ok } of cases) {
    if (ok) {
      console.log(`  ok    ${name}`);
    } else {
      failed += 1;
      console.log(`  FAIL  ${name}`);
    }
  }

  console.log(`\n${cases.length - failed}/${cases.length} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

export function main(): void {
  const args = argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    return;
  }

  if (args.includes("--self-test")) {
    selfTest();
    return;
  }

  // --check (alias --dry-run): report which files would be rewritten and write
  // nothing. Exit 0 when nothing would change, 1 when a rewrite is needed —
  // prettier-style, so CI can gate on it.
  const check = args.some(
    (argument) => argument === "--check" || argument === "--dry-run",
  );
  const all = args.includes("--all");

  const { changelogDir } = loadConfig();

  let stat;
  try {
    stat = statSync(changelogDir);
  } catch {
    console.error(`changelog directory not found: ${changelogDir}`);
    process.exit(2);
  }

  if (!stat.isDirectory()) {
    console.error(`${changelogDir} is not a directory`);
    process.exit(2);
  }

  let files = readdirSync(changelogDir)
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .map((name) => join(changelogDir, name));

  // Default write pass: scope to the entry(ies) authored on the current branch
  // (matched by `branch:` frontmatter), so linkifying a new entry never churns
  // unrelated, already-merged entries (A-603). `--all` and `--check` keep the
  // full-directory scan; a non-git context (no branch) also falls back to it.
  if (!all && !check) {
    const branch = currentGitBranch();
    if (branch) {
      files = files.filter(
        (file) => frontmatterBranch(readFileSync(file, "utf8")) === branch,
      );
    }
  }

  let touched = 0;
  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    const { body, fm } = splitFrontmatter(raw);
    const next = rewriteBody(body);
    if (next !== body) {
      if (!check) {
        writeFileSync(file, fm + next);
      }

      touched++;
      console.log(
        check ? `[check] would rewrite: ${file}` : `rewrote: ${file}`,
      );
    }
  }

  if (check) {
    console.log(
      `[check] Linear link rewriting: ${touched} file(s) would be updated.`,
    );
    process.exit(touched > 0 ? 1 : 0);
  }

  console.log(`Linear link rewriting complete. ${touched} file(s) updated.`);
}

// Only run the filesystem pass when invoked as a CLI, not when imported (e.g.
// by unit tests exercising `rewriteBody`).
if (isCliEntry(import.meta.filename)) {
  main();
}
