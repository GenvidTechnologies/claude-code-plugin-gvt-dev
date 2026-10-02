---
type: decision-record
title: 'ADR authoring resolves the decisions location through `paths`; the `CLAUDE.md`-declared location is retired'
description: 'ADR authoring resolves the decisions location and next number through the renumber-adrs script, retiring the informal CLAUDE.md fallback.'
tags: [decisions, skill-shapes]
status: stable
---
# 0066. ADR authoring resolves the decisions location through `paths`; the `CLAUDE.md`-declared location is retired

- **Status:** accepted
- **Date:** 2026-10-01
- **Issue:** #582 (part of the docs→wiki chain #579)

## Context

`create-adr`, `tech-writer`, `plan-task`, `development-principles.md` principle #7, `code-reviewer`,
and the decision-record template each hardcoded `docs/decisions/` as the ADR location, with no
awareness of a themed subdirectory layout. The only accommodation for a repo that keeps its ADRs
elsewhere was an informal location stated in that repo's own `CLAUDE.md` — prose no script or skill
could read, and restated inconsistently across five sites rather than defined once. The chain's next
step (#584) moves this repo's own ADRs into `wiki/decisions/<theme>/`, which needs a resolver that
already understands themed layouts before that move can happen cleanly.

## Decision

**1. The `CLAUDE.md`-declared location is retired; precedence is now `paths['docs/decisions/']` in
`.gvt-agent.json`, then the `docs/decisions/` default.** This amends ADR-0062's Compromise section,
specifically the paragraph that "demotes it to a documented legacy fallback" with a three-tier
precedence (`paths` override > `CLAUDE.md` > default declared path) — that middle tier is dropped
entirely rather than kept as a fallback. ADR-0062 itself is left unedited: an accepted record is
immutable, and the correction is recorded here as a new record, the same way ADR-0041 amended
ADR-0015 rather than rewriting it. The rationale: the `CLAUDE.md` tier has no defined format, no
machine reader, and sat at an unclear precedence relative to the `paths` override it was meant to
back up. Measured at design time against a 10-repo local sample that mentions an ADR directory in
`CLAUDE.md`: 7 keep ADRs under `wiki/decisions/` and all 7 already set the `paths` override anyway, 2
use the default location, and 1 is not a consumer of this plugin at all — retiring the tier changes
behaviour for 0 of the 10 (a local-only sample, not a claim about the wider install base).

**2. `renumber-adrs.mjs --next` is the single resolver.** It owns resolving the decisions directory —
reusing the audit's own `resolveExpectationPath` mechanism (ADR-0062) — discovering its layout (flat,
themed, mixed, empty, or missing), and printing the next available number as one JSON object. Every
prose surface that needs the location or the next number now runs this command rather than
restating or re-deriving either. Rejected: a prose-owned resolution, where each surface's own text
lists `paths` then the default (restated at three sites, untestable, and prone to drift — a model
reading the prose follows the `paths` override only incidentally, the exact gap #580 identified).
Also rejected: keying the themed-vs-flat regime on whether a candidate directory happens to contain
an `index.md`, which fails on a consumer whose wiki-hosted ADRs have no decisions index at all.

**3. The registration regime is keyed on wiki membership, not on layout.** Resolve to a location
inside the wiki bundle (under `wiki.wikiDir`) and the record gets OKF frontmatter, is registered in
its theme's index (or the bundle-root index, for a flat wiki layout), carries no `docs/decisions/`
style `README.md` breadcrumb, and gets no `wiki/log.md` entry, since that log is ingest-scoped rather
than authoring-scoped. Resolve outside the wiki and today's behaviour is unchanged: a `docs/TOC.md`
Decision Records row and a breadcrumb.

**4. Themes are chosen interactively, inferred to an existing theme non-interactively, and never
created without an explicit instruction.** `create-adr` asks which theme when run interactively;
run headless with no theme named, it infers the best-matching *existing* theme and reports the
inference rather than guessing silently. `plan-task` proposes the theme at its existing plan
checkpoint rather than adding a new question to the flow. A new theme inside the wiki is linked
from the decisions root index **and** from the bundle-root `<wikiDir>/index.md`: `maintain-wiki`'s
lint counts a subdirectory index as reachable only when the bundle root links it directly, so a
theme reachable only through the decisions index would be reported as an unreachable subtree. Making
that check follow nested indexes instead is left to `maintain-wiki` (#598).

**5. Declined: an audit warning for a `CLAUDE.md`-declared location with no matching `paths`
override.** The same 10-repo sample that showed 0/10 affected by the tier's retirement would also
show 0 hits for this warning, and a prose classifier scanning `CLAUDE.md` for an ADR-location
statement carries a real false-positive risk for the value it would add.

**6. Verification is a repeatable headless harness, `create-adr-evals/`.** It exercises `create-adr`
end-to-end against fixture repos (with and without a `paths` override, including decoys designed to
turn a wrong-location resolution into a wrong number) and grades the result mechanically. The
harness's grader is unit-tested and that test suite runs in `commands.validate`; the harness's model
runs themselves are manual/orchestrator-run, not part of `commands.validate`.

## Compromise

Alternatives rejected:

- **Keeping the `CLAUDE.md`-declared location as a documented legacy fallback** (ADR-0062's original
  plan) — rejected per decision 1 above: it has no defined format, no machine reader, and the design
  sample showed it protecting zero real consumers once the `paths` override is accounted for.
- **Prose-owned resolution**, restating the `paths`-then-default precedence inline at each of
  `create-adr`, `tech-writer`, and `plan-task` — rejected per decision 2: three restatements drift
  independently, none of them are testable the way a script is, and a model reading prose follows
  the override only incidentally rather than by construction.
- **Keying the wiki/flat regime on the presence of an `index.md`** — rejected per decision 2: a
  consumer's wiki-hosted ADR directory can legitimately have no decisions index yet, which this key
  would misclassify as "not really in the wiki."
- **An audit warning for an unmatched `CLAUDE.md`-declared location** — rejected per decision 5: zero
  measured benefit against a real false-positive risk from classifying prose.

## Consequences

A `CLAUDE.md` that still states an ADR location keeps reaching the model as an ordinary project
instruction, but it is no longer part of the plugin's contract or read by any script — a mismatch
between that prose and the resolved location now surfaces as a placement or numbering disagreement
rather than being silently reconciled. The migration note for an affected consumer is to set
`paths['docs/decisions/']` in `.gvt-agent.json` instead of relying on `CLAUDE.md` prose. `create-adr`,
`tech-writer`, and `plan-task` now resolve the decisions location and the next number through
`renumber-adrs.mjs --next` rather than hardcoding or restating either, which is also what makes
#584's relocation of this repo's own ADRs into `wiki/decisions/<theme>/` tractable. #587 adds the
`decision-record` type this record's frontmatter regime (decision 3) assumes to the wiki schema.

**Related:** ADR-0062 (amended by decision 1; the `paths`-override resolution mechanism decision 2
reuses), ADR-0063 (`renumber-adrs`' recursive theme discovery and single-pass rewrite, which `--next`
builds on), ADR-0064 (the `wiki/` corpus and `docs/decisions/` exclusion handling this record's
wiki-membership regime composes with), ADR-0065 (the baseline re-key workflow a themed relocation
relies on), #582 (this issue), #579 (the docs→wiki chain), #584 (the ADR relocation this record
makes possible), #587 (adds the `decision-record` type to the wiki schema).
