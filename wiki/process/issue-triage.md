---
type: convention
title: 'Issue Triage Conventions'
description: 'Issue taxonomy, priorities, labels, required fields, split, duplicate and dependency policy, and the gh mutation recipes for this repo.'
tags: [process, triage]
status: stable
---
# Issue Triage Conventions

> Project conventions consumed by `/gvt-dev:triage-issues`. This repo keeps
> them in its wiki bundle at `wiki/process/issue-triage.md`, resolved through
> `paths['docs/issue-triage.md']` in `.gvt-agent.json`; with no override the
> skill reads `docs/issue-triage.md`. The companion
> **access mechanics** (fetch queries, label names) live in the `bugTracker`
> block of `.gvt-agent.json` — see the skill's SKILL.md for that block.
>
> The example commands below assume **GitHub Issues via the `gh` CLI**. Replace
> them with your tracker's equivalents (Jira `acli`, Linear API, …); the section
> headings must stay the same — the skill and analyst locate guidance by heading.

## Types

- `bug` — incorrect behavior in shipped functionality (default).
- `crash` — hard failure, exception, or hang.
- `regression` — worked in a prior build, broken now.

Set the type via the matching `type:*` label; exactly one per issue.

**Non-defect work** (a feature request, docs change, or chore) is *not* a
`type:*` — `type:*` is reserved for defects. Classify it by its category label
instead (`enhancement`, `documentation`, `chore`) and leave `type:*` unset. It
still gets a `priority/*` and at least one `area:*`.

## Priorities

- `P0` — blocks release or breaks the build; fix now.
- `P1` — major feature broken, no workaround; fix this sprint.
- `P2` — broken with a workaround, or a minor feature; schedule.
- `P3` — cosmetic or nice-to-have; backlog.

Decision rule: pick by the worst **observable** impact, not the suspected cause.

## Class

Each open issue has a class: Now, Next or Later. Two places store it, and a
triage pass sets both:

- **The coordinator's class labels.** The gvt-fleet coordinator keeps the class
  in the labels `class:now` and `class:next`. An issue with neither label is
  Later. The coach overview (`gvt-fleet ready`) reads only these labels. Only
  the coordinator's `class` command writes them.
- **The Class field of the `gvt-plugins` project** (organization project 1). It
  is a single-select field with the options Now, Next and Later. The coach
  overview does not read it.

The two stores are not linked. When only one is set, they can disagree, and the
coach overview shows the label class. Observed in the triage of #919 to #927
(2026-11-12): the brief asked for "the project Class", and only the project
field was set. #921 (Now) and #923, #924 and #925 (Next) read as Later in the
coach overview until `gvt-fleet class` set their labels.

Propose a class for each triaged issue. The proposal defaults to Later. Set it
only with the coach's approval, through the recipes "Set coordinator class" and
"Set project Class". A closed issue, such as a duplicate closed during triage,
needs no class label: the coordinator's `class` command refuses a closed issue.

## Labels

- `type:*` — exactly one (mutually exclusive): `type:bug`, `type:crash`, `type:regression`.
- `area:*` — one or more subsystem tags: `area:skills`, `area:agents`, `area:hooks`, `area:audit`, `area:docs`, `area:marketplace`.
- `priority/*` — exactly one: `priority/P0` … `priority/P3`.
- `needs-info` — set when required fields are missing; cleared when supplied.
- `duplicate` — set on non-canonical members of a duplicate cluster.
- `triaged` — set **last**, by the skill, when triage is complete.
- `class:now`, `class:next` — the coordinator's class (see Class). The type,
  priority and area recipes leave them alone, and only the coordinator's
  `class` command writes them.

The triager sets `type:*`, `area:*`, and `priority/*`. Reporters may set `area:*`.

## Required fields

Every triaged **bug** must have: a reproduction (steps or a failing case),
expected vs. actual behavior, the build/version, and at least one `area:*` label.
Missing any of these → add `needs-info` and comment exactly what is missing.

