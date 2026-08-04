# @acme-skunkworks/changelog-core

Shared **changelog contract** and dual-runtime **CLI** for Rheged Studio —
validate, enrich, and finalise dated `changelog/` entries from CI **and** local
dev. One package replaces the triplicated skill `.mjs` + per-repo
`infrastructure/scripts` copies.

Zero runtime dependencies (Node built-ins only). Node 22+.

## Install

```bash
pnpm add -D @acme-skunkworks/changelog-core
```

## Config

Commands resolve config from the **consumer repo** (not the package install
path), in order:

1. `--config <path>` (CLI)
2. `CHANGELOG_CONFIG` env
3. `.claude/skills/changelog/config.json`
4. `.agents/skills/changelog/config.json`
5. `config.json` (committed repo-root — stopgap while skill `config.json` stays
   gitignored; see [A-812](https://linear.app/rheged-studio/issue/A-812))

Required identity keys: `issueKeys`, `linearWorkspaceSlug`. Structural keys
(`baseBranch`, `changelogDir`, `packageRoots`, `fallbackPackage`,
`affectedPackages`) have safe defaults.

## CLI

```bash
npx changelog-core [--config <path>] <subcommand> [args…]
npx changelog-core --version
```

| Subcommand              | Purpose                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| `validate`              | Schema-check every dated entry under `changelog/`                 |
| `enrich`                | Fill post-merge fields for one entry (env-driven; deploy targets) |
| `finalise`              | Release-time enrich + version stamp (npm targets)                 |
| `set-affected-packages` | Write `affected_packages` from the branch diff (monorepos)        |
| `add-links`             | Rewrite bare Linear IDs in bodies to links                        |
| `backfill-commits`      | One-off backfill of `stats.commits`                               |
| `check-completeness`    | Gate a release-triggering PR title on a changelog entry           |

Local scripts in this repo:

```bash
pnpm validate:changelog
pnpm changelog:enrich
pnpm changelog:finalise
```

## Contract

The frontmatter schema and field-ownership rules live in
[`changelog-contract.md`](changelog-contract.md) (also importable as
`@acme-skunkworks/changelog-core/contract`).

`merge_strategy` is **not** part of the contract (A-802). Existing entries that
still carry the key validate fine — unknown keys are ignored.

## Library

```ts
import {
  validateEntry,
  enrichFrontmatter,
  parseFrontmatter,
  loadConfig,
} from "@acme-skunkworks/changelog-core";
```

See `src/index.ts` for the full public surface (frontmatter, config, enrich,
stamp, derive-packages, completeness helpers, …).

## Development

```bash
pnpm install
pnpm run build
pnpm test
pnpm lint
pnpm tsc
```

## Licence

MIT
