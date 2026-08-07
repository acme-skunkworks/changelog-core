---
title: Bump @acme-skunkworks lint packages and fix markdownlint fallout
release_note: ""
created_at: "2026-08-07T15:12:51Z"
merged_at: ""
branch: a-1343-changelog-core-bump-acme-skunkworks-devdeps-and-fix-lint
pr:
commit:
author: rob@acmeskunkworks.io
co_authors: []
category: chore
breaking: false
issues:
  - A-1343
stats:
  files_changed:
  loc_added:
  loc_removed:
  commits:
---

## Changed

**Bump @acme-skunkworks lint packages and fix markdownlint fallout ([A-1343](https://linear.app/rheged-studio/issue/A-1343))**

- Raise `@acme-skunkworks/eslint-config` to `^1.1.3`, `@acme-skunkworks/markdownlint-config` to `^3.0.0`, and `@acme-skunkworks/commitlint-config` to `^1.0.1` (leave self at `1.1.1`)
- Exclude vendored `.claude/skills/**` and `.agents/skills/**` from markdownlint (config, `lint:md` scripts, and CI `markdown-globs`) so skill bundles stay byte-identical under the stricter 3.x rules
- Clear first-party MD040/MD044 findings in `AGENTS.md`, `CLAUDE.md`, and `infrastructure/README.md`
