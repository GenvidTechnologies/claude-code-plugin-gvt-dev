---
type: decision-record
title: 'A pathspec-scoped task commit is preceded by a worktree-drift check, not a temporary index'
description: 'plan-task detects worktree drift with a separate check before each pathspec-scoped commit and stops, instead of committing through a temporary index.'
tags: [decisions, plan-execution]
status: stable
---
# 0078. A pathspec-scoped task commit is preceded by a worktree-drift check, not a temporary index

- **Status:** accepted
- **Date:** 2026-10-15
- **Issue:** #351 (primary); the same plan also covers #186, #295, #301 and #393

## Context

`plan-task` runs a staged-but-uncommitted protocol: implementers stage their work, the validator grades
the **staged diff**, and the orchestrator then commits with a pathspec-scoped commit so that a sibling
task's staged files are not swept in. ADR-0048 and ADR-0052 settle how that commit handles deleted paths
and where its options go.

A pathspec-scoped commit records each named path's **worktree** state, not the index. So if a path
changed on disk after it was staged, the commit lands content no gate graded, with exit 0 and no
warning. Measured on git 2.56.0.windows.2 in a scratch repo where the index held `a.txt` = VALIDATED,
the worktree held `a.txt` = DRIFT, and a sibling `b.txt` was staged:

| Commit form | Recorded for `a.txt` | Sibling `b.txt` |
|---|---|---|
| `git commit -m m a.txt` | DRIFT | left staged |
| `git commit -m m -- a.txt` | DRIFT | left staged |
| `git commit -m m --only -- a.txt` | DRIFT | left staged |
| `git commit --pathspec-from-file=…` | DRIFT | left staged |
| `git commit -i -m m -- a.txt` | DRIFT | swept in |
| bare `git commit -m m` | VALIDATED | swept in |

`git diff --quiet -- a.txt` exits 1 with the drift and 0 without it; with no drift, the scoped commit
records VALIDATED. "Validated" is therefore split across two readers: `commands.validate` executes the
**worktree**, while the acceptance grade reads the **staged diff**. A scoped commit is a third reader of
the worktree, and nothing reconciles the three.

Three further findings shaped what the check has to be:

1. **A recreated-after-delete path reads clean.** A file staged for deletion and then re-created on disk
   exits 0 from `git diff --quiet`, yet the scoped commit re-adds it. `git status --porcelain` shows
   `D ` for the index and a separate `??` line.
2. **A misspelled path makes the check vacuous.** The pathspec matches nothing, so `git diff --quiet`
   exits 0 whatever the tree holds.
3. **Chaining skips the lint hook.** The plugin's `pre-commit-lint.js` hook tests `/^git\s+commit\b/`
   against the whole command line. `git diff --quiet … && git commit …` begins with `git diff`, does not
   match, and so the `commands.lint` gate never runs.

## Decision

**Detect drift and stop; do not change how the commit is made.** Immediately before each scoped commit,
as its own command, run `git diff --quiet -- <paths>` and read `git status --porcelain -- <paths>`, using
exactly the path list the commit will name. Commit only when the diff check exits 0 **and** every named
path shows a blank second column in the porcelain output with no `??` line. The porcelain read is what
closes findings 1 and 2: it names every path the check actually covered, so a re-created file or a path
that matched nothing is visible rather than silently green.

When the check fails:

- If the drift is a rewrite of the task's own content, re-stage the paths and re-run the **full**
  validator gate exactly as the validation step ran it. The acceptance grade read the old staged diff, so
  `commands.validate` alone is not enough. Then check again.
- If the drift is anything else (a sibling's write, a re-created deleted file), or it **reappears after
  re-validating**, stop and report. Discarding drift with `git restore` or `git checkout` is repository
  state surgery that principle #14 rules out, which is why "stop" is the answer rather than "clean up".

Whenever `commands.lint` is set, run it first, before the check, because the hook runs it only after
the check and only for a command that begins with `git commit`. A rewrite made there would land in the
commit unseen, and running lint first doesn't require knowing in advance whether it rewrites anything. Keep the check and the commit as two
separate commands for the same reason (finding 3).

The guidance sits under the *index is shared* label of plan-task's Execution section, as new paragraphs
only, so ADR-0046's regrouping holds: no heading is added and no existing paragraph is edited. It extends
the rule that the validator must read the index, not the worktree, to the commit that follows it.

## Compromise

**Rejected: a temporary index via `GIT_INDEX_FILE`.** The probe showed this works: a temporary index
built from the staged blobs commits exactly what was graded, including an index-only removal. It was
rejected on cost, not because it fails:

- It puts git plumbing (index file setup, `read-tree`, cleanup) into skill text that is otherwise
  porcelain-only.
- It bypasses `pre-commit-lint.js`, whose `^git\s+commit` match would not see the plumbing sequence, so
  the lint gate would not run on the commit that matters.
- It would supersede ADR-0048's amendment claim that no path-scoped primitive commits an index-only
  removal, forcing a rewrite of a record whose scope is otherwise settled.

**Rejected: chaining `git diff --quiet … && git commit …`.** One line is tidier, but the combined command
begins with `git diff`, so the lint hook skips it (finding 3).

**Rejected: a bare commit or `-i`.** A bare commit records the index but sweeps the sibling's staged
files, which the pathspec exists to prevent. `-i` sweeps the sibling and also commits the drift.

**Rejected: a post-commit content comparison.** The commit has already landed. Undoing it is the index
and history surgery principle #14 avoids, so the comparison could only report a mistake, not prevent it.

**Rejected: a second home in `commit-changes`.** ADR-0048 decided that the commit discipline is cited
from there rather than restated, and that decision stands. The check lives in plan-task only.

## Consequences

- Every scoped commit costs one extra command. That is the price of making the third reader of the
  worktree agree with the other two.
- A residual window remains for a non-idempotent `commands.lint` fixer: lint run before the check can
  leave the tree different again after re-validation. The loop is bounded by the stop rule, since drift
  that reappears after re-validating ends the run with a report rather than another round.
- Drift that is not the task's own is never repaired by the orchestrator; it is surfaced. This trades some
  convenience for the guarantee that nothing ungraded is committed.
- This record relates to ADR-0048, ADR-0052, ADR-0046 and ADR-0017 and **amends none of them**. ADR-0048's
  "No path-scoped primitive commits an index-only removal" claim and its deleted-path handling stay as
  written; ADR-0052's option ordering is unchanged; ADR-0046's insertion-only placement is followed; the
  pre-committed acceptance grading of ADR-0017 is the gate whose staged diff this check protects.
