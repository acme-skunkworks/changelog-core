---
title: Extract changelog logic into @acme-skunkworks/changelog-core
release_note: Shared validate/enrich/finalise CLI and contract for dated changelog entries, without merge_strategy.
created_at: '2026-07-10T10:44:36Z'
merged_at: '2026-07-10T11:35:49Z'
branch: a-803-phase-1-create-acme-skunkworkschangelog-core-extract
pr: 2
commit: 7160af0
author: rob@acmeskunkworks.io
co_authors: []
category: feature
breaking: false
issues:
  - A-803
  - A-812
stats:
  files_changed: 97
  loc_added: 4819
  loc_removed: 5063
  commits: 12
version: 1.1.0
---

## Added

- TypeScript package API and `changelog-core` CLI (`validate`, `enrich`, `finalise`, `set-affected-packages`, `add-links`, `backfill-commits`, `check-completeness`)
- Shipped `changelog-contract.md` and a committed root `config.json` (stopgap while skill config stays gitignored — [A-812](https://linear.app/acme-skunkworks/issue/A-812))
- Consumer-cwd config resolution (`--config` / `CHANGELOG_CONFIG` / skill config paths / root `config.json`)
- Ported unit tests from the agent-skills changelog suite

## Changed

- Package identity initialised to `@acme-skunkworks/changelog-core`; template dated changelog entries cleared
- In-repo dogfood: `validate:changelog` / `changelog:*` scripts and CI completeness call the local CLI
- Removed vendored `infrastructure/scripts` changelog TypeScript copies in favour of `src/`
- Dropped the repo-local `initialise-package-repo` scaffolder after one-shot setup

## Fixed

- Dropped `merge_strategy` from the contract and tooling ([A-802](https://linear.app/acme-skunkworks/issue/A-802) folded into extraction); unknown keys on existing entries remain tolerated
- `check-completeness` honours configured `changelogDir` instead of hard-coding `changelog/`
- Backfill expands inline empty `stats: {}` mappings instead of duplicating the key
- Shared `blank` / `realRunner` / `escapeRegex` helpers after extraction cleanup
