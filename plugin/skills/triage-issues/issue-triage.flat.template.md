# Issue Triage Conventions

> Project conventions consumed by `/genvid-dev:triage-issues`. Copy this file to
> `docs/issue-triage.md` and edit it for your tracker. The companion **access
> mechanics** (fetch queries, label names) live in the `bugTracker` block of
> `.genvid-agent.json` — see the skill's SKILL.md for that block.
>
> This is the **flat-label variant** — for repos using a simple category-label set
> (e.g. GitHub's defaults: `bug`, `enhancement`, `documentation`, `duplicate`,
> `question`, `wontfix`) with **no** `type:`/`priority/`/`area:` scheme. If your repo
> uses a structured taxonomy, copy `issue-triage.template.md` instead.
>
> The example commands below assume **GitHub Issues via the `gh` CLI**. Replace
> them with your tracker's equivalents; the section headings must stay the same —
> the skill and analyst locate guidance by heading.

## Types

A single category label per issue, drawn from the existing flat set:

- `bug` — incorrect behavior in shipped functionality.
- `enhancement` — a new feature or improvement request.
- `documentation` — a docs-only gap or fix.
- `question` — a request for information or clarification (doubles as the
  needs-info signal — see Required fields).

Set exactly one category label. Add new categories only if the repo already uses
them — never invent a taxonomy the repo doesn't have.

## Priorities

**This repo has no priority labels.** Don't invent a `priority/*` scheme. When
ordering work, rank by recency and observable impact in discussion rather than a
label — a triaged issue carries no priority field. (If the repo later adopts
priority labels, switch to the structured template.)

## Labels

- category — exactly one of `bug` / `enhancement` / `documentation` / `question`.
- `duplicate` — set on non-canonical members of a duplicate cluster.
- `question` — also used to flag missing info (see Required fields); cleared when
  supplied.
- `wontfix` — set only with explicit approval when an issue is closed as out of scope.
- `triaged` — set **last**, by the skill, when triage is complete.

The triager sets the category label. Reporters may suggest one.

## Required fields

Every triaged issue should have enough to act on: for a `bug`, a reproduction
(steps or a failing case) plus expected vs. actual behavior and the build/version;
for an `enhancement`, a clear statement of the desired outcome and motivation.
Missing the essentials → add the **`question`** label and comment exactly what is
needed. (This repo has no dedicated `needs-info` label; `question` serves that
role — match the `needsInfoLabel` in the `bugTracker` block to it.)

## Splitting

Split when one issue bundles unrelated concerns, or when a single piece of work
spans parts that ship independently. Prefer **sub-issues** (a task-list of
checkboxes referencing new issues) when the parent is a tracking umbrella; prefer
**separate issues** when the parts share no parent. Keep the original as the
canonical/umbrella and move each split-out concern's detail into its own issue.

## Duplicates

Policy: **link, do not auto-close.** For a duplicate cluster, choose the canonical
(usually the oldest with the best detail), add `duplicate` to the others, and
comment `Duplicate of #<canonical>` on each. Close a duplicate only with explicit
per-item approval.

## Dependencies

Express a dependency with a comment on the blocked issue: `Blocked by #<id>`
(optionally `Blocks #<id>` on the other). For umbrellas, list dependencies as a
GitHub task-list under a `Depends on` heading.

## Mutation recipes

The exact commands the triage skill runs to apply **approved** changes. `{id}`,
`{type}`, `{text}`, `{canonical}`, `{other}`, `{title}`, `{body}`, `{tmpfile}`,
`{triagedLabel}`, and `{needsInfoLabel}` are substituted by the skill. (There are
no `{p}`/`{a}` substitutions — this repo has no priority or area labels.)

- Set category: `gh issue edit {id} --remove-label "bug,enhancement,documentation,question" --add-label "{type}"`
- Edit body (language fix / fill missing info): `gh issue edit {id} --body-file {tmpfile}` — the skill writes the approved new body to `{tmpfile}` first
- Comment: `gh issue comment {id} --body "{text}"`
- Flag missing info: `gh issue edit {id} --add-label {needsInfoLabel}` (i.e. `question`; pair with a Comment saying what's missing)
- Clear missing-info flag: `gh issue edit {id} --remove-label {needsInfoLabel}`
- Mark duplicate: `gh issue edit {id} --add-label duplicate` then `gh issue comment {id} --body "Duplicate of #{canonical}"`
- Close duplicate (only with approval): `gh issue close {id} --reason "not planned" --comment "Duplicate of #{canonical}"`
- Create split issue: `gh issue create --title "{title}" --body "{body}" --label "{type}"`
- Link dependency: `gh issue comment {id} --body "Blocked by #{other}"`
- Stamp triaged: `gh issue edit {id} --add-label {triagedLabel}`
