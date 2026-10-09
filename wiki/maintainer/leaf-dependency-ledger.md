---
type: practice-note
title: 'Leaf-Dependency Ledger'
description: 'Per-version record of each pinned leaf library, what each version changed for gvt-dev, and the checks to run before the next bump.'
tags: [maintainer, dependencies]
status: stable
---
# Leaf-Dependency Ledger

Routing test: would the text need editing when the next version ships? Then it belongs in this ledger. If it survives every version, it belongs in the [Leaf-Dependency Posture](leaf-dependency-posture.md).

Entries never assert the current pin; `plugin/package.json` is the authority. Entries are ordered oldest first, so the newest is last, followed by the next-bump checks.

## @genvidtech/audit-core

### 0.2.0

Pinned by #477 and #478 for the dependency preflight. Declared but not consumed: nothing imported it yet (ADR-0060).

### 0.2.1

Pinned by #578. What shipped upstream: a comment change in `index.d.ts`, the `VERSION` export becoming `'0.2.1'` (`gvt-dev` never reads it), and test-only changes; `src/` was otherwise byte-identical to 0.2.0.

What `gvt-dev` did: adopted it in the #458 rewire and deleted its local copies of the mechanism modules (ADR-0071).

### Next-bump checks

- **audit-core#4** (the `yaml` swap changes parse results). Re-check the comma-separated pillar encoding in `lib/pillars.mjs`, whose comment says the 0.2.x parser cannot parse scalar sequences, and re-check the description-length measurement.
- **audit-core#5** (`loadComponent`'s behaviour on a missing or unreadable file). Re-check the direct `loadComponent` test in `test/component-walk.test.mjs`.
