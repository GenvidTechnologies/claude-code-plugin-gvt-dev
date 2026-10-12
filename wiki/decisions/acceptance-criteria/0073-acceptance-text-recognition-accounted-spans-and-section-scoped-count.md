---
type: decision-record
title: 'Acceptance-text recognition, content-routed near misses, accounted spans and a section-scoped grader count — amends ADR-0032'
description: 'Phase 4 recognises other acceptance text, routes it on content, accounts for every line of a replaced span, asks outcome 3 where it is found, and the graders count rows over the same section.'
tags: [decisions, acceptance-criteria]
status: stable
---
# 0073. Acceptance-text recognition, content-routed near misses, accounted spans and a section-scoped grader count — amends ADR-0032

- **Status:** accepted
- **Date:** 2026-10-12
- **Issue:** #336 (canonical), with #377, #502, #508 as spanned siblings; closes #400 gap 1, #547 and #604 into them

## Context

ADR-0032 settled that `plan-task` Phase 4 step 4 matches the acceptance
heading tolerantly on the way in, writes the canonical `## Acceptance Criteria`
back out, splices on headings, and treats the write as the body's only
scheduled edit. Four issues, each found by running that rule on a real body,
showed it was under-specified in four different places.

- **#336** — an acceptance statement under a near-miss heading (`## Suggested
  acceptance`, a bare `## Acceptance`) was routed to a fork unconditionally,
  although the new checklist often covered it completely.
- **#377** — the span ran "to the next `## `", so a non-last section followed
  by a `---` rule and a "Found while…" footer lost both when it was replaced.
- **#502** — outcome 3 was asked "at the checkpoint", but plan approval had
  already happened by the time Phase 4 reads the body, so the question had no
  checkpoint left to ride on.
- **#508** — acceptance stated as an emphasised label or a plain `Acceptance:`
  line inside another section was invisible to a heading matcher, so a body
  could end Phase 4 carrying two statements of the pledge.

Alongside them, #400 gap 1 (a vague read-back that did not catch a heading
glued onto the previous line), #547 (a `---` terminator plus a refuse-on-
whole-tail guard) and #604 (keep-and-append versus replace) were closed into
this decision. ADR-0032 also stated that `validator.md` and `code-reviewer.md`
needed no edits; the graders' row count was body-wide, which overstates the
denominator whenever checklist rows sit outside the section.

## Decision

**(1) One definition, one owner.** The definition lives in `plan-task`'s
"Writing the section into an issue body" block. `validator.md` and
`code-reviewer.md` repeat the boundary sentence and the count command and name
that block; `triage-issues` and `issue-triage-analyst.md` repeat the canonical
write form. This is cite-and-repeat in the bounded variant of ADR-0033 and
ADR-0034.

**(2) Recognition of other acceptance text.** A line, at line start and
outside fenced code, whose opening label carries the word *acceptance* in its
first two words: a heading at any level, an emphasised run, or a plain
`Acceptance:` label. It is a reading instruction the model carries out on the
fetched body, not a scanner (ADR-0017 decision 3), and the inbound heading
matcher is not widened. Validated on 510 gvt-dev bodies plus 10 cross-repo
field bodies: 44 headings, 11 emphasised labels and 1 plain label, with no
false positive once the first-two-words limit applies.

**(3) Routing on content, not heading shape.** Text the new checklist fully
covers goes to outcome 2: replace in place with the old-to-new mapping, and
report a heading normalization as a stated action rather than asking (option
N1). Field data across the eight named instances is 7 replace to 1 keep; where
a fork was actually put to a user it was 3 to 0. Text the checklist does not
cover goes to outcome 3.

**(4) One owner per #377 concern.**
- The **span owns the boundary**: from the heading to the next line beginning
  `# ` or `## ` outside a fence, or to the end of the body. `###` headings,
  rules and paragraphs inside it are part of the span.
- The **outcome-2 mapping owns the content**: every non-criterion line of the
  span is carried verbatim after the new section, or named in the mapping as
  superseded when it plainly belongs to the old criteria. When unsure, carry
  it. A covered label inside another section is marked superseded, never
  spliced out.
