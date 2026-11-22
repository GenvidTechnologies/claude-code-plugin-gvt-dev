---
type: decision-record
title: 'The issue-less acceptance fallback resolves a declared location, writes nothing when there is none, and never commits an ignored file — amends ADR-0017'
description: 'plan-task resolves the issue-less acceptance file through paths[''docs/acceptance/''], writes nothing and waits when no location exists, and commits the file only when git does not ignore it; amends ADR-0017 in part.'
tags: [decisions, acceptance-criteria]
status: stable
---
# 0102. The issue-less acceptance fallback resolves a declared location, writes nothing when there is none, and never commits an ignored file — amends ADR-0017

- **Status:** accepted
- **Date:** 2026-11-20
- **Issue:** #455 (the issue-less fallback location); related #938 (the default of a declared path) and #388 (agreement between `expects` and body prose in the graders)

## Context

[ADR-0017](0017-pre-committed-acceptance-criteria.md) pins the acceptance criteria to the
issue body. For a run with no issue it says the checklist "falls back to a committed
`docs/acceptance/<slug>.md`". `plan-task` carried that path as a constant, and the
validator and code-reviewer agents read the same constant. The constant fails in two ways.

- **It re-creates a retired tree.** A repository that keeps its documentation in a wiki
  bundle has no `docs/` directory. The fallback created one.
- **It commits a file the repository ignores on purpose.** A repository can keep its
  acceptance files in a location that git ignores. The skill text told the model to commit
  the fallback file in the prep commit anyway, while step 5 said never to force-add an
  ignored file. No run that committed such a file was observed.

The first failure was measured. Run r1 used plugin commit `1409da6`, unchanged, in a fresh
clone of this repository, which has no `docs/` tree. It left
`?? docs/acceptance/readme-first-sentence.md`. It re-created `docs/`. It did not commit. Its
own report gave this repository's guard, `test/no-docs-tree.test.mjs`, as the reason, not
the skill. The run cost 1.39 USD.

## Decision

This record amends part 2 of ADR-0017's decision and its third Compromise bullet (the
always-committed `docs/acceptance/*.md` alternative, kept as the issue-less fallback). It
amends them by reference. The text of ADR-0017 is unchanged. The mechanism is in the
"Issue-less (fallback)" bullet of Phase 4 step 4 in `plugin/skills/plan-task/SKILL.md`. It
is the design's "Option A: brief-first graders with their own fallback resolution, grader
edits line-neutral", which the design recommended and this record adopts. Options B and C
of the same design are rejected under Compromise.

1. **Declaration and resolution.** `plan-task` declares `docs/acceptance/` in
   `metadata.expects` with `required: false`. The key `paths['docs/acceptance/']` then
   becomes a declared expectation path. Before this change, the audit warned that nothing
   read an override of that key. The acceptance directory `<dir>` is the declared path,
   resolved as the "Runtime path resolution" section of `plugin/CONVENTIONS.md` says. The
   skill cites that section and does not restate the default, so the text holds whatever
   default the section gives. The file is `<dir>/<slug>.md`, where `<slug>` is the current
   branch name with each `/` replaced by `-`. The skill and both graders use this one
   definition.
2. **Ignore check, before writing.** The skill runs `git check-ignore -q -- <dir>/<slug>.md`.
   The check is path-based, so it works before the file exists. Status 0 means git ignores
   the file, status 1 means it does not, and any other status counts as ignored and is
   reported.
3. **The test for a location.** A usable `paths['docs/acceptance/']` override is the
   repository's declared home, and the skill creates the directory, with its parents,
   if it is absent. An override is unusable when its value is not a non-empty string, is an
   absolute path, or resolves outside the repository. An unusable override counts as no
   location. With no override, there is a location only when git tracks a file under `<dir>`
   or under the directory that contains `<dir>`. A directory that exists only on disk, for
   example one an earlier run left behind, does not count. The skill never creates the
   containing directory. So a repository whose `docs/` holds tracked files and that has no
   `docs/acceptance/` still gets the directory on first use.
