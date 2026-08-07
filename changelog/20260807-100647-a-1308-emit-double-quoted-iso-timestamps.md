---
title: "Emit double-quoted ISO timestamps in frontmatter"
release_note: "Enrich and finalise now emit Prettier-compatible double-quoted ISO timestamps so consumer prettier --check stays green after post-merge enrichment."
version:
created_at: "2026-08-07T10:06:47Z"
merged_at:
branch: "a-1308-changelog-core-emit-double-quoted-iso-timestamps-so-enrich"
pr:
commit:
author: "rob@acmeskunkworks.io"
co_authors: []
category: fix
breaking: false
issues: ["A-1308"]
stats:
  files_changed:
  loc_added:
  loc_removed:
  commits:
---

## Fixed

- Prefer double-quoted YAML scalars in `serialiseString` whenever quoting is
  required, matching Prettier defaults and the changelog schema examples.
- Stop enrich/finalise from rewriting authored `created_at: "…"` /
  `merged_at: "…"` into single-quoted forms that fail consumer
  `prettier --check` ([A-1308](https://linear.app/rheged-studio/issue/A-1308)).
- Add explicit quote-style assertions in frontmatter and enrich unit tests.
