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

### 0.3.0

Pinned by #648 (combined plan #157, #540). It carries both upstream items the earlier next-bump checks named.

**audit-core#4, the `yaml` swap.** A harness walked `plugin/` with both 0.2.1 and 0.3.0 and compared all 32 components. There were no differences in `description`, `metadata.pillar` or `metadata.expects`, the whole frontmatter objects were identical, and no component produced a `readError` or `parseError`. A positive-control fixture (a colon-space description, a duplicate key, a `#` comment in a plain scalar, a flow-sequence pillar) showed every difference class, so the harness could see a change. The one consequence for pillars: a flow `pillar: [spec, verify]` now parses as an array, which `parsePillars` handles correctly, where 0.2.x produced the two bogus ids `[spec` and `verify]`. A comma-separated `pillar: spec,verify` still parses as the single string `"spec,verify"`. All 11 declarations in the corpus are single-valued. `gvt-dev` refreshed the stale parser comment in `lib/pillars.mjs` and kept the comma-separated encoding.

**audit-core#5, `loadComponent`.** An unreadable file now resolves to a `readError` entry, and malformed YAML to a `parseError` entry, instead of the call rejecting. Without a consumer-side diagnostic both would have been skipped silently, so `gvt-dev` added `lib/load-diagnostics.mjs`: a `readError` becomes an error finding of kind `component-unreadable`, a `parseError` becomes `component-malformed`, the audit prints its full report and then exits 2, and the diagnostic is not gated, so consumer audits get it too (ADR-0076). Separately, `loadComponent` rejects with a `TypeError` on a non-string `filePath` (it is async, so it rejects rather than throws); ADR-0057 Q2 records that as a second caller-contract violation. `gvt-dev` has no production call that can pass one. The runtime export list is unchanged at 12 names.

### 0.4.0

Pinned by #679, moving the exact pin from 0.3.0 to 0.4.0; the lockfile change touches only the audit-core entry.

**Corpus re-run.** The same walk was run under both versions from `plugin/`: `walkComponents(process.cwd())`, counting components, skills, agents, and entries carrying a `readError` or `parseError`. Under 0.3.0 at base commit `7bee2b6` it printed `0.3.0 components 32 skills 23 agents 9 flagged 0`. Under 0.4.0 it printed `0.4.0 components 32 skills 23 agents 9 flagged 0`. The corpus is unchanged and nothing in it is flagged.

**What 0.4.0 changes for gvt-dev, and what the audit does about each:**

- **`NO_FRONTMATTER` parseError.** A component with no frontmatter block now comes back with a `parseError`. The audit reports it as "is missing its frontmatter" and exits 2.
- **Symlinks and stat failures.** `walkComponents` follows symlinks and reports a stat failure as an unreadable component. A tree that cannot be listed comes back as one record named `'skills/'` or `'agents/'`. The audit reports an unreadable tree, and the README inventory skips that half rather than comparing against a partial list.
- **`evaluateFile` wording.** It now says what it found: `<probe> could not be checked (<code>)`, the same with `(dangling link, <code>)`, `expected a <probe>, found a <kind>`, and `expected a <probe>, found neither a file nor a directory`. "Not found" now means absence only.
- **New export `probePath`.** Adopted for #671 (prefer-chain resolution).

### Next-bump checks

- **`extractFrontmatter` on malformed YAML. Closed at 0.4.0.** The check was whether `extractFrontmatter` returning `{}` rather than a partial parse hides a defect in a direct caller, `lib/description-length.mjs` or `create-adr-evals/grade.mjs`. `frontmatter.mjs` is byte-identical in 0.4.0 (per the package diff, not re-measured here). Neither caller hides a defect. `descriptionLength(content)` and `renderedDescription(content)` have no production caller, only tests; production uses `descriptionLengthOf(c.frontmatter)`, and a malformed component has `frontmatter: null` and is reported as a load failure. In `grade.mjs`, malformed ADR frontmatter gives `{}`, so the D3 type/tags/title checks fail, which is the correct verdict with an imprecise reason; the `fm === null` "no frontmatter" check in the other grader is correctly not triggered by `{}`.
- **Tree-record naming.** The audit's handling of an unreadable tree relies on audit-core naming the record `'skills/'` or `'agents/'` (the `component-walk.mjs` labels). Re-check that naming on the next bump.
- **Absent versus error.** The "dangling link" wording and the split between absence and error rest on audit-core's `ABSENT_CODES` (`ENOENT`, `ENOTDIR`) and on `probePath`'s lstat confirmation of absence. If either changes, re-check the platform behaviour.
