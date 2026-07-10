---
title: "Drop merge_strategy from changelog schema docs"
release_note:
created_at: "2026-07-10T11:44:16Z"
merged_at:
branch: "a-802-phase-1-remove-merge_strategy-from-the-changelog-contract"
pr:
commit:
author: "rob@acmeskunkworks.io"
co_authors: []
category: docs
breaking: false
issues: ["A-802"]
stats:
  files_changed:
  loc_added:
  loc_removed:
  commits:
---

## Changed

- Removed stale `merge_strategy` mentions from `changelog/README.md` and `CLAUDE.md`, aligning them with the package contract (field already dropped in [A-803](https://linear.app/acme-skunkworks/issue/A-803))
