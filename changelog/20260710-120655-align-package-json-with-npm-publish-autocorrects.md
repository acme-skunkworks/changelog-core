---
title: Align package.json with npm publish autocorrects
release_note: Package metadata matches what npm expects on publish (bin path and repository URL).
created_at: '2026-07-10T12:06:55Z'
merged_at: '2026-07-10T12:24:17Z'
branch: a-811-fix-package-json-npm-pkg-fix
pr: 5
commit: c59eed7
author: rob@acmeskunkworks.io
co_authors: []
category: fix
breaking: false
issues:
  - A-811
stats:
  files_changed: 2
  loc_added: 25
  loc_removed: 2
  commits: 2
version: 1.1.0
---

## Fixed

- Set `bin.changelog-core` to `dist/cli.js` (no `./` prefix) and `repository.url` to the `git+https://` form so publish no longer auto-corrects or risks dropping the CLI entry ([A-811](https://linear.app/acme-skunkworks/issue/A-811))
