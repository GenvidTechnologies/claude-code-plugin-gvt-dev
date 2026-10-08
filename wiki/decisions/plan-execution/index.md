# Plan execution

Decisions about how plan-task and plan-next-issue check, commit, and structure their own execution.

## Records

* [`plan-next-issue`'s unreleased-delta check reuses §1's fetch by making it tag-aware, not by adding a second fetch](0028-single-fetch-tag-aware-delta-check.md) - plan-next-issue's unreleased-delta check uses a whole-remote fetch instead of a second explicit-refspec fetch, skipping silently on fallback.
* [A prescribed mechanism gets three questions, reaches every ticket type, and plan approval is distinguished from execution approval](0039-mechanism-three-question-gate-and-approval-boundary.md) - The prescribed-mechanism check's three-question technique stays in plan-task's skill body rather than becoming a shared principle.
* [`plan-task`'s `## Execution (Post-Approval)` section regrouped into four named labels, on density rather than an axis trigger](0046-execution-section-regroup-four-labels.md) - plan-task's Execution section gains four named labels as an insertion-only regroup, with no heading added.
* [A deleted path is not an exception to `plan-task`'s explicit-pathspec commit rule](0048-pathspec-commits-handle-deleted-paths.md) - A deleted path does not make plan-task's explicit-pathspec commit rule mechanically impossible, per six probed deletion scenarios.
* [An option placed after `--` in a pathspec-scoped commit is parsed as a pathspec, not consumed as a flag](0052-option-ordering-in-pathspec-scoped-commits.md) - An option written after double-dash in a pathspec-scoped commit is parsed as a pathspec rather than consumed as a flag.
