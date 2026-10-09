---
type: decision-record
title: 'gvt-dev adopts audit-core and deletes its five lib copies behind one re-export seam; the #458 deferrals are closed, relocated or ratified'
description: 'The five duplicated lib modules are deleted in favour of the pinned leaf, with a single re-export seam for callers outside the package scope.'
tags: [decisions, audit-core]
status: stable
---
# 0071. gvt-dev adopts audit-core and deletes its five lib copies behind one re-export seam; the #458 deferrals are closed, relocated or ratified

- **Status:** accepted
- **Date:** 2026-10-09
- **Issue:** #458, #550, #578 (see also GenvidTechnologies/audit-core#4, GenvidTechnologies/audit-core#5)

## Context

#458 is the issue the audit-core records have pointed at since ADR-0051: wire `gvt-dev` onto the published
`@genvidtech/audit-core` leaf and retire the duplicated code. By now the five `lib/` modules `component-walk`,
`config-resolve`, `evaluate`, `frontmatter` and `probes` are byte-identical to the leaf's `src/` (verified by sha256
against the installed package). #578 moves the exact pin from 0.2.0 to 0.2.1. #550 asks the policy-side modules to
stop carrying their own `fileExists`/`dirExists`. Earlier records also left four loose ends for #458 to settle: a
consumer-side drift check (ADR-0059), the `loadComponent` throw-safety fix (ADR-0057, ADR-0059), the two deferred
documents (ADR-0051), and one caller outside the package scope that the `#audit-core` alias cannot reach.

Settled context, not reopened here. No `npx`: ADR-0051 says "`npx` is rejected by name" and
"`metadata.expects.tools` is unchanged", so the tool declarations stay as they are. Imports inside `plugin/` go
through the `#audit-core` alias (ADR-0060). The `yaml` swap does not happen in `gvt-dev` (ADR-0060, decision A); it
is `audit-core#4`. The pin to 0.2.1 is behaviour-preserving for `gvt-dev`: the leaf's `src/` is byte-identical to
0.2.0 apart from `VERSION`, which `gvt-dev` does not read.

## Decision

Six decisions, all under the mechanism/policy boundary of ADR-0049: mechanism lives in the leaf, policy and the
gates stay plugin-side, and `PLUGIN_ROOT` stays derived.

1. **Delete the five copies; add one re-export seam.** The five `lib/` copies are deleted. Plugin code imports
   `'#audit-core'`. A plugin-side module, `lib/audit-core-reexport.mjs`, exports only `extractFrontmatter` by an
   explicit named list (never `export *`) and serves callers outside the package scope, namely
   `create-adr-evals/grade.mjs`. A test pins that the seam's export list is exactly that one name and that each
   export is the leaf's own binding, so the seam is provably a re-export and not a copy.
2. **No consumer-side drift check.** ADR-0059 said that detection of a changed leaf export surface under a bump is
   "where that detection lands or doesn't" at #458. It does not land, by decision. The surface is covered upstream
   by PR audit-core#7 (signature tests) plus the dts-parity check. Under an exact pin that is sufficient, because a
   bump is an explicit, reviewed act. Re-entry conditions: the pin becomes a range, upstream drops those tests, or
   a second consumer appears.
3. **`loadComponent` throw-safety is ratified as relocated to audit-core#5.** ADR-0057 (Q2) and ADR-0059 assigned the
   fix to #458. A 2026-09-23 triage comment moved it to audit-core#5, and nothing recorded the move; this record
   ratifies it. `gvt-dev` has no direct production caller of `loadComponent`, and the fix belongs in the leaf's
   `src/`, not in a consumer.
4. **#550 is folded in.** The policy modules `hygiene-probe`, `migrate`, `practice-detect` and `state-detect` take
   `fileExists`/`dirExists` from the mechanism leaf, which is the dependency direction ADR-0049 allows (policy
   depends on mechanism). Two things are recorded.
   - `dependency-preflight` keeps its own `dirExists`. It must use node built-ins only, because it checks the
     dependency itself before anything can be imported.
   - `state-detect`'s local helper used `fs.access`, which accepts any path type, so a *directory* at
     `.gvt-agent.json` used to read as `migrated`. Under the leaf's `stat().isFile()` it reads `greenfield`. The
     user accepted this behaviour change at the design checkpoint, and a new `state-detect` test pins it.
5. **The two deferred documents land in `wiki/maintainer/`.** ADR-0051 deferred the adoption-posture write-up and
   the leaf-dependency ledger until `gvt-dev` first pins a leaf, and that has now happened. They are
   `wiki/maintainer/leaf-dependency-posture.md` and `wiki/maintainer/leaf-dependency-ledger.md`. This amends
   ADR-0051's `plugin/docs/` home for the posture document, as ADR-0068 already re-homed the ledger. The audience
   is maintainers and nothing is runtime-imported, so neither ships.
6. **Tests repoint to the leaf.** The seven unit-test files that exercised the copies now import `'#audit-core'`,
   so no coverage is lost. An upstream ticket asks audit-core to adopt the frontmatter (21) and config-resolve (9)
   tests, which it lacks. When it does, `gvt-dev` re-evaluates its copies of those tests; they are not deleted
   automatically.

## Compromise

**Seam alternatives, rejected (decision 1).**

- *B, keep `frontmatter.mjs`.* It would become a stale second parser once `audit-core#4` lands, and audit-core's
  upstream-identity probe would misreport the copies as "retained, unused".
- *C, a `createRequire` anchored inside `plugin/`.* Works in principle but is obscure, and the first attempt failed.
- *D, a manifest in `create-adr-evals`.* The leak-guard blocks the scoped name in code, and ADR-0060 rejected widening
  its exemption beyond the two `plugin/` files.
- *A', route all plugin code through the seam.* Adds an indirection that ADR-0060 did not ask for; the alias already
  works everywhere inside `plugin/`. The seam therefore serves only the one out-of-scope caller.

**Drift check not built (decision 2).** `gvt-dev` gives up an independent tripwire on the leaf's export surface and
relies on upstream tests that another repo owns. That is acceptable only while the pin is exact; the re-entry
conditions name the three ways it stops being so.

**Behaviour change accepted (decision 4).** A directory at `.gvt-agent.json` now reads `greenfield` rather than
`migrated`. That is the more correct reading, but it is a deliberate departure, not a pure refactor, and is
recorded in the CHANGELOG as well.

**Test copies kept (decision 6).** Keeping the frontmatter and config-resolve tests duplicates coverage that should
live upstream, which is a cost until the upstream ticket lands.

## Consequences

- The audit's output on this repo is unchanged, because the copies were byte-identical. That makes a green audit
  weak evidence that the rewire happened, so the import-path checks and the leaf-mutation checks carry that proof.
- `audit-core`'s upstream-identity test can retire once #458 closes as completed; closing with the wrong reason
  keeps the leaf frozen.
- Bumping the pin now means reading the ledger's newest entry first. Its next-bump checks name `audit-core#4`
  (the `yaml` swap changes parse results) and `audit-core#5` (the `loadComponent` return shape).
- Prose citing the deleted files by name or `file:line` is in the pointer corpus and has to be repointed by anchor;
  this record cites other records and files by name and section for that reason.
