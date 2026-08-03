---
title: Document dual merge policy for feature vs release PRs
release_note:
version:
created_at: "2026-08-03T18:26:07Z"
merged_at:
branch: a-1176-update-send-it-derive-bump-claudemd-adr-for-merge-commits
pr:
commit:
author: rob@acmeskunkworks.io
co_authors: []
category: docs
breaking: false
issues:
  - A-1176
stats:
  files_changed:
  loc_added:
  loc_removed:
---

## Changed

- Updated `CLAUDE.md` release wording for dual merge policy: feature PRs land as merge commits; release-please ranks Conventional Commits on `main` ([A-824](https://linear.app/acme-skunkworks/issue/A-824)); Conventional PR titles stay CI-required but are no longer the sole post-merge bump signal; the orchestrator still squash-merges the release PR and fan-out stays squash ([A-1176](https://linear.app/acme-skunkworks/issue/A-1176)).
- Clarified the `ci.yml` `edited` comment so completeness still re-runs on title edits without treating the PR title as the sole bump signal.
