---
type: decision-record
title: 'Phase artifacts are persisted by the orchestrator with checked hand-off fidelity, and records follow the assertions they make'
description: 'plan-task persists the analysis and design as plan.requirements.md and plan.design.md, checks the hand-off entry by entry, defers records until their assertions hold, and sweeps the shortcut paths by reference.'
tags: [decisions, plan-execution]
status: stable
---
# 0086. Phase artifacts are persisted by the orchestrator with checked hand-off fidelity, and records follow the assertions they make

- **Status:** accepted
- **Date:** 2026-10-28
- **Issue:** #185 (canonical; combined plan with #216, #224, #404, #410, #413)

## Context

`plan-task` hands work between an analyst, a designer, a planner and the orchestrator, and each hand-off had a way to lose content without anyone noticing.

- **Persistence (#185, #413).** The analysis and the design lived only in the dispatch hand-back messages. Nothing on disk survived the session, so a later session, a re-dispatch or a reviewer could not read what the design said. The user required the artifacts to be durable.
- **Coverage and fidelity (#216, #410).** The design named the files it touched only in prose, and a multi-issue design's issue-to-file assignments were never reconciled against the planner's tasks cell by cell, so a file could sit in some task and still leave another issue's change to it uncovered. The Test Criteria table was relayed verbatim through the orchestrator's context, and nothing detected a row that kept its id but lost a clause on the way to the plan or the issue body.
- **Record ordering (#224).** A record could be written before the task that makes its assertions true had run, so it described a state that did not yet hold. The alternative of writing a placeholder collides with the no-placeholder rule in Phase 4 step 6.
- **Empty results and the shortcut paths (#404).** The positive-control rule from #218 (a zero-hit check needs a control that shows the check can hit) covered only the zero-hit case, not a check that prints nothing or reports skip or no-op. The shortcut paths, where the orchestrator authors the plan itself, ran without the designer and planner rules at all.

Measured on this machine on 2026-10-27, these facts shaped the persistence choice:

- Headless `claude -p` Write is denied in the session scratchpad in both default and acceptEdits modes. Only a gitignored path inside the working directory is writable, and only under acceptEdits.
- Interactive subagent writes succeed.
- Subagent task `.output` files were 0 bytes, so a report exists only in the hand-back message.
- Auto-persisted reports can begin with a `[harness:` preamble line.

## Decision 1: phase artifacts are persisted by the orchestrator; hand-off coverage and fidelity are checked

**Persistence (W1).** The orchestrator persists the analysis as `plan.requirements.md` and the design as `plan.design.md`, beside `plan.md`. The pipeline agents stay read-only, which preserves ADR-0004. A verbatim hand-off set travels to the next agent by path, and the artifacts follow `plan.md` for gitignore, multi-session handling and PR creation.

**Coverage (W2).** The designer's output gains `## Affected Files` and `## Assignment Table`. The planner gains an item that produces `## Coverage`, where the unit is the entry: a file already present in some task does not cover a cell that is missing.

**Fidelity (W2).** One approval row, "Hand-off fidelity, entry by entry", runs in two modes: exact-copy for the Test Criteria rows, their command blocks and the option labels, and accounted-for for the Affected Files entries and Assignment Table cells, checked through `## Coverage`. It is re-run at the Phase 4 step 4 issue-body write, so the check covers the second transcription as well as the first.

**Exact-copy scope was narrowed after sampling.** The design first said every cell's text must be unchanged and in order, with separators allowed to differ. Sampled against this branch's own design table and the acceptance checklist transcribed from it into the #185 issue body, that wording passed none of the 33 rows: ordinary transcription folds the Type column, rewords the requirement label and capitalises "block". The shipped rule is that each row's Verification cell appears intact (case and whitespace aside, additions allowed), the requirement label may be reworded, the Type column may be folded, and commands are byte-identical. On the same pair it passes 31 of 33 rows. One of the two failures (C8 among the acceptance rows on #185) differs by a recorded correction. The other (O4) differs by one unrecorded comma, which is a true difference the rule should report. The rule still fails when a clause is dropped from a verification cell, which is its negative control. The user chose the narrowed rule.

**Adjacent items.** Item 16's remedy was reworded in place to re-dispatch with `plan.design.md`; the audit-gated optional step passed with 0 errors. ADR-0030 and ADR-0080 are unchanged, and `plan-task`'s sentence "Pass the designer's `## Test Criteria` table through verbatim" is not edited.

## Decision 2: records follow what they assert; positive controls cover empty results; the shortcut sweep is by reference

**Records follow assertions (W3).** The planner's item 6 is edited in place so that a record (an ADR, a CHANGELOG entry, a doc) is ordered after the task whose outcome it asserts, deferred until that task lands rather than written with a placeholder: a placeholder ships if the later task fails, and it collides with Phase 4 step 6's no-placeholder rule. Acceptance-criteria pledges are exempt, since they state what must become true, not that it already is.

**Positive control widened (#404).** The zero-hit rule from #218 now also covers a check that prints no output and a skip or no-op report. For an invoked command, the control is evidence that the command reaches the code under test on the pre-change tree. The designer takes the rule as a sub-bullet after its zero-baseline sub-bullet, not at the zero-hit rule's own line, because editing that line in place breaks 7 ADR-0038 citations (measured). The planner takes it in place. Both graders carry one byte-identical sentence.

**Shortcut sweep (W4).** On the shortcut paths the orchestrator authors the plan and applies designer steps 5, 8 and 9 and planner items 10 to 12 by reference, plus an approval row. Before this change, a sweep of 85 planner and designer obligations found 28 covered on the shortcut paths, 22 partly covered, 31 not covered and 4 not applicable. The by-reference rule closes the criteria-authoring gaps, which carry the defects most likely to ship because their rows go straight into the pledged checklist. The plan-shaping obligations (mirror fidelity, throwaway steps, the consumer-workflow trace, the library-versus-custom choice and similar) stay with the checklist's lightweight friction pass.

**Dogfooded here.** The plan ordered the CHANGELOG before this record, but the CHANGELOG entry cites this record's number. The order was swapped: the record is authored first, then the CHANGELOG, per the rule this record states.

## Compromise

```
W1-A (chosen): orchestrator persists plan.requirements.md and plan.design.md; agents stay read-only
W1-B (rejected, follow-up): agents write via a Write tool scoped by a PreToolUse Write/Edit hook keyed on agent_type
reverses ADR-0004's read-only pipeline; needs a hook, a lib and tests; rests on an untested Write-matcher claim; headless runs deny the write in default mode
W1-C (rejected): the scratchpad or a tracker comment
scratchpad does not survive the session (durability was required); a tracker comment is size-limited and an external best-effort write

W2-A (chosen): Affected Files, Assignment Table, Coverage, one approval row with two modes
W2-B (rejected): rewrite item 16 in place
one row with two remedies dilutes the reconstruction tell
W2-C (rejected): use the analyst's Touch Points as the source
the planner never receives them, they predate the design, and they have no target dimension

W3-A (chosen): edit item 6 in place
W3-B (rejected): a new item later in the list, which splits ordering away from item 6
W3-C (rejected): a Key Principles bullet, which is not a process step

W4-a (chosen): by reference
W4-b (rejected): dispatch the designer for criteria authoring on the shortcut; the planner-side rows still need (a), and it costs a dispatch per run
W4-c (rejected): copy the rules; 53 copies that drift
```

W1-B is kept as a follow-up in case the inline-copy proof catches loss in practice; it is to be filed as its own issue, not decided here. W2-A is chosen over B because two remedies in one row blur which failure a reviewer is looking at. W4-a keeps the user's default of the lighter shortcut, at the cost that "by reference" relies on the orchestrator actually opening the rules it cites.

**What this costs.** The orchestrator writes two more files per plan and runs one more approval row, twice. The exact-copy rule is deliberately weaker than the design's first wording, so it tolerates reworded labels; it will not catch a changed label that matters. On the shortcut paths, the plan-shaping obligations get only the lightweight friction pass, not the designer's full audit.

## Consequences

- ADR-0004 stands: the pipeline agents remain read-only, and the persisted artifacts are the orchestrator's writes.
- No pointer repair was forced. Every placement sits at a measured-safe position, and `.pointer-baseline.json` is unchanged.
- ADR-0030 and ADR-0080 are unchanged.
- The #218 rule now has a wider reach, so a check with no output or a skip report needs a control that shows it can fire.
- W1-B is to be filed as a follow-up issue, to be taken up if the inline-copy proof is seen to lose content.