- The **read-back owns construction**: prefix and suffix unchanged apart from
  the joins; exactly one `## Acceptance Criteria` at line start, outside a
  fence, preceded by a blank line; every carried line present.

**(5) Outcome 3 is asked where it is found (option A′).** Plan approval did not
decide the question, so it is asked at Phase 4 step 4, before the write, with
three answers: replace with the scoped-out items named, keep under a retitled
heading, or write nothing yet. With nobody present, write nothing and record an
outstanding action. A carve-out sentence sits at all four of ADR-0039's
approval-boundary sites (the Phase 3 checkpoint, the simple-tasks shortcut, the
full-proposal shortcut, and step 5 of `approval-and-audit.md`) so none of them
reads as authorizing the write of text nobody has seen.

**(6) The grader denominator is section-scoped.** `validator.md` and
`code-reviewer.md` count rows with an `awk` program that applies the splice's
boundary for the canonical heading and backtick fences at line start, not stopping at `---`, piped into the
existing `grep -c`. The rule that emitted rows equal the denominator stays as
the backstop.

**(7) Triage writes the canonical form (T-full).** `triage-issues` §3, the
contract template, its wiki mirror and the `issue-triage-analyst.md` rewrite
proposal all say: criteria as `- [ ]` rows under `## Acceptance Criteria`,
never a bold or inline label, and edit an existing statement rather than add
a second.

## Relationship to ADR-0032

This record **amends** ADR-0032; it does not supersede it. ADR-0032's
tolerant-in / canonical-out rule, one section per body and single-edit rule
all stand. What changes is its near-miss routing, its heading-to-next-`## `
span, outcome 3's "at the checkpoint" fork, and the statement that the graders
needed no edits. ADR-0032's body stays historical; a one-line forward pointer
is appended to it.

## Compromise

Alternatives considered and rejected:

1. **A `---` terminator for the span (#547).** Truncates real sections: #456's
   19 rows and #259's 10 rows sit after an internal `---`, so the section
   count would drop to 0.
2. **A blank-line terminator.** Cannot tell a footer from a note that belongs
   to the section.
3. **Read-back only (no accounting rule).** Finds a loss after the fact but
   gives no rule for what should have been kept.
4. **#547's refuse-on-whole-tail guard.** It would false-fire on 45 of 76
   last-position sections, which have no trailer at all.
5. **Keep-and-append for covered text (#604, N2).** Leaves standing text the
   next run must route again; 5 corpus bodies already carry both.
6. **Always fork (N3).** A round-trip in 8 of 8 field cases, and users chose
   replace 3 of 3 times when asked.
7. **A trigger-word near-miss rule.** Reaches 13 of 44 candidates; it misses 28
   bare `## Acceptance` headings (the silent outcome-1 case) and 3 `###`
   headings.
8. **Widening the inbound matcher.** #336's explicit non-proposal; it would
   re-open the two-near-identical-checklists ambiguity ADR-0017 removed.
9. **Outcome 3 only, approval sites unchanged (A).** Superseded by A′.
10. **Detect in Phase 3 (B).** Needs a new tracker read and still needs A′ as
    the fallback.
11. **Always fork for labels (#508).** A round-trip for every covered label.
12. **`sed` range or counting by eye for the grader.** Not fence-aware and
    GNU-only, or contrary to the existing "by a command" rule.
13. **Amending ADR-0032 in place.** Rewrites a historical record.

## Consequences

- ADR-0032's "graders needed no edits" is superseded; both graders now carry
  the section boundary and the scoped count.
- ADR-0039's citations to the analyst rewrite line and to step 5 of
  `approval-and-audit.md` were re-anchored to the number-free form, so edits
  there no longer drift the pointer baseline.
- The span, mapping and read-back are prose in shipped skill bodies; no scanner
  enforces them (ADR-0017 decision 3).
- This run's own acceptance write ran under the installed 4.32.0 rules; it was
  outcome 1 under both rule sets, so nothing had to be applied by hand.