4. **No location: write nothing, offer, wait.** The skill creates no directory, file or
   index entry. For the default case it prints
   `Acceptance criteria: not written; no acceptance location (<resolved default> is the default and git tracks no file under <containing dir>).`
   For an unusable override it prints
   `Acceptance criteria: not written; no acceptance location (the paths['docs/acceptance/'] override <value> is unusable).`
   Each line is plain text on its own line. The skill prints the drafted checklist verbatim in
   the same message: the `## Acceptance Criteria` heading and every `- [ ]` row, not a
   summary. A copy kept only in the gitignored `plan.md` does not count. It then asks the
   user, with `AskUserQuestion`, to choose one of three answers.
   - (a) A tracking issue, offered only when `bugTracker` is configured. The run then
     continues on the issue-present path with that issue.
   - (b) A named location. The skill creates its directory if it is absent, writes the file
     there, and applies the ignore check, write, index and report steps to it. It proposes a
     `paths['docs/acceptance/']` override and does not write the override, because that
     changes a tracked file during the run.
   - (c) Placement by the user. The user writes the file and gives its path. The skill
     records the path and names it to the graders. When the user gives no path, the skill
     records the placement as an outstanding action.

   When nobody is present, the skill writes nothing yet and records the checklist and the
   question as an outstanding action. Execution does not begin until the checklist is placed.
   This is the rule of outcome 3's "write nothing yet".
5. **Write.** The skill replaces the file's whole content with the checklist under the
   canonical heading. Inside the wiki bundle (`wiki.wikiDir`, default `wiki`), the file opens
   with minimal OKF frontmatter (`type: acceptance-criteria`, `title`, `description`) and an
   H1, and the frontmatter is generated, not preserved. The page type `acceptance-criteria`
   is not in this repository's wiki schema type list. This repository's schema
   (`wiki/schema.md`, the `type` bullet) says to extend that list rather than force-fit a
   page, and notes that OKF §11 forbids a consumer to reject an unknown `type` value. When the file exists and git
   holds no copy of it, the skill asks before replacing it, and writes nothing yet when nobody
   is present.
6. **Index, only for a file git does not ignore.** An ignored file gets no entry in any
   regime, because a committed link to a local file is dead in every other checkout.
   Otherwise `plan-task` follows the placement regimes of `triage-issues`' "Registration
   follows the contract's location". A file inside the bundle is registered in the index of
   its own directory when one exists, else in `<wikiDir>/index.md`, quoting the frontmatter
   `description`. When the `<wikiDir>/index.md` is absent, the skill writes no entry and reports
   it. When `wiki.indexCommand` is set, the skill prints the command line to run, with the
   entry filled in, and does not run it or edit the index. When `<wikiDir>/schema.md` exists,
   the skill follows its rules for a new page, such as a log entry. A file outside the bundle,
   when the documentation index lies inside it, gets no entry, because an out-of-bundle link is a wiki
   lint finding. The skill reports that case and suggests an override into the bundle. When
   both lie outside the bundle, the skill adds a one-line entry to the documentation index,
   idempotently, and skips and reports when that index is absent. The skill prints one line,
   `Acceptance index: <entry or "none">`, followed by the reason when there is none.
7. **Commit only when git does not ignore the file.** A file that git does not ignore is a
   tracked companion doc, and the prep commit includes it even when `plan.md` is skipped. An
   ignored file is never committed and never force-added. It stays local, and the graders
   read it from the working tree.
8. **Report one line per outcome.** Each report line is plain text on its own line, with no
   bold, no other formatting and no other sentence on the line. The lines are
   `Acceptance criteria: committed at <path>.` (after the prep commit lands),
   `Acceptance criteria: local only at <path>; git ignores it.`,
   `Acceptance criteria: written at <path>; not committed.` (when the prep commit is not
   made), and the two no-location lines from part 4.
9. **Grader hand-off.** The skill names the acceptance file in every `gvt-dev:validator` and
   `gvt-dev:code-reviewer` dispatch of the run, and says when the file is local only. Each
   grader's issue-less clause reads the acceptance file that the dispatch names first. When
   the dispatch names none, it resolves `paths['docs/acceptance/']` through the same section
   and reads `<dir>/<slug>.md`, with the slug as defined in part 1. When the named or the
   resolved file does not exist, it reports the source as none found and the criteria
   incomplete. The clause is the same text in both files and sits on the line that held the
   old clause (the clause that begins "for an issue-less run, read" in
   `plugin/agents/validator.md` and in `plugin/agents/code-reviewer.md`).

**Architecture.** The location is a contract file with a `paths` override, as
[ADR-0062](../plugin-structure/0062-runtime-path-resolution-for-declared-expectations.md)
defines. The location rule moves from a constant in the skill to the repository's
declaration. For the index, `plan-task` follows the placement regimes of `triage-issues`,
which say where an entry goes. It does not follow its interaction. `triage-issues` offers the
entry interactively. `plan-task` writes it as part of Phase 4, with no offer. Plan approval
already authorizes Phase 4's writes, and an offer would name a `--non-interactive` mode that
`plan-task` does not have. So the two skills share the regimes and differ on the offer. The
wait in part 4 reuses outcome 3's "write nothing yet" rule, so the skill has one rule for a
run that cannot place its pledge. ADR-0017's design is otherwise unchanged: the issue body
stays the primary home, and the validator and code-reviewer gates read the checklist at the
existing gate.

