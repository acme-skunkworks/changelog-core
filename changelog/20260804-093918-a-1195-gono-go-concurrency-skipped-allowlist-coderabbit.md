---
title: Stop GO/NO GO false-reds and CodeRabbit PR-description edits
release_note: ""
created_at: "2026-08-04T09:39:18Z"
merged_at:
branch: a-1195-gono-go-concurrency-skipped-allowlist-coderabbit
pr:
commit:
author: rob@acmeskunkworks.io
co_authors: []
category: chore
breaking: false
issues:
  - A-1195
stats:
  files_changed:
  loc_added:
  loc_removed:
  commits:
---

## Changed

**GO/NO GO concurrency + skipped allowlist + CodeRabbit walkthrough ([A-1195](https://linear.app/acme-skunkworks/issue/A-1195))** — set `cancel-in-progress: false` on `ci.yml` and `validate-pr-title.yml` so a superseded run cannot mint a false-red gate; replace the blanket `skipped` accept with the branch-conditional allowlist (release-please only); put CodeRabbit's high-level summary in the walkthrough comment so description edits stop re-firing CI.
