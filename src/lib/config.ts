// Load the consumer's changelog config.json (issue-ID prefixes, Linear workspace
// slug, base branch, changelog directory, monorepo package mapping).
//
// Resolved from the consumer cwd (or an explicit path) — NOT relative to this
// package's install location. Order:
//   1. options.configPath
//   2. process.env.CHANGELOG_CONFIG
//   3. <cwd>/.claude/skills/changelog/config.json
//   4. <cwd>/.agents/skills/changelog/config.json
//   5. <cwd>/config.json (committed repo-root config — stopgap until agent-skills
//      #122 / Linear follow-up makes skill config.json reliably available in CI)
//
// Zero-deps: a plain JSON read. Identity values (`issueKeys`,
// `linearWorkspaceSlug`) have NO default — a foreign repo that silently inherited
// ACME's keys/slug would emit wrong issue links and detection, so a missing
// config or a missing identity key FAILS LOUDLY. Structural conventions
// (`baseBranch`, `changelogDir`, `packageRoots`, `fallbackPackage`) keep generic,
// non-ACME defaults a consumer can override; a present-but-mistyped one also fails
// loudly rather than surfacing as a non-actionable crash downstream.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type ChangelogConfig = {
  affectedPackages: boolean;
  baseBranch: string;
  changelogDir: string;
  fallbackPackage: string;
  issueKeys: string[];
  linearWorkspaceSlug: string;
  packageRoots: string[];
};

// Generic, non-ACME structural defaults. Applied only when the key is absent;
// every one is overridable in config.json. Mirrored in derive-packages.ts so
// that function can run standalone — keep the two in sync.
const DEFAULTS: Omit<ChangelogConfig, "issueKeys" | "linearWorkspaceSlug"> = {
  // `affected_packages` only earns its keep in a genuine monorepo. Default it
  // off so single-package repos get clean entries; monorepo consumers (and
  // initialise-skills, when it detects a workspace config) flip it on.
  affectedPackages: false,
  baseBranch: "main",
  changelogDir: "changelog",
  fallbackPackage: "infrastructure",
  packageRoots: ["apps", "packages", "services"],
};

let cached: ChangelogConfig | undefined;

function fail(message: string, source: string): never {
  throw new Error(
    `changelog config: ${message} Set it in ${source} (commit a root config.json, or run initialise-skills for the skill-local copy).`,
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

/**
 * Validate a raw config JSON string and merge it over the structural defaults.
 * Exported so the fail-loud contract is unit-testable without filesystem setup.
 */
export function parseConfig(
  raw: string,
  source = "config.json",
): ChangelogConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Invalid JSON in ${source}: ${message}`);
    throw error;
  }

  // JSON.parse can return null/array/primitive; the field checks below would then
  // throw a raw TypeError instead of the actionable config error this surfaces.
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail("config.json must contain a JSON object.", source);
  }

  const record = parsed as Record<string, unknown>;

  // Required identity values — no default; fail loudly so a consuming repo can't
  // silently ship ACME's issue keys or workspace slug.
  if (
    !Array.isArray(record.issueKeys) ||
    record.issueKeys.length === 0 ||
    !record.issueKeys.every(isNonEmptyString)
  ) {
    fail("`issueKeys` must be a non-empty array of strings.", source);
  }

  if (!isNonEmptyString(record.linearWorkspaceSlug)) {
    fail("`linearWorkspaceSlug` must be a non-empty string.", source);
  }

  // Structural keys are optional, but a present value of the wrong type would
  // otherwise crash later (e.g. `packageRoots.map`) with a non-actionable error.
  if ("baseBranch" in record && !isNonEmptyString(record.baseBranch)) {
    fail("`baseBranch`, when set, must be a non-empty string.", source);
  }

  if ("changelogDir" in record && !isNonEmptyString(record.changelogDir)) {
    fail("`changelogDir`, when set, must be a non-empty string.", source);
  }

  if ("packageRoots" in record && !isStringArray(record.packageRoots)) {
    fail("`packageRoots`, when set, must be an array of strings.", source);
  }

  if (
    "fallbackPackage" in record &&
    !isNonEmptyString(record.fallbackPackage)
  ) {
    fail("`fallbackPackage`, when set, must be a non-empty string.", source);
  }

  if (
    "affectedPackages" in record &&
    typeof record.affectedPackages !== "boolean"
  ) {
    fail("`affectedPackages`, when set, must be a boolean.", source);
  }

  return {
    ...DEFAULTS,
    ...(record as Partial<ChangelogConfig>),
    issueKeys: record.issueKeys as string[],
    linearWorkspaceSlug: record.linearWorkspaceSlug as string,
  };
}

function resolveConfigPath(options?: { configPath?: string }): string {
  if (options?.configPath) {
    return options.configPath;
  }

  const fromEnvironment = process.env.CHANGELOG_CONFIG?.trim();
  if (fromEnvironment) {
    return fromEnvironment;
  }

  const cwd = process.cwd();
  const claudePath = join(cwd, ".claude/skills/changelog/config.json");
  if (existsSync(claudePath)) {
    return claudePath;
  }

  const agentsPath = join(cwd, ".agents/skills/changelog/config.json");
  if (existsSync(agentsPath)) {
    return agentsPath;
  }

  // Last resort: committed repo-root config.json. Skill-local config.json is
  // gitignored under the agent-skills generated-config model, so CI / fresh
  // clones need a tracked path until that gap is fixed (A-812).
  const rootPath = join(cwd, "config.json");
  if (existsSync(rootPath)) {
    return rootPath;
  }

  return fail(
    "config.json not found.",
    `${claudePath}, ${agentsPath}, or ${rootPath}`,
  );
}

/**
 * Load and cache the changelog config from the consumer cwd (or an explicit path).
 */
export function loadConfig(options?: { configPath?: string }): ChangelogConfig {
  // An explicit path always reloads; otherwise return the cached value so
  // repeated callers (and the CLI's env-based --config) share one parse.
  if (cached !== undefined && options?.configPath === undefined) {
    return cached;
  }

  const configPath = resolveConfigPath(options);
  let raw: string;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      fail("config.json not found.", configPath);
    }

    throw error;
  }

  cached = parseConfig(raw, configPath);
  return cached;
}

/**
 * Clear the cached config — for tests that swap config between cases.
 */
export function resetConfigCache(): void {
  cached = undefined;
}