A **non-defect** issue (enhancement, docs, chore) has no repro or build/version;
it instead needs a clear **proposed change** (or acceptance criteria, as `- [ ]` rows under an `## Acceptance Criteria` heading) and at least
one `area:*` label. Never `needs-info` an enhancement for lacking a repro — flag
it only when the proposed change itself is too vague to act on.

## Splitting

Split when one issue bundles unrelated defects, or when a single defect spans
subsystems that ship independently. Prefer **sub-issues** (a task-list of
checkboxes referencing new issues) when the parent is a tracking umbrella;
prefer **separate issues** when the parts share no parent. Keep the original as
the canonical/umbrella and move each split-out defect's repro into its own issue.

## Duplicates

Policy: **link, do not auto-close.** For a duplicate cluster, choose the
canonical (usually the oldest with the best repro), add `duplicate` to the
others, and comment `Duplicate of #<canonical>` on each. Close a duplicate only
with explicit per-item approval.

## Dependencies

Express a dependency with a comment on the blocked issue: `Blocked by #<id>`
(optionally `Blocks #<id>` on the other). For umbrellas, list dependencies as a
GitHub task-list under a `Depends on` heading.

A link that does not block (a related issue, a shared root cause, a conflict
between two proposals) is a comment on one issue: `Related: #<id>`, followed
by one sentence that says how the two relate. Never write `Blocked by` for it,
because the reference check reads that line as a blocker.

## Tracker

Since gvt-dev 5.0.0 the wiki practice ships as its own plugin, `gvt-wiki`,
with its own tracker: `GenvidTechnologies/claude-code-plugin-gvt-wiki`. An
issue belongs to the plugin that ships the component it changes.

- **gvt-wiki:** `maintain-wiki`, its templates (`wiki-schema`, `wiki-index`,
  `wiki-log`, `raw-readme`), `wiki-lint`, `wiki-librarian` and `wiki-editor`.
  Transfer such an issue with `gh issue transfer <n>
  GenvidTechnologies/claude-code-plugin-gvt-wiki`, then comment on the moved
  issue that its bare `#N` references still mean gvt-dev.
- **gvt-dev:** the `wiki` block of `.gvt-agent.json` and its definition in
  `plugin/CONVENTIONS.md` (ADR-0096 decision 1), `audit-conventions` (the
  `<wikiDir>/` retired-token scan, the ADR-0053 declines, Environment adoption
  detection), `create-adr`, `triage-issues`, `run-retro`, `tech-writer`, and
  this repository's own `wiki/` pages.
- **Cross-cutting:** when the fix has a half in each plugin, keep or move the
  issue by its main half and file the other half as a new issue in the other
  tracker, linked both ways. Never fix it in gvt-dev by reading a file that
  ships only in gvt-wiki (ADR-0096 decision 5).

