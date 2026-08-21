#!/usr/bin/env node
// Bin entry for @acme-studio/changelog-core — parse the subcommand and
// dispatch to the matching command main. Global `--config <path>` (before or
// after the subcommand) is mapped to CHANGELOG_CONFIG so loadConfig() picks it
// up without each command re-parsing the flag.

import { main as addLinksMain } from "./commands/add-links.js";
import { main as backfillCommitsMain } from "./commands/backfill-commits.js";
import { main as checkCompletenessMain } from "./commands/check-completeness.js";
import { main as enrichMain } from "./commands/enrich.js";
import { main as finaliseMain } from "./commands/finalise.js";
import { main as setAffectedPackagesMain } from "./commands/set-affected-packages.js";
import { main as validateMain } from "./commands/validate.js";
import { createRequire } from "node:module";
import { argv, exit } from "node:process";

const { version: PACKAGE_VERSION } = createRequire(import.meta.url)(
  "../package.json",
) as { version: string };

const SUBCOMMANDS = [
  "validate",
  "enrich",
  "finalise",
  "set-affected-packages",
  "add-links",
  "backfill-commits",
  "check-completeness",
] as const;

type Subcommand = (typeof SUBCOMMANDS)[number];

const DISPATCH: Record<Subcommand, () => void> = {
  "add-links": addLinksMain,
  "backfill-commits": backfillCommitsMain,
  "check-completeness": checkCompletenessMain,
  enrich: enrichMain,
  finalise: finaliseMain,
  "set-affected-packages": setAffectedPackagesMain,
  validate: validateMain,
};

const USAGE = `changelog-core — dated changelog tooling (validate, enrich, finalise, …)

Usage:
  changelog-core [--config <path>] <subcommand> [args…]

Subcommands:
  validate                 Validate dated changelog/ entries against the contract
  enrich                   Fill post-merge fields of one entry (env-driven)
  finalise                 Release-time enrich + version-stamp
  set-affected-packages    Write affected_packages from the branch diff
  add-links                Rewrite bare Linear IDs in bodies to links
  backfill-commits         One-off backfill of stats.commits
  check-completeness       Gate a release-triggering PR on a changelog entry

Global options:
  --config <path>          Path to config.json (also via CHANGELOG_CONFIG)
  --help, -h               Show this message
  --version, -V            Print the package version`;

function extractConfig(args: string[]): {
  configPath: string | undefined;
  rest: string[];
} {
  const rest: string[] = [];
  let configPath: string | undefined;

  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;
    if (argument === "--config") {
      const next = args[++index];
      if (!next || next.startsWith("-")) {
        console.error("changelog-core: --config requires a path argument");
        exit(2);
      }

      configPath = next;
    } else if (argument.startsWith("--config=")) {
      const value = argument.slice("--config=".length);
      if (!value) {
        console.error("changelog-core: --config requires a path argument");
        exit(2);
      }

      configPath = value;
    } else {
      rest.push(argument);
    }
  }

  return { configPath, rest };
}

function isSubcommand(value: string): value is Subcommand {
  return (SUBCOMMANDS as readonly string[]).includes(value);
}

function main(): void {
  const { configPath, rest } = extractConfig(argv.slice(2));

  if (rest.length === 0 || rest[0] === "--help" || rest[0] === "-h") {
    console.log(USAGE);
    return;
  }

  if (rest[0] === "--version" || rest[0] === "-V") {
    console.log(PACKAGE_VERSION);
    return;
  }

  const subcommand = rest[0]!;
  if (!isSubcommand(subcommand)) {
    console.error(`changelog-core: unknown subcommand '${subcommand}'\n`);
    console.error(USAGE);
    exit(2);
  }

  if (configPath) {
    process.env.CHANGELOG_CONFIG = configPath;
  }

  // Leave the subcommand (and any remaining flags) on argv so command mains that
  // scan argv.slice(2) for --help / --self-test / --check still see them. The
  // subcommand name itself is ignored by those scanners.
  DISPATCH[subcommand]();
}

main();
