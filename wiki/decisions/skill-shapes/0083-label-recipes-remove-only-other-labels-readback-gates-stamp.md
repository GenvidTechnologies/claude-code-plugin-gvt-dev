---
type: decision-record
title: 'Triage label recipes remove only the other labels, and a readback gates the `triaged` stamp'
description: 'triage-issues set recipes add the target label and remove only the other labels in its set; a label readback gates the triaged stamp; a legacy guard covers already-scaffolded contracts.'
tags: [decisions, skill-shapes]
status: stable
---
# 0083. Triage label recipes remove only the other labels, and a readback gates the `triaged` stamp

- **Status:** accepted
- **Date:** 2026-10-26
- **Issue:** #659 (with #631; part of the combined plan pledged on #246)

## Context

The bundled triage contract templates' Set category, Set type and Set priority recipes listed the label
being added inside the same call's `--remove-label` set. The label silently ended up absent while
`gh issue edit` exited 0, and the issue was still stamped `triaged`. This was observed repeatedly:
gvt-construct3 #151, burbank-playfab (3 of 4 issues), and this repo (#702 and a 7-issue batch). The
mechanism inside `gh` is inherited from #659's reading of the gh 2.102.0 source; it was not re-verified
here.

#631 separately asked for a readback of an issue's labels before the `triaged` stamp, so a write that
did not land cannot be stamped as done.

## Decision

**1. Set recipes use the others-only form.** `--add-label "<target>" --remove-label "{otherTypes}"`
(and `"{otherPriorities}"` for priority). Each placeholder is the set with the label being added
removed, and `--remove-label` is omitted when that set is empty. Applied to both bundled templates
(`issue-triage.template.md`, `issue-triage.flat.template.md`) and to this repo's own contract
(`wiki/process/issue-triage.md`). gvt-construct3 already ran this form in its own contract.

**2. A readback gates the stamp.** After an issue's label writes, `triage-issues` §3 reads the labels
back (`bugTracker.readOne`, or the native view). On a mismatch it re-applies once, then treats the issue
as a failed write and does not stamp it. §5 reports readback results rather than exit codes, and §0a
verifies applied labels the same way.

**3. A legacy guard covers contracts already scaffolded into consumer repos**, which template fixes
never reach. §0c warns, report-only, on a set recipe that names its own label in its remove list. §3
strips that label from the remove list for the call and notes it in §5. Consumer contracts are never
edited.

## Considered options

- C1 (others-only) is CHOSEN
- C2 (two calls, remove first) is rejected: unlabel/relabel churn plus a no-label window.
- C3 (add first, then remove the others) is rejected: it needs `{other*}` anyway.
- #631's "one gh issue edit per issue" is declined: #659 shows the race happens inside a single call.
- Legacy guard: BOTH. A §0c report-only warning, plus a §3 strip of the target from the remove list,
  noted in §5.

## Consequences

- Existing consumer copies keep the old recipe until their owners edit them; the legacy guard covers
  that gap without touching their files.
- Whether re-setting an already-present label also drops it is UNVALIDATED. The others-only form makes
  the question moot, since the target is never in the remove list.
- A label write that did not land is now caught before the stamp, whatever its cause, not only the
  self-overlap case.
- Related triage-issues detection and registration work is recorded in
  [0084](0084-near-miss-nominate-plus-veto-registration-follows-location.md).

Implemented in a25de0b (templates), a13f796 (this repo's contract) and cc0f763 (`triage-issues`
SKILL.md readback and legacy guard).
