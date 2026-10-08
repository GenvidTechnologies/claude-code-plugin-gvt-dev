---
okf_version: "0.2"
---

# Wiki Index

This is the wiki's table of contents — every page under `wiki/`, grouped
under section headings, one line each. `/gvt-dev:maintain-wiki` keeps this
list current: a new page is added here when it's created, and `lint` flags
any page listed in **no** index — here, or in a subdirectory's own
`index.md`. Each entry's description is the linked page's frontmatter
`description`, so the index and the page can't drift. See
`wiki/schema.md` for the page format and maintenance rules.

## Schema

- [Wiki Maintenance Schema](schema.md) — The maintenance rules for this wiki — page format and types, create-vs-update lifecycle, raw/ immutability, staleness policy, verb contract and wiki-links.

## Practice notes

- [The LLM-Wiki Pattern in gvt-dev](llm-wiki-pattern-in-gvt-dev.md) — How
  Karpathy's LLM-maintained-wiki pattern maps onto gvt-dev surfaces that
  predate maintain-wiki — docs/TOC.md, ADRs, run-retro/condense-lessons, and
  audit-conventions' hygiene scanners.
- [`audit-conventions` as Proto-Lint](audit-conventions-as-proto-lint.md) —
  How audit-conventions' hygiene scanners already act as an informal advisory
  content-lint over docs/** and CLAUDE.md, and where the boundary with
  maintain-wiki lint sits per ADR-0015.

## Process

- [Process](process/index.md) — How this repo runs its own working process: the issue-tracking rules its maintainers follow.

## Maintainer notes

- [Maintainer notes](maintainer/index.md) — Notes for people working on the plugin itself, not for its consuming repos.

## Decision records

- [Decision Records](decisions/index.md) — This repo's architecture decision records, grouped by theme and numbered in one chronological sequence across themes.
- [Plugin structure](decisions/plugin-structure/index.md) — Decisions about how the plugin is laid out, packaged, and configured for consuming repos.
- [Development practice](decisions/development-practice/index.md) — Decisions about the agent pipeline, commit ownership, and the principles governing this repo's own practice.
- [Plan execution](decisions/plan-execution/index.md) — Decisions about how plan-task and plan-next-issue check, commit, and structure their own execution.
- [Acceptance criteria](decisions/acceptance-criteria/index.md) — Decisions about how acceptance criteria are pinned, written back, timed, and graded.
- [Criteria authoring](decisions/criteria-authoring/index.md) — Decisions about how designer and planner author and guard test-criteria rules.
- [Audit conventions](decisions/audit-conventions/index.md) — Decisions about the audit-conventions skill's checks, severities, and scanning scope.
- [Audit core](decisions/audit-core/index.md) — Decisions about extracting and standing up the shared audit-core package.
- [Wiki and OKF](decisions/wiki-and-okf/index.md) — Decisions about the maintain-wiki skill's wiki and raw tiers and the OKF bundle format.
- [Skill shapes](decisions/skill-shapes/index.md) — Decisions about how individual skills are shaped, dispatch, and gate their own behavior.
