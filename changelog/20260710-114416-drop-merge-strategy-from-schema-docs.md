---
title: Drop merge_strategy from changelog schema docs
release_note:
created_at: "2026-07-10T11:44:16Z"
merged_at: "2026-07-10T11:55:10Z"
branch: a-802-phase-1-remove-merge_strategy-from-the-changelog-contract
pr: 3
commit: 9edd085
author: rob@acmeskunkworks.io
co_authors: []
category: docs
breaking: false
issues:
  - A-802
stats:
  files_changed: 3
  loc_added: 25
  loc_removed: 3
  commits: 2
version: 1.1.0
---

## Changed

- Removed stale `merge_strategy` mentions from `changelog/README.md` and `CLAUDE.md`, aligning them with the package contract (field already dropped in [A-803](https://linear.app/rheged-studio/issue/A-803))
