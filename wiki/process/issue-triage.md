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

Each open issue has a class: Now, Next or Later. The class is not a label. It
is the issue's iteration in the Iteration field of the `gvt-plugins` project
(organization project 1): the current iteration is Now, the next iteration is
Next, and any other iteration, or no iteration, is Later. The gvt-fleet
coordinator derives the class this way (its ADR 0015), and the coach overview
(`gvt-fleet ready`) shows it.

- The labels `class:now` and `class:next` are retired. The coordinator no
  longer reads or writes them. Leave them alone.
- The project also has a single-select field `Class` (options Now, Next, Later
  and Done). The coordinator does not read it. Do not write it.

Propose a class for each triaged issue. The proposal defaults to Later. Set it
only with the coach's approval, through the recipe "Set class". The command
`gvt-fleet class` writes the Iteration value and reads it back itself.

Report each issue's current class beside the proposal. When they are the same,
say "no change" and do not ask or write. `gvt-fleet ready --class now` and
`gvt-fleet ready --class next` list the issues of those classes, and any other
open issue is Later. They read the coordinator's cache, so an issue filed after
the last `gvt-fleet sync` is missing from both lists. Such an issue is Later
only if nobody has put it in an iteration since, so when the cache may lag, say
that the current class is read from the cache. Observed in the triage of #954 to
#956 (2026-11-14): the coach approved Later for all three, and the three
`gvt-fleet class` writes each returned `noop` with `previous: later`.

To read the current class of a given issue, use `gvt-fleet ready --all --json`
at the root of the gvt-fleet workspace. Each entry of its `issues` list has the
issue's `key` and its `class` (`now`, `next` or `later`), and the list includes
untriaged issues. Do not search the whole output of `ready --class … --json`
for an issue key: the `untriaged` list in the same output names every untriaged
issue, so a key matches there whatever its class. Observed in the triage of
#966 to #969 (2026-11-18): the four keys matched only in the `untriaged` list,
and the class was wrongly reported as unconfirmed. `ready --all --json` gave
`later` for all four.

Before proposing classes, run `gvt-fleet iteration list` at the root of the
gvt-fleet workspace. Propose Now only when the project has a current
iteration, and Next only when it has a next one. Otherwise, say in the proposal
that `gvt-fleet iteration plan` must add the iteration first. Observed in the
triage of #941 to #945 (2026-11-13): the coach approved Next for #942, and only
the write found that project 1 had no next iteration.

- `now` and `next` add the issue to the project when it is not in it.
- `later` clears the Iteration value. It does not add the issue to the project,
  and an issue outside the project is Later already.
- `next` is refused when the project has no next iteration, and `now` when it
  has no current one. `gvt-fleet iteration list` shows the iterations, and
  `gvt-fleet iteration plan` adds one. Adding an iteration is a project write,
  so it needs the coach's approval too.
- A closed issue, such as a duplicate closed during triage, needs no class: the
  command refuses a closed issue.

Observed in the triage of #941 to #945 (2026-11-13): this section still
described the class labels and the `Class` field. The coach's approved class for
#942 was Next, and `gvt-fleet class … next` was refused because project 1 had no
next iteration. The coach then chose Later. The old recipe also wrote the
`Class` field (to Later) on all five issues. That field is not read, so the
write changed no class.

The road block is not a label either. It is the `Road block` field of the
`gvt-plugins` project: one option per larger goal of the project, plus
`Standalone` for a bug or small improvement that serves no larger goal. Each
option's description gives the goal and its "done when". Propose a road block
for each triaged issue, except a duplicate closed in the triage run (see
Duplicates), beside the class, and set it only with the coach's
approval, through the recipe "Set road block". When no road block fits and the
issue is not standalone, say so in the triage report: the project may need a
new goal. With the coach's approval, add it through the recipe "Add a road
block option".

Read the options and the issue's current road block first, with the recipe
"Read road block". Report the current value beside the proposal. When they are
the same, say "no change" and do not ask or write. Look with "Read road
block", not with a "Set road block" call without `--apply`: that call is a
dry run only with the `set.mjs` that has one (see the recipe), and only "Read
road block" also prints the Iteration value. Observed in the triage of #1001
(2026-11-20): the issue already had the road block that the triage would have
proposed, and only an ad-hoc query showed it.

