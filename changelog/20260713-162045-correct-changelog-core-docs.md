---
title: Correct changelog-core docs to the shipped in-repo enrich model
release_note: null
created_at: "2026-07-13T16:20:45Z"
branch: a-952-docs-correct-changelog-core-repo-docs-to-the-shipped-in-repo
author: rob@acmeskunkworks.io
co_authors: []
category: docs
breaking: false
issues:
  - A-952
---

## Changed

- Rewrote `changelog/README.md`'s Lifecycle section from the retired
  orchestrator-run finalise model (`release-please release-pr` then
  `finalise-changelog.ts`, committed into the release PR) to the shipped in-repo
  model: the shared `reusable-changelog-enrich.yml` (`mode: enrich` /
  `mode: finalise`) driving the `changelog-core` CLI after merge ([A-801](https://linear.app/acme-skunkworks/issue/A-801)). Fixed
  the dead `build-and-lint` CI job name to `lint`, and documented that this repo
  is the publish-only exception that does not self-enrich its own entries.
- Replaced the copied `npm-package-template` boilerplate in `CLAUDE.md` that
  misidentified the repo: rewrote the `## Repo` identity to the real
  `@acme-skunkworks/changelog-core` package (contract + seven-subcommand CLI),
  dropped the template-generation checklist, corrected the
  "disabled/placeholder `src/`" Release preamble, and fixed the stale
  `infrastructure/` scripts table, ESLint override description, `tests/` paths,
  and remaining `npm-package-template` references ([A-803](https://linear.app/acme-skunkworks/issue/A-803), [A-802](https://linear.app/acme-skunkworks/issue/A-802)).
