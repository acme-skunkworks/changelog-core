---
title: "Add commitlint pre-push range check"
release_note:
version:
created_at: "2026-07-23T14:48:00Z"
merged_at:
branch: "a-1023-tier-2-fan-out-commitlint-pre-push"
pr:
commit:
author: "rob@acmeskunkworks.io"
co_authors: []
category: chore
breaking: false
issues: ["A-1023"]
stats:
  files_changed:
  loc_added:
  loc_removed:
---

## Added

- Best-effort `commitlint --from origin/main --to HEAD` check in `.husky/pre-push`
  ([A-1023](https://linear.app/acme-skunkworks/issue/A-1023)), alongside existing pre-push
  checks. Skips with an installation hint when `@commitlint/cli` is missing or when
  `origin/main` is not a resolvable ref; bypassable with `git push --no-verify`.
  Complements CI's `reusable-validate-commits` gate rather than replacing it.
- `commitlint.config.mjs` extending `@acme-skunkworks/commitlint-config`.
- `@commitlint/cli` and `@acme-skunkworks/commitlint-config` as devDependencies for the
  local range check.

## Changed

- Documented the pre-push commitlint range check in `CLAUDE.md`.
