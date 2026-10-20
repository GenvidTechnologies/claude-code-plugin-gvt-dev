---
type: decision-record
title: 'A Test Criteria command keeps its meaning on every hop: a designer format rule (no pipe in a cell command, fenced blocks keyed by row id), mirrored in the planner, plan-task and both graders; ADR-0037''s tripwire holds'
description: 'designer.md gains a group-1 lead and two group-2 sub-bullets so a criterion command survives the table, the planner, the issue body and the graders unchanged, mirrored in planner, plan-task, validator and code-reviewer.'
tags: [decisions, criteria-authoring]
status: stable
---
# 0080. A Test Criteria command keeps its meaning on every hop: a designer format rule (no pipe in a cell command, fenced blocks keyed by row id), mirrored in the planner, plan-task and both graders; ADR-0037's tripwire holds

- **Status:** accepted
- **Date:** 2026-10-20
- **Issue:** #553 (canonical). The work spans #640 and #719 and was planned and shipped as one combined change.

## Context

A Test Criteria command crosses several hops: the designer's table, the planner's transcription, `plan-task`'s
splice into the issue body, the implementer's brief, and finally the validator and the code-reviewer. No hop
renders the markdown table. A command in a cell must write `|` as `\|` for the table to parse, but every reader
downstream sees the raw text, so the backslash stays part of the command. The same command therefore means
something different in the table than in the shell.

Four pipe shapes behave differently, which is why neither a blanket ban nor a blanket un-escape is right:

- **ERE or `rg` alternation.** The escape turns alternation into a literal pipe and the pattern goes dead.
  Measured: `a\|b` matched 3 lines under BRE grep, 1 under `grep -E` and 1 under `rg`, on the same input.
- **Literal-pipe regex.** The escape is intended under `-E` or `rg`, and un-escaping would break it.
- **BRE alternation.** `\|` is alternation under plain grep, so the escape is correct as written.
- **Shell pipeline.** An unescaped `|` splits the cell and an escaped one is no longer a pipe.

The filed evidence: #686 (construct3-chef#256) printed 0 for an escaped alternation where the unescaped form
printed 3, and #640 collected the sibling cases.

Two neighbouring failures share the root "the command does not do what the row says":

- **#719**: a command carrying a placeholder, an elision or "same as above" cannot be run, so the baseline beside
  it was not measured by it, and a grader handed the row cannot run it either.
