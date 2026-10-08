---
type: decision-record
title: 'Skills, agents and scripts resolve declared expectation paths through the existing `paths` override'
description: 'Skills and agents resolve a declared expectation path through the same paths override the audit already uses.'
tags: [decisions, plugin-structure]
status: stable
---
# 0062. Skills, agents and scripts resolve declared expectation paths through the existing `paths` override

- **Status:** accepted
- **Date:** 2026-09-28
- **Issue:** #580 (part of #579; the issue-triage slice of #388)

## Context

`.gvt-agent.json` `paths` overrides are honoured only by `/gvt-dev:audit-conventions`; skills and
agents hardcode their declared paths (#374/#388). A repo relocating a contract doc — for example
into its wiki bundle, as the docs→wiki chain (#579) does — breaks in two ways: `triage-issues` §0's
near-miss scan of top-level `docs/` finds nothing at the old location and concludes the contract is
absent, scaffolding a competing template at `docs/issue-triage.md` (silently under
`--non-interactive`); and `issue-triage-analyst` reads the hardcoded path rather than the relocated
one.

## Decision

Skills, agents and scripts now resolve a declared expectation path at runtime through the same
override the audit already applies: `paths[<declared path>]` when set in `.gvt-agent.json`, else the
declared path unchanged. This is stated as a contract rule in `plugin/CONVENTIONS.md`'s new "Runtime
path resolution" subsection, so it generalizes beyond any one skill rather than being reinvented per
consumer.

`triage-issues` and `issue-triage-analyst` are the first adopters. `triage-issues` §0 resolves
`paths['docs/issue-triage.md']` once, at the top, and every later step means that resolved path: the
near-miss scan covers the top level of the resolved parent directory and of `docs/` (both
non-recursive), §0b scaffolds at the resolved path (adding minimal OKF frontmatter when the path
falls inside `wiki.wikiDir`), §0c indexes it, and §1 dispatches it to the analyst. The analyst reads
the conventions path it is dispatched with, rather than a hardcoded literal. With no `paths` override
set, resolution returns the declared path unchanged, so behaviour is byte-identical to before this
change.

This fits the wider system as a small architectural correction rather than a new mechanism: the audit
already implements exactly this resolution for its own `metadata.expects` walk, so the change extends
an existing seam to the runtime skills/agents reading the same declared paths, rather than inventing a
second one.

## Compromise

**Rejected: new semantic keys per location** (e.g. `paths.decisions`, `paths.issueTriage`, …). A
second name per relocated file can drift from the declared path it's meant to redirect, grows the
reserved-key surface with every new contract doc, and the audit would still evaluate the old declared
path unless both were kept in sync by hand.

**Rejected: an implicit wiki convention** — inferring relocation by checking whether a
`<wikiDir>/…` path happens to exist. Invisible to the audit (nothing declares it), ambiguous when
both the old and new locations exist, and doesn't generalize past the wiki case. Kept only as #385's
schema-resolution fallback step, not adopted as the mechanism here.

**Rejected: the informal `CLAUDE.md`-declared ADR location as the resolution mechanism.** It's prose a
script or the audit can't parse. A later chain issue (#582) demotes it to a documented legacy
fallback, with precedence `paths` override > `CLAUDE.md` > default declared path — but it is not the
primary mechanism this record adopts.

## Consequences

Consumer-facing and additive: a consuming repo that sets a `paths` override for a declared expectation
now gets it honoured by the skills and agents that read that expectation, not only by the audit. A
repo that sets no override sees no behaviour change.

The chain's pointer ratchet applies to this record and its adopters: any edit that shifts lines above
a baselined positional pointer must either land below the cited range, stay line-count-neutral above
it, or repair the pointer to an anchored form and prune the baseline — never delete-and-reaccept.
ADR-0039's two stale, unanchored citations into `triage-issues`' skill body are repaired to anchored
form as part of this same issue.

**Related:** ADR-0002 (a component's declared path is its identity, which resolution must preserve
while redirecting where it is read from), ADR-0006 (the two-surface external-system pattern this
resolution rule composes with — structured `paths` override plus prose contract doc), ADR-0020
(`triage-issues`' existing near-miss contract-resolution logic, which this record extends to operate
on the resolved path rather than only the declared one).
