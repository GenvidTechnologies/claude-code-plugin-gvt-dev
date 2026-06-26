# Issue Triage Conventions

> Project conventions consumed by `/gvt-dev:triage-issues`. Copy this file to
> `docs/issue-triage.md` and edit it for your tracker and taxonomy. The companion
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

## Labels

- `type:*` — exactly one (mutually exclusive): `type:bug`, `type:crash`, `type:regression`.
- `area:*` — one or more subsystem tags: `area:skills`, `area:agents`, `area:hooks`, `area:audit`, `area:docs`, `area:marketplace`.
- `priority/*` — exactly one: `priority/P0` … `priority/P3`.
- `needs-info` — set when required fields are missing; cleared when supplied.
- `duplicate` — set on non-canonical members of a duplicate cluster.
- `triaged` — set **last**, by the skill, when triage is complete.

The triager sets `type:*`, `area:*`, and `priority/*`. Reporters may set `area:*`.

## Required fields

Every triaged **bug** must have: a reproduction (steps or a failing case),
expected vs. actual behavior, the build/version, and at least one `area:*` label.
Missing any of these → add `needs-info` and comment exactly what is missing.

A **non-defect** issue (enhancement, docs, chore) has no repro or build/version;
it instead needs a clear **proposed change** (or acceptance criteria) and at least
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

## Mutation recipes

The exact commands the triage skill runs to apply **approved** changes. `{id}`,
`{type}`, `{p}`, `{a}`, `{text}`, `{canonical}`, `{other}`, `{title}`,
`{body}`, `{tmpfile}`, `{triagedLabel}`, and `{needsInfoLabel}` are substituted
by the skill.

- Set type: `gh issue edit {id} --remove-label "type:bug,type:crash,type:regression" --add-label "type:{type}"`
- Set priority: `gh issue edit {id} --remove-label "priority/P0,priority/P1,priority/P2,priority/P3" --add-label "priority/{p}"`
- Add area: `gh issue edit {id} --add-label "area:{a}"`
- Remove area: `gh issue edit {id} --remove-label "area:{a}"`
- Edit body (language fix / fill missing info): `gh issue edit {id} --body-file {tmpfile}` — the skill writes the approved new body to `{tmpfile}` first
- Comment: `gh issue comment {id} --body "{text}"`
- Flag missing info: `gh issue edit {id} --add-label {needsInfoLabel}` (pair with a Comment saying what's missing)
- Mark duplicate: `gh issue edit {id} --add-label duplicate` then `gh issue comment {id} --body "Duplicate of #{canonical}"`
- Close duplicate (only with approval): `gh issue close {id} --reason "not planned" --comment "Duplicate of #{canonical}"`
- Create split issue: `gh issue create --title "{title}" --body "{body}" --label "type:{type},area:{a}"` — for a **non-defect** split, replace `type:{type}` with the category label (`enhancement`/`documentation`/`chore`)
- Link dependency: `gh issue comment {id} --body "Blocked by #{other}"`
- Stamp triaged: `gh issue edit {id} --add-label {triagedLabel}`