A title match is not enough to decide. The first pass (#443, 2026-11-12) moved
35 of the 42 open issues with a wiki or OKF title and kept 6. It split one
(#684), and filed the other halves of three cross-cutting issues as new
issues. Each issue carries a comment with its verdict.

## Mutation recipes

The exact commands the triage skill runs to apply **approved** changes. `{id}`,
`{type}`, `{otherTypes}`, `{p}`, `{otherPriorities}`, `{a}`, `{canonical}`, `{other}`, `{title}`,
`{tmpfile}`, `{triagedLabel}`, `{needsInfoLabel}`, and `{closeReason}` are substituted
by the skill.

When a recipe's set would be empty, omit its --remove-label flag.

{otherTypes} is the set of type labels, written out in full, with the label being added removed; {otherPriorities} is the set of priority labels, written out in full, with the label being added removed.

Every recipe names the repository with `--repo`. Without it, `gh` takes the
repository from the git remote of the current directory, so a recipe run from
a scratch folder or from another checkout fails or writes to the wrong
repository.

- Set type: `gh issue edit {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --add-label "type:{type}" --remove-label "{otherTypes}"`
- Set priority: `gh issue edit {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --add-label "priority/{p}" --remove-label "{otherPriorities}"`
- Add area: `gh issue edit {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --add-label "area:{a}"`
- Remove area: `gh issue edit {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --remove-label "area:{a}"`
- Edit body (language fix / fill missing info): `gh issue edit {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --body-file {tmpfile}` — the skill writes the approved new body to `{tmpfile}` first
- Comment: `gh issue comment {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --body-file {tmpfile}` — the skill writes the comment text to `{tmpfile}` first
- Flag missing info: `gh issue edit {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --add-label {needsInfoLabel}` (pair with a Comment saying what's missing)
- Mark duplicate: `gh issue edit {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --add-label duplicate` then `gh issue comment {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --body "Duplicate of #{canonical}"`
- Close duplicate (only with approval): `gh issue close {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --reason "not planned" --comment "Duplicate of #{canonical}"`
- Close as completed or not planned (only with approval): `gh issue close {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --reason "{closeReason}"` — post the reason first through the Comment recipe; `{closeReason}` is `completed` or `not planned`
- Create split issue: `gh issue create --repo GenvidTechnologies/claude-code-plugin-gvt-dev --title "{title}" --body-file {tmpfile} --label "type:{type},area:{a}"` — the skill writes the drafted split body to `{tmpfile}` first; for a **non-defect** split, replace `type:{type}` with the category label (`enhancement`/`documentation`/`chore`)
- Link dependency: `gh issue comment {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --body "Blocked by #{other}"`
- Link related (does not block): `gh issue comment {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --body-file {tmpfile}` — the skill writes `Related: #{other}` and one sentence on how the two relate to `{tmpfile}` first
- Set coordinator class: `node bin/gvt-fleet.mjs --json class GenvidTechnologies/claude-code-plugin-gvt-dev#{id} {class}`, run at the root of the gvt-fleet workspace. `{class}` is `now`, `next` or `later` in lowercase. The command adds the new label before it removes the old one, creates a missing label, reads the issue back and refreshes the coordinator's cache. `later` adds no label. A result with `status` `noop` means that the issue already had the class. It refuses a closed issue.
- Set project Class, in three steps:
  1. Add the issue to the project: `gh project item-add 1 --owner GenvidTechnologies --url https://github.com/GenvidTechnologies/claude-code-plugin-gvt-dev/issues/{id} --format json --jq .id`. The output is `{itemId}`. For an issue that is already in the project, read `{itemId}` from the `projectItems` of the issue instead; this recipe was not checked against an issue that is already in the project.
  2. Look up the ids: `gh api graphql -f query='query{organization(login:"GenvidTechnologies"){projectV2(number:1){id field(name:"Class"){... on ProjectV2SingleSelectField{id options{id name}}}}}}'`. `{projectId}` is `projectV2.id`, `{fieldId}` is `field.id`, and `{optionId}` is the `id` of the option whose `name` is the class. Look the ids up on each run: rebuilding the options of the field gives new option ids.
  3. Set the field: `gh project item-edit --project-id {projectId} --id {itemId} --field-id {fieldId} --single-select-option-id {optionId}`. The command prints nothing on success.
- Read back the project Class: `gh api graphql -f query='query{repository(owner:"GenvidTechnologies",name:"claude-code-plugin-gvt-dev"){issue(number:{id}){projectItems(first:5){nodes{project{title} fieldValueByName(name:"Class"){... on ProjectV2ItemFieldSingleSelectValue{name}}}}}}}'`
- Stamp triaged: `gh issue edit {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --add-label {triagedLabel}`

Read the labels back after this edit: confirm the issue now carries exactly the intended labels before it is stamped triaged (use the tracker's read-one query, or the native issue view).

To read back several issues in one command, use the bulk form below, with the
issue numbers written out in place of `{ids}` (for example `870,871,872`). It
prints one line per issue with its sorted labels:

```
gh issue list --repo GenvidTechnologies/claude-code-plugin-gvt-dev --state open -L 500 --json number,labels --jq '.[] | select([.number] | inside([{ids}])) | "\(.number) \([.labels[].name]|sort|join(","))"'
```

A session isolated in a worktree refuses a shell loop over the read-one query,
because the loop variable is a value computed at runtime. The bulk form is one
plain command and runs there. It lists open issues only, so read a closed
issue with the read-one query.
