---
type: decision-record
title: 'build-probe discards a probe only for the cost of keeping it, never for a forecast of need'
description: 'build-probe drops "the question cannot recur" as a discard reason; a probe is discarded only when keeping it duplicates a tool, needs a rewrite, or cannot be kept green.'
tags: [decisions, skill-shapes]
status: stable
---
# 0093. build-probe discards a probe only for the cost of keeping it, never for a forecast of need

- **Status:** accepted
- **Date:** 2026-11-05
- **Issue:** none; a maintainer decision made after #738 merged (PR #853)
- **Amends:** [ADR-0092](0092-build-probe-keeps-and-generalizes-probes-by-default.md), decision 1 (the closed list of discard reasons). The other decisions of ADR-0092 are unchanged.

## Context

ADR-0092 made keep-and-generalize the default in `build-probe`, and allowed a
discard for one of three reasons:

- (a) the question cannot recur;
- (b) an existing kept tool or a standing check already answers it;
- (c) the answer depends on context that cannot be parameterized out.

Reasons (b) and (c) are about the cost of keeping the probe: a second copy of
a tool, or a rewrite. Reason (a) is different. It is a forecast that nobody
will need the probe again. That forecast needs knowledge outside the current
task: where else the code could be used, and what later work will ask. The
author of the probe does not have that knowledge when the probe finishes.

The safe choice under that uncertainty is to keep the option open. A kept tool
is already there when another place needs it. A discarded one must be rebuilt.
Reason (a) let the old discard default return under a new name, because almost
any probe can be described as answering a one-time question.

The skill's own worked example showed this. It ended with "Discard, for reason
(a): the question cannot recur."

## Decision

**1. Discard only for the cost of keeping.** The closed list of discard
reasons in `build-probe` Step 5 becomes:

- (a) An existing kept tool or a standing check, such as `audit-conventions`, already answers the question. Extend that tool. Do not keep a second one.
- (b) The answer depends on context that cannot be parameterized out, so keeping the probe means rewriting it.
- (c) Its test cannot be kept green.

"The question cannot recur", "we won't need it" and similar forecasts of need
are not reasons to discard.

Reason (c) is not new. ADR-0092 decision 3 already said "A tool whose test
cannot be kept green is deleted, with that as its stated reason." This record
moves it into the list, so that the list is the one place that names every
discard reason.

**2. The worked example now keeps its probe.** The example's probe tallies the
required tools that `metadata.expects` declares across every skill. None of
the three reasons applies:

- `audit-conventions` reads the same declarations, but it checks each skill's required tools against `PATH` one skill at a time (the `for (const entry of expects.tools ?? [])` loop in `audit-main.mjs`, which calls `evaluateTool`). It does not tally them across skills, so it does not answer the question.
- The probe has no context to parameterize out beyond the skills directory.
- The probe has no test yet, so (c) cannot apply.

The verdict is keep. Because `audit-conventions` already walks the same
frontmatter, the natural home is an extension of the audit, not a second
walker. The probe's full source stays in the skill body, so the option is open
even though no such extension ships with this record.

## Compromise

- *Keep reason (a) with a stricter wording*, such as "a one-time migration that has already run". Rejected. Any wording still asks the author to forecast need from inside one task, which is the judgement this record removes.
- *Allow discard with any stated reason.* Rejected. A stated forecast is still a forecast. A closed list of cost reasons is what makes "keep" the default and not a suggestion.
- *Edit ADR-0092 in place.* Rejected. ADR-0092 has merged, and this repo records a change to an accepted decision in a new record (see ADR-0073, which amends ADR-0032, and ADR-0087, which amends ADR-0028 and ADR-0085). ADR-0092 gets one header line that points here.

**Cost accepted.** More probes are kept, so more tools need a test and a
catalogue entry. Reason (c) is the release valve: a tool that cannot be kept
green is deleted.

## Consequences

`build-probe` Step 5, its worked example, its frontmatter description, the
principle 3 sub-bullet in `plugin/docs/development-principles.md`, and the
`plugin/CHANGELOG.md` `[Unreleased]` section state the new list.

A probe author no longer writes a forecast to justify a discard. The author
either keeps the probe or names a cost.

Extending `audit-conventions` with a cross-skill tally of required tools is
open. No issue is filed for it by this record.