- **#553**: a row whose own command, run as written, does not reproduce its stated baseline. Either it is
  well-formed but dead (gvt-construct3#128: `\[0-9\]` under `-E` printed 0 against a stated baseline of 2) or it
  is malformed, so grep exits 2 with nothing on stdout and a trailing `|| echo 0` reads that as a zero.

## Decision

The options, quoted from the approved design (labels and one-line reasons are the design's own words, not a
paraphrase):

- **Chosen, quoted from the design: "Option A: no `|` in a cell command, plus a fenced command block keyed by row id (recommended)".** The design's reason: "Additive only; keeps the table and its scanability at the Phase 2 checkpoint; keeps the rationale in `designer.md` line 108 ("never as a fourth table column") intact; adds one new hop obligation: the Phase 3 hand-off must carry the blocks with the table." (Line 108 was the bullet's position when the design was written; this change's own insertions have since moved it, which is why this record cites it by its quoted phrase.)
- **Rejected, quoted from the design: "Option B: emit Test Criteria as a list instead of a table".** The design's reason: "largest footprint, and it doesn't remove the need for the rule."
- **Rejected as the mechanism, quoted from the design: "Option C: the planner un-escapes `\|` on transcription and flags literal-pipe/BRE cases (#640 b, #686 remedy 2)".** The design's reason: "kept only as the repair-by-intent procedure inside Option A."
- **Rejected alone, quoted from the design: "Option D: `-e` lists only (#640 a)".** The design's reason: "kept as an allowed way to keep a command in its cell."

**Surface choice.** The rule lives where the table is authored: a designer format rule, over a planner transform
(which would fix the command after the damage and could not tell a literal-pipe regex from a dead alternation
without re-deriving intent), over a list format (which changes the artifact the Phase 2 checkpoint reviews).
Everything downstream mirrors the rule and checks it.

**What shipped.**

- **Designer.** A new group-1 bolded lead, "A command containing a pipe never sits in a table cell, escaped or
  not". It states why a cell escapes the pipe, that no hop renders the table, the four shapes with their distinct
  handling, and the rule: rewrite without a pipe where natural (`-e` lists, `grep -c` rather than `| wc -l`), or
  put the command in a fenced block keyed by row id, one line per command, and name the block in the cell. Run the
  row's positive control through the same command in the same block. A sub-bullet under the zero-hit lead adds a
  must-match control for a zero baseline under a pass condition above zero. Two sub-bullets under the group-2
  lead "The baseline must come from executing the row's own literal command" say that commands are complete (no
  placeholder, no elision, no "same as above") and that a row whose own command does not reproduce its stated
  baseline is defective, naming both shapes (well-formed but dead, malformed with exit 2) and the invoked-command
  case (run it once against the pre-change tree, on a temp copy if it would write). The Output Format template
  gains an example row and a keyed command block, fenced with tildes because the template already sits inside a
  backtick fence.
- **Planner.** Five new sub-bullets at the end of item 12: a cell pipe is a transcription defect and is never
  blanket un-escaped (settle intent by running each alternative alone and reading the row's prose, then move it
  into a block and re-run with a positive control); copy block commands byte-for-byte, and a row naming a block
  that did not arrive is a gap flagged the way item 10 flags a missing table; a placeholder or elided command is
  recorded under `## Premise corrections` as defective; a zero baseline needs a must-match control; a
  non-reproducing baseline is defective unless the tree moved.
- **plan-task.** Phase 3 gains two paragraphs: "verbatim is byte-for-byte for a command" with the table passed
  together with its command blocks, and a non-reproducing baseline tied to the *defective* failure mode that property (4) of "The pledged
  target itself can be defective" names. The mid-run paragraph and the shortcut-path bullet each gain a sentence
  applying the container rule to rows authored there. The brief-quoting paragraph now reads "a fenced list, or a
  table only when no string contains a pipe". `approval-and-audit.md` gains a self-audit item, "Every criterion
  command runs as written".
- **Validator and code-reviewer.** `unverifiable-as-written` gains a fourth case, kept parallel in both files:
  a placeholder or elided command, or a dead alternation (an ERE, `rg` or `awk` pattern carrying `\|` where each
  alternative alone matches and the as-written pattern does not) whose as-written result is the row's passing
  value. A BRE grep reading the escaped pipe as alternation is stated to be correct and not this case. When the
  as-written result contradicts the expected value, the row is graded not satisfied, with the dead pattern named.
  Each file's definition sentence widens to "...or cannot be run as written at all".
- **ADR-0038 re-anchor.** The two line-89 citations of the designer's "Measure the baseline" bullet in ADR-0038
  now name the file and keep the quoted anchor, so they are no longer line pointers and cannot decay when the new
  designer text shifts lines. The pointer baseline was pruned from 98 to 97 entries with the tool's prune-only
  run. The repo's pointer count went from 128 to 126, since the two citations were removed and none was added.

**The two approved refinements.**

1. **The decay carve-out.** A non-reproducing baseline that does reproduce at the design's base commit
   (`git show <base>:<path>` through the same command, or a scratch copy of the base for an invoked command) means
   the tree moved: the row is *decayed*. Otherwise it is *defective*. This applies to the planner and
   `plan-task`. The designer authors against the live tree, so it has no decay case.
2. **The grader split.** A placeholder or elided command is `unverifiable-as-written`. A dead alternation is
   `unverifiable-as-written` only when its as-written result is the row's passing value (the false-green case).
   When it contradicts the expected value the row stays not satisfied, with the dead pattern named so it can be
   amended as defective.

**No new marker token.** The author and transcription sides use the existing *defective* and *decayed* words and
name subshapes in prose ("well-formed but dead", "malformed (exit 2)", "elided"). The graders reuse
`unverifiable-as-written`.

## ADR-0037 axis result

ADR-0037's test has two steps: does the new rule fit an existing group's axis, and only if it opens a genuinely
new axis is it a new group. The new designer lead extends group 1's axis (a pattern surviving its container) as
a sibling of the prose-markup sub-bullet. The two baseline sub-bullets and the zero-baseline sub-bullet extend
existing leads under group 2 and group 1. Step one resolves each time, step two never fires. **The tripwire does
not fire: no new group.**

## Compromise

- **An extra block to keep in sync with the table.** A pipe-bearing command now lives in a fenced block keyed by
  row id, away from the row that cites it. A row edited without its block, or a block left behind after its row
  is dropped, is a new way to drift. The planner's "block that did not arrive" gap check catches a missing block
  at transcription; nothing yet checks for an orphaned block or a row edited without its block.
- **A new hop obligation.** The Phase 3 hand-off must carry the blocks with the table. A hand-off that summarizes
  the table or forwards only the table is now a named dispatch defect, and every future hop that re-renders the
  criteria inherits the obligation.
- **Graders' definition widened.** `unverifiable-as-written` previously meant a check that runs but cannot
  discriminate. It now also covers a check that cannot be run as written at all. The split keeps a contradicting
  dead pattern as not satisfied, which means a grader must run the as-written command and compare, not just
  inspect it.
- **Rejected: Option B (a list instead of a table)** for its footprint, and because it removes neither the
  pipe rule nor the need for blocks. **Rejected as the mechanism: Option C (planner un-escape)**, because the
  four shapes cannot be told apart without re-deriving intent; it survives only as the repair procedure.
  **Rejected alone: Option D (`-e` lists)**, which cannot express a shell pipeline or a literal-pipe regex; it
  stays an allowed way to keep a command in its cell.

## Consequences

- **A future criterion-command hazard extends the container lead.** A new way for a command to change meaning in
  transit is a sub-bullet of the group-1 lead, not a new lead; the planner item and the graders' paragraph change
  in step.
- **Dogfooding lag.** This repo dogfoods the designer, planner, `plan-task` and graders from the installed plugin
  cache, so the rules take effect here only after a release and a plugin update. The change that authored them
  could not exercise them. ADR-0037 recorded the same limitation.
- **Pointer-anchor ratchet.** The planner, `plan-task` and grader insertions sit below every line other
  documents pin there. The designer insertions do shift pinned designer lines; the bare citations of them are
  accepted by content and survived the shift, and the one anchored citation that would have drifted (ADR-0038's)
  was re-anchored first, so the ratchet was pruned rather than re-taken. Future edits above a cited line should
  move the edit or re-anchor the citation rather than re-take the ratchet (ADR-0050).
- **The plugin version is unchanged at 4.38.0**; the behavioral change takes its bump at release.

## Regression worksheet

Each shape, the shipped rule that fires on it, and the corrected form on which none fires. The original is the
positive control for its rule and the corrected form the negative control. Graders apply the shipped agent text,
not this table.

| Shape | Original | Fires | Corrected form | Fires |
|---|---|---|---|---|
| ERE or rg alternation | escaped alternation under `-E`, baseline 3, printed 0 (#686) | designer container lead / planner cell-pipe defect; grader dead alternation | unescaped alternation in a keyed block, with a positive control | none |
| Literal-pipe regex | a pattern needing `\|` for a real pipe | a blanket un-escape would break it; the rules forbid one | the pattern kept intact in a keyed block | none |
| BRE alternation | `\|` under plain grep | none: stated to be correct | unchanged | none |
| Shell pipeline | a pipeline escaped into a cell | designer container lead | a keyed block, or `grep -c` in place of `wc -l` | none |
| Placeholder (#719) | `<path>`, an elision or "same as above" | designer complete-commands bullet / planner placeholder defect; grader fourth case | the full command written out in its row or block | none |
| Dead baseline (#553) | `\[0-9\]` under `-E`, stated baseline 2, printed 0 | designer non-reproducing-baseline bullet / planner defective-or-decayed rule | the pattern corrected and the baseline re-measured | none |