## Compromise

Alternatives that were rejected, with the reasons from the design of #455:

- **"Option B: the graders also declare `docs/acceptance/` (alternative)".** Every reader
  would declare what it reads, which satisfies the agreement criterion of #388 in full. The
  insertions would move the line of the issue-less clause in `validator.md` and in
  `code-reviewer.md`, so the anchored citations in ADR-0029 and ADR-0032 fail the audit.
  #388 also edits `code-reviewer.md` above that clause and must repair the same citations,
  so two branches would edit the same ADR lines. The audit would also gain two Info lines in
  every consumer for a key that `plan-task`'s declaration already makes known.
- **"Option C: the graders read only the path the dispatch names (alternative)".** It gives
  the shortest grader text. A grader dispatched outside `plan-task` for an issue-less run in
  a repository with `docs/` loses the checklist it finds today, so it is rejected.
- **Keep `docs/acceptance/` unconditional.** This is the behaviour that run r1 measured. It
  re-creates a retired tree and commits an ignored location.
- **Infer the wiki from the presence of a `<wikiDir>/…` path.** ADR-0062 rejected this as an
  implicit convention: nothing declares it, and the audit cannot see it.
- **Always surface the checklist and never write it.** The design of #455 gives no separate
  reason for rejecting it. Part 3 keeps the write for a repository that has a location.
- **Force-commit an ignored file.** The design of #455 gives no separate reason for
  rejecting it. Part 6 records one effect: a committed link to a local file is dead in every
  other checkout.

What is given up:

- **Durability for an ignored location.** An ignored acceptance file is local to one
  checkout and does not outlive it. The criteria are still graded, because the dispatch names
  the file, but nothing else carries them.
- **Agreement between `expects` and the body prose in the graders (#388).** The graders name
  `paths['docs/acceptance/']` in their body text and do not declare it in their own
  `metadata.expects`. The "Runtime path resolution" section lets a component resolve a path
  that another component declares, so the text is valid. It is a deliberate choice, made to
  keep the two anchored citations on their lines.

## Consequences

- A repository that keeps its documentation in a wiki bundle no longer gets a `docs/` tree
  from an issue-less run. Run r1 left `?? docs/acceptance/readme-first-sentence.md` before
  this change.
- Headless probes ran the new text against the r1 baseline. The evidence is in the #455
  comment that starts "Headless probe evidence", plus a follow-up comment for the final
  round.
  - Two text faults were found in the first runs and fixed: the checklist kept only in
    `plan.md` (`50f9b76`), and the outcome described in prose (`a51b03f`).
  - In the second round, the report lines still carried bold markup or shared their line.
    After the code review, the rule became "plain text on its own line" (`6d9a435`).
  - In the final round, at plugin commit `87b91c3`, all three probes passed every row and
    printed each report line as plain text on its own line.
    - F1, a clone with no `docs/`:
      `Acceptance criteria: not written; no acceptance location (docs/acceptance/ is the default and git tracks no file under docs/).`
    - F2, an override into `wiki/acceptance/` that git ignores:
      `local only at wiki/acceptance/readme-first-sentence.md; git ignores it.`
    - F3, a repository with `docs/`:
      `committed at docs/acceptance/docs-readme-first-sentence.md.`
  - Ten headless runs in all, 17.59 USD (the sum of the exact per-run costs; the two rounded
    round totals, 11.44 and 6.14, add to 17.58).
- No probe covers the wiki-committed regime (an override into the bundle that git does not
  ignore), or the behaviour after ADR-0101's wiki-derived default lands. Static checks and a
  manual read cover them.
- The graders can find the checklist of an issue-less run without a dispatch that names it,
  as long as the file lies at the resolved location under the slug.
- A repository with tracked files under `docs/` and an unignored `docs/acceptance/` keeps
  today's behaviour, except that the index entry is no longer an offer.
- #938 changes the default of the declared path. Once its wiki-derived default lands
  (ADR-0101, not yet merged when this record was written), `paths['docs/acceptance/']`
  resolves to `<wikiDir>/acceptance/` by default. A repository with a wiki then gets a
  committed acceptance page inside the bundle, registered in the bundle's index. A
  repository with only `docs/` and no override gets the no-location outcome. The text of the
  skill and the graders needs no change for that, because it cites the "Runtime path
  resolution" section and does not restate the default.
- The sentence in `plugin/CONVENTIONS.md` that names `docs/acceptance/<slug>.md` for
  issue-less runs is changed by #938's edit to that file, not by #455.

**Related:** ADR-0017 (amended in part), ADR-0029, ADR-0032, ADR-0062, #455, #938, #388.
