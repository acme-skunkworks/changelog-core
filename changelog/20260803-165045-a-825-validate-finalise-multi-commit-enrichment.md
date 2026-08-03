---
title: "Validate finalise enrichment for multi-commit merge history"
release_note:
version:
created_at: "2026-08-03T16:50:45Z"
merged_at:
branch: "a-825-validate-changelog-authoring-changelogfinalise-enrichment"
pr:
commit:
author: "rob@acmeskunkworks.io"
co_authors: []
category: chore
breaking: false
issues: ["A-825"]
stats:
  files_changed:
  loc_added:
  loc_removed:
  commits:
---

## Changed

- Updated stale `finalise` command docs: enrichment now runs in-repo via
  `reusable-changelog-enrich.yml` mode `finalise` (A-801 retired the central
  orchestrator finalise).
- Extended `commit-count` header comments to cover both squash and merge-commit
  trunk strategies.

## Added

- Tests documenting A-825 multi-commit merge readiness: squash-shaped
  `mergeCommit.oid`, 2-parent merge-commit OID resolution, and authored commit
  counting via the PR commits API.

## Validation (A-825)

Empirical checks against live GitHub data:

- **True 2-parent merge** (agent-skills PR #8, merge SHA `fc7400e`): `commits/{sha}/pulls`
  returns PR #8; `mergeCommit.oid` set; 4 PR commits counted.
- **Multi-commit squash** (agent-skills PR #144): squash SHA is single-parent on
  trunk; `pulls/{n}/commits` returns 4 single-parent commits → `nonMergeCommitCount` → 4.
- Enrichment is branch-keyed via `mergeCommit.oid`; `stats.commits` excludes
  commits with `parents.length > 1`.