An issue outside the project has no project item. The recipe adds the item
with no Iteration value, so the class stays Later and no class write follows.
Observed in the triage of #980 and #982 (2026-11-20): neither issue was in the
project, and after the road block was set each item read back with an empty
Iteration.

## Labels

- `type:*` — exactly one (mutually exclusive): `type:bug`, `type:crash`, `type:regression`.
- Category — `enhancement`, `documentation`, `chore`, for non-defect work (see Types). An issue can
  carry more than one, for example `documentation` and `chore`. The Set category recipe removes every
  other category, so run it only to change the category, not to add one. Observed in the triage of
  #997 (2026-11-20): the issue carried both, as #939 did, and the coach kept both.
- `area:*` — one or more subsystem tags: `area:skills`, `area:agents`, `area:hooks`, `area:audit`, `area:docs`, `area:marketplace`.
- `priority/*` — exactly one: `priority/P0` … `priority/P3`.
- `needs-info` — set when required fields are missing; cleared when supplied.
- `duplicate` — set on non-canonical members of a duplicate cluster.
- `triaged` — set **last**, by the skill, when triage is complete.
- `class:now`, `class:next` — retired (see Class). Nothing reads or writes
  them. The type, priority and area recipes leave them alone.

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

A duplicate closed in the triage run gets the `area:*` and `priority/*` labels
of an open issue, the `duplicate` label and `triaged`, and no road block.
Observed in the triage of #1097 (2026-11-25): the closed duplicates #968, #919
and #891 carried that label set and had no road block value, and #1097 was
closed the same way.

