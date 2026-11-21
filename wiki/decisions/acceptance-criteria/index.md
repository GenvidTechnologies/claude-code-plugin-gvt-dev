# Acceptance criteria

Decisions about how acceptance criteria are pinned, written back, timed, and graded.

## Records

* [Pre-committed Acceptance Criteria for plan-task](0017-pre-committed-acceptance-criteria.md) - plan-task pins an Acceptance Criteria checklist to the GitHub issue body before implementation, reusing the existing gate. Amended in part by ADR-0102: the issue-less fallback resolves a declared location instead of a fixed `docs/acceptance/` path.
* [A combined plan pledges its acceptance criteria to one canonical issue, with a pointer comment on each sibling](0029-combined-plan-canonical-issue.md) - A combined plan's acceptance-criteria checklist is pledged to the lowest-numbered target issue only, with a pointer comment on each sibling.
* [Acceptance-criteria writeback: tolerant-match/canonical-heading, one section per body, and the write is the body's only scheduled edit](0032-acceptance-criteria-splice-and-single-edit.md) - Acceptance-criteria writeback matches tolerantly on input but always writes the canonical heading, splicing on matched headings only.
* [Test-criteria timing markers and matched grader verdicts, split onto two orthogonal axes](0034-criteria-timing-markers-and-grader-verdicts.md) - Criterion timing and grading outcome split onto two orthogonal axes with a two-word verdict vocabulary, and the commit gate stays binary.
* [Grader-default and orchestrator-dispatch both own corpus resolution](0035-corpus-resolution-owned-on-both-sides.md) - Fixing the staged-diff-reads-empty defect needs both a grader-side resolve-before-grade default and explicit orchestrator corpus naming.
* [Grader verdict vocabulary: third unverifiable case, measured-value reporting, and scope-match](0043-grader-verdict-vocabulary-third-case-measured-value-scope-match.md) - The grader verdict vocabulary's unverifiable-as-written gains a third case, stated in both graders since no single owner existed.
* [Acceptance-text recognition, content-routed near misses, accounted spans and a section-scoped grader count — amends ADR-0032](0073-acceptance-text-recognition-accounted-spans-and-section-scoped-count.md) - Phase 4 recognises other acceptance text, routes it on content, accounts for every line of a replaced span, asks outcome 3 where it is found, and the graders count over the same section.
* [The issue-less acceptance fallback resolves a declared location, writes nothing when there is none, and never commits an ignored file — amends ADR-0017](0102-issue-less-acceptance-fallback-resolves-a-declared-location.md) - plan-task resolves the issue-less acceptance file through the declared acceptance location, writes nothing and waits when no location exists, and commits the file only when git does not ignore it.