Run "Close duplicate" alone, without the comment of "Mark duplicate": its
`--comment` already posts `Duplicate of #<canonical>`, and the two recipes in
turn post that line twice (#907, observed on #891). This workaround holds only
when the close follows in the same run; #907 tracks the fix for a close
approved later.

When the duplicate holds evidence that the canonical lacks, such as a new
observation or a probe, post that evidence on the canonical through the
Comment recipe. Observed in the triage of #1097 (2026-11-25): its second
observation and its probes of `extract` went to #949 as a comment.

## Dependencies

Express a dependency with a comment on the blocked issue: `Blocked by #<id>`
(optionally `Blocks #<id>` on the other). For umbrellas, list dependencies as a
GitHub task-list under a `Depends on` heading.

A link that does not block (a related issue, a shared root cause, a conflict
between two proposals) is a comment on one issue: `Relates to #<id>`, followed
by one sentence that says how the two relate. Never write `Blocked by` for it,
because the reference check reads that line as a blocker. Do not write
`Related: #<id>`: the reference check does not read that form (#941).

The reference check gives the relation of a `Relates to` or `Blocked by` line
to every issue reference on that line, not only to the first. So write the
sentence that says how the two relate with no other issue reference, and put
any other reference on a line of its own. A reference on the next line of the
same paragraph was not read in a probe of `extract` (gvt-dev 5.1.0). Run `extract`
(`plugin/skills/triage-issues/scripts/issue-refs.mjs extract --single`) on the
draft of a "Link related" comment as well as on a body draft: the reference
check reads comments too, and nothing else checks a comment before it is
posted. Observed in the triage of #971 (2026-11-18): a draft `Relates to #956`
line went on to cite genvid-holdings/burbank#359 and `burbank-playfab#536`.
`extract` read burbank#359 as related too, and `burbank-playfab#536` as
unresolvable (`repo-ambiguous`). With those sentences moved off that line,
only #956 was left.

`extract --single` on a draft alone reads only the draft. A note that retracts
a blocker given in an earlier comment (`No longer blocked by #N`) prints no
reference that way. To see the retraction, put the issue's existing comments
and then the draft in the `comments` list: the earlier blocker then reads
`retracted: true`. Observed in the triage of #1079 to #1088 (2026-11-25), on
the cleared notes for #1069 and #1070: the draft alone printed `refs: []`, and
with the comments the `Blocked by #1060` comment read `retracted: true`.

A defect in the reference check can make an open issue read as blocked when
it is not, or as ready when it is blocked. When triage finds such a defect,
look for open issues that it changes now, and offer the smallest body edit
that gives the correct reading, with the coach's approval. Run `extract`
(`plugin/skills/triage-issues/scripts/lib/refs-grammar.mjs`) on the old and
the new body, and show both results in the proposal. Observed in the triage of
#951 (2026-11-14): #286 read as blocked by #260, because #260 was in a later
sentence of its `Blocked by` line. Moving that sentence to its own paragraph
left #193 as the only blocker.

A body sentence about work on a branch that is not merged yet records what was
read and where: "the #938 branch (141dec2) adds the lesson to
`testing-the-audit.md`". It does not forecast the merge, as in "it is not on
`main` until #938 merges". Read the state of the issue and of its pull request
just before such a write, and just before a "cleared" annotation on an issue
that is in progress. The analyst's report is older than the write, and a merge
in between makes the forecast false or the annotation moot. Observed in the
triage of #1023 (2026-11-21, GitHub edit times): the body forecast the merge at
13:48Z, #938 merged at 13:50Z, and the body needed a second write. The
"cleared" annotation on #938's own blocker line was written at 14:00Z, after
#938 had closed at 13:50Z.

An issue whose premise was read at a commit that is not an ancestor of the
default branch waits for the issue whose change holds that commit. A
"Follow-up of #N" line is not a reference form, so the reference check reads
such an issue as ready. Check each commit that an issue cites with
`git merge-base --is-ancestor <sha> origin/main`. On exit 1, propose a
`Blocked by #<N>` comment through the "Link dependency" recipe, and check each
claim of the issue at that commit, not only at `main`. Observed in the triage
of #1069 and #1070 (2026-11-23): both cited 8db91c4, the squash of #1068 for
#1060, which was not an ancestor of `main` at d2b26c4.

A commit can also fail the ancestor check because the change it holds reached
the default branch under another sha: a side pull request's squash into an
issue branch never becomes an ancestor once that branch is squash-merged. Then
no blocker is needed. Find the issue whose change holds the commit. When that
issue is closed and its pull request merged into the default branch, check the
claims at the default branch, and record in the body the sha that was read and
the sha under which the change reached the default branch. Observed in the
triage of #1079, #1082 and #1088 (2026-11-25): b297cac, 8ef85e3 and 4f153f9
were squashes of side pull requests into the branches of #971, #951 and #982,
which reached `main` as 270fc1a, 479c015 and 4e36581. A `Blocked by` comment
there would have named a closed issue.

## Tracker

Since gvt-dev 5.0.0 the wiki practice ships as its own plugin, `gvt-wiki`,
with its own tracker: `GenvidTechnologies/claude-code-plugin-gvt-wiki`. An
issue belongs to the plugin that ships the component it changes.

- **gvt-wiki:** `maintain-wiki`, its templates (`wiki-schema`, `wiki-index`,
  `wiki-log`, `raw-readme`), `wiki-lint`, `wiki-librarian` and `wiki-editor`.
  Transfer such an issue with `gh issue transfer <n>
  GenvidTechnologies/claude-code-plugin-gvt-wiki`, then comment on the moved
  issue that a bare `#N` left in its text still means gvt-dev.
- **gvt-dev:** the `wiki` block of `.gvt-agent.json` and its definition in
  `plugin/CONVENTIONS.md` (ADR-0096 decision 1), `audit-conventions` (the
  `<wikiDir>/` retired-token scan, the ADR-0053 declines, Environment adoption
  detection), `create-adr`, `triage-issues`, `run-retro`, `tech-writer`, and
  this repository's own `wiki/` pages.
- **Cross-cutting:** when the fix has a half in each plugin, keep or move the
  issue by its main half and file the other half as a new issue in the other
  tracker, linked both ways. Never fix it in gvt-dev by reading a file that
  ships only in gvt-wiki (ADR-0096 decision 5). Before filing either half,
  search the other tracker's open issues for the component, as for a
  duplicate in this tracker. An open issue there can change the premise of
  the half filed here. This holds for every plugin of the marketplace with
  its own tracker: gvt-wiki, gvt-fleet and gvt-construct3. Observed in a
  refactoring audit on 2026-11-25: #1115 was filed to make the git-state
  guard library identical in gvt-dev and gvt-wiki, while
  GenvidTechnologies/claude-code-plugin-gvt-wiki#85, filed earlier that day,
  proposes a read-only allow-list for the gvt-wiki guard. #1115's body was
  corrected after filing, to share only the parser.

A title match is not enough to decide. The first pass (#443, 2026-11-12) moved
35 of the 42 open issues with a wiki or OKF title and kept 6. It split one
(#684), and filed the other halves of three cross-cutting issues as new
issues. Each issue carries a comment with its verdict.

What a transfer does, observed on the 35 transfers of that pass:

- It keeps a label only when the target tracker has a label of the same name.
  The others (there, `area:skills`, `area:docs`, `area:audit`) are dropped, so
  add the target's own area label after the move.
- It rewrites most bare `#N` references to a moved issue into the full
  `owner/repo#N` form, in the moved issue and in the issues that stay. It
  leaves some bare: one moved issue kept bare `#355`, `#361` and `#362` in a
  comment. Which ones it leaves was not determined, so the move comment is
  still needed.
- A sub-issue link survives the move, across the two repositories.
- `gh issue view <old number>` fails after the move. Use the URL that
  `gh issue transfer` prints, and record the old and new numbers.
- A title match misses issues. `#403` (the pin form of a `sources[]` entry)
  changes the schema template and has no wiki word in its title. Search the
  bodies for the component names too.

## Mutation recipes

The exact commands the triage skill runs to apply **approved** changes. `{id}`,
`{type}`, `{otherTypes}`, `{p}`, `{otherPriorities}`, `{a}`, `{canonical}`, `{other}`, `{title}`,
`{tmpfile}`, `{triagedLabel}`, `{needsInfoLabel}`, `{closeReason}`, `{class}`, `{roadBlock}`, `{category}`, and
`{otherCategories}` are substituted by the skill.

When a recipe's set would be empty, omit its --remove-label flag.

{otherTypes} is the set of type labels, written out in full, with the label being added removed; {otherPriorities} is the set of priority labels, written out in full, with the label being added removed. {category} is a category label (`enhancement`, `documentation` or `chore`); {otherCategories} is every `type:*` label and every category label, written out in full, with the label being added removed.

Every recipe names the repository with `--repo`. Without it, `gh` takes the
repository from the git remote of the current directory, so a recipe run from
a scratch folder or from another checkout fails or writes to the wrong
repository.

- Set type: `gh issue edit {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --add-label "type:{type}" --remove-label "{otherTypes}"`
- Set category (non-defect work, also to reclassify a defect): `gh issue edit {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --add-label "{category}" --remove-label "{otherCategories}"` — removing every `type:*` label leaves no type on the issue, as the Types section requires for non-defect work. Added after the triage of #930 (2026-11-13), where `type:bug` became `enhancement` through an ad-hoc call because no recipe covered the move
- Set priority: `gh issue edit {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --add-label "priority/{p}" --remove-label "{otherPriorities}"`
- Add area: `gh issue edit {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --add-label "area:{a}"`
- Remove area: `gh issue edit {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --remove-label "area:{a}"`
- Edit body (language fix / fill missing info): `gh issue edit {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --body-file {tmpfile}` — the skill writes the approved new body to `{tmpfile}` first
- Read back body: `gh issue view {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --json body --jq .body | tr -d '\r' | head -c -1 | diff - {tmpfile}` — prints nothing and exits 0 when the body on the issue equals `{tmpfile}`. `--jq` adds a final newline, which `head -c -1` removes; without it, `diff` reports a difference on a body that matches. Measured 2026-11-13: on #929 the form without `head -c -1` reported one extra line on a matching body; on #930 this form printed nothing
- Edit title (only with approval): `gh issue edit {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --title "{title}"` — the same call can also take `--body-file {tmpfile}` when the title and the body change in one approved rewrite. Read the title back with `gh issue view {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --json title --jq .title`. Added after the triage of #964 (2026-11-18), where a retitle to the component-prefix form went through an ad-hoc call because no recipe covered it
- Comment: `gh issue comment {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --body-file {tmpfile}` — the skill writes the comment text to `{tmpfile}` first
- Read back comment: `gh issue view {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --json comments --jq '.comments[-1].body' | tr -d '\r' | head -c -1 | diff - {tmpfile}` — prints nothing and exits 0 when the newest comment on the issue equals `{tmpfile}`. As in "Read back body", `--jq` adds a final newline, which `head -c -1` removes. Added after the triage of #1079 to #1088 (2026-11-25): without `head -c -1`, the readback of the notes on #1069 and #1070 reported one extra line on comments that matched
- Flag missing info: `gh issue edit {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --add-label {needsInfoLabel}` (pair with a Comment saying what's missing)
- Mark duplicate: `gh issue edit {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --add-label duplicate` then `gh issue comment {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --body "Duplicate of #{canonical}"`
- Close duplicate (only with approval): `gh issue close {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --reason "not planned" --comment "Duplicate of #{canonical}"`
- Close as completed or not planned (only with approval): `gh issue close {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --reason "{closeReason}"` — post the reason first through the Comment recipe; `{closeReason}` is `completed` or `not planned`
- Create split issue: `gh issue create --repo GenvidTechnologies/claude-code-plugin-gvt-dev --title "{title}" --body-file {tmpfile} --label "type:{type},area:{a},priority/{p}"` — the skill writes the drafted split body to `{tmpfile}` first; for a **non-defect** split, replace `type:{type}` with the category label (`enhancement`/`documentation`/`chore`). In the same run, read the body back with "Read back body", set the road block with "Set road block", and stamp `triaged` when the issue meets Required fields. Then trim the source issue's body to what stays there, and name the new issue in it. Added after the triage of #1102 to #1132 (2026-11-25): five split issues (#1133, #1134, #1135, #1137, #1138) each needed a priority label, a road block and `triaged`, which the recipe did not give
- File a defect found during triage (only with the coach's approval): the "Create split issue" recipe, with the priority label added to `--label`. Run `extract` (`plugin/skills/triage-issues/scripts/issue-refs.mjs extract --single`) on the draft first, and show the draft with the approval question. After the create, read the body back with "Read back body", set the road block, and stamp `triaged` in the same run when the issue meets Required fields. Added after the triage of #1041 (2026-11-22), where the verification found two unfiltered commit counts that no open issue covered; #1045 was filed this way
- Link dependency: `gh issue comment {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --body "Blocked by #{other}"`
- Link related (does not block): `gh issue comment {id} --repo GenvidTechnologies/claude-code-plugin-gvt-dev --body-file {tmpfile}` — the skill writes `Relates to #{other}` and one sentence on how the two relate to `{tmpfile}` first
- Set class (only with the coach's approval): `node bin/gvt-fleet.mjs --json class GenvidTechnologies/claude-code-plugin-gvt-dev#{id} {class}`, run at the root of the gvt-fleet workspace. `{class}` is `now`, `next` or `later` in lowercase. The command puts the issue's project item in the current or the next iteration, or clears its Iteration value for `later`, and reads the value back itself. `status` must be `changed` or `noop`; `noop` means that the issue already had the class. A `refused` result names its reason, for example a closed issue or a project with no next iteration. Never use `gh project item-list` to read the class: on a large project it hits GitHub's secondary rate limit.
- Read road block (read-only): `gh api graphql -F n={id} -f query='query($n:Int!){organization(login:"GenvidTechnologies"){projectV2(number:1){field(name:"Road block"){... on ProjectV2SingleSelectField{options{name description}}}}} repository(owner:"GenvidTechnologies",name:"claude-code-plugin-gvt-dev"){issue(number:$n){projectItems(first:20){nodes{project{number} roadBlock:fieldValueByName(name:"Road block"){... on ProjectV2ItemFieldSingleSelectValue{name}} iteration:fieldValueByName(name:"Iteration"){... on ProjectV2ItemFieldIterationValue{title}}}}}}}'` — prints every option of the `Road block` field with its description (the goal and its "done when"), and the issue's items with their `Road block` and `Iteration` values. Use the item of project number 1. A `null` value means the field is not set. The query reads the issue's `projectItems`, which lists only projects of the repository's owner; project 1 is one of them. Run 2026-11-20 on #1001: 21 options, and the item read back with its road block and a `null` iteration
- Read the road blocks of several issues (read-only): `gh api graphql -f query='query{repository(owner:"GenvidTechnologies",name:"claude-code-plugin-gvt-dev"){a:issue(number:1035){...F} b:issue(number:757){...F}}} fragment F on Issue{number title projectItems(first:5){nodes{project{number} rb:fieldValueByName(name:"Road block"){... on ProjectV2ItemFieldSingleSelectValue{name}}}}}' --jq '.data.repository[] | "\(.number) \(.projectItems.nodes|map(.rb.name)|join(",")) :: \(.title)"'` — one alias per issue (`a`, `b`, …), with the issue numbers written out. It prints one line per issue: its number, its road block (empty when the issue has no item in the project) and its title. Use it to compare a proposed road block with those of the issues that the analyst names as related, before you ask. Added after the triage of #1054 and #1058 (2026-11-22): the analyst proposed G10d for #1058 because three §0 issues were in it, and one call of this query confirmed the values of all six related issues.
- Set road block (only with the coach's approval): `node .claude/skills/groom-road-blocks/scripts/set.mjs --dir <scratch folder> --project GenvidTechnologies/1 "GenvidTechnologies/claude-code-plugin-gvt-dev#{id}={roadBlock}" --apply`, run at the root of the gvt-fleet workspace. `{roadBlock}` is the full option name, for example `G9 audit-conventions is accurate and drives adoption`. With `--apply`, the script creates the `--dir` folder for its query files, adds the issue to the project when it is missing, writes the value only when the item does not already hold it, reads the item back by id, and prints `OK <value>` for each issue, or `MISMATCH <value>` and exits 1. An item that already holds the value gets no write, and the line ends `holds the value, nothing to write`. Without `--apply`, the `set.mjs` of the workspace repository's default branch at 135f934 (2026-11-25) is a dry run: it prints the field's options with their descriptions, then for each issue its current value, whether it would add the issue to the project and the value it would write, and ends `dry run: nothing written (add --apply)`. The `set.mjs` before it has no dry run and writes at once. Keep `--apply` after the ref arguments: the earlier argument parser in `lib.mjs` reads a value that follows `--apply` as the value of `--apply`, so the ref is dropped and nothing is written, while `--apply` as the last argument works with both scripts. Corrected after the triage of #1102 to #1132 (2026-11-25), which passed `--apply` last; the workspace's main checkout took the dry-run `set.mjs` while that triage ran (#1131). Added after the triage of #980 and #982 (2026-11-20), where no recipe covered the road block. The script also runs from a worktree of this repository when it is given by its full path (`node <gvt-fleet workspace>/.claude/skills/groom-road-blocks/scripts/set.mjs …`, where `<gvt-fleet workspace>` is the absolute path of the workspace root), so no `cd` to the workspace root is needed; a worktree-isolated session can refuse a `cd` chained with the `node` call. Observed in the triage of #1034 to #1036 (2026-11-21): all three calls ran this way and printed `OK`.
- Add a road block option (only with the coach's approval): `node .claude/skills/groom-road-blocks/scripts/options.mjs --dir <scratch folder> --project GenvidTechnologies/1 --defs <defs file>`, run at the root of the gvt-fleet workspace, first as a dry run and then with `--apply`. The skill writes the defs file with the Write tool first: `{"GenvidTechnologies/1": {"blocks": [{"name": "<id> <name>", "color": "<COLOR>", "goal": "<goal>", "done": "<done when>"}]}}`, where `<id>` is the next free block id and `<COLOR>` a GitHub option color such as `PURPLE`. The option's description is `<goal> Done when: <done when>`, at most 450 characters; the script refuses a longer one before any write. The dry run prints the option count, the block it adds and the order of every option. `--apply` keeps the id of every existing option, so no item loses its value, and reads the field back: `readback: <n> options; ids lost 0; names missing 0`. It does not change the road-block table of the project README; the groom-road-blocks skill's `readme.mjs --partial` does that. Added after the triage of #1102 to #1132 (2026-11-25), where G21 was added this way for issues that no option covered.
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
