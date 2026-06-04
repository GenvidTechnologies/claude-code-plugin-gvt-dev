---
name: triage-bugs
description: Triages a project's bug backlog interactively — deduplicates, enriches, links dependencies, splits overstuffed issues, and stamps a 'triaged' label. Tracker-agnostic; project specifics come from docs/bug-triage.md and the bugTracker block in .genvid-agent.json. Use when triaging a bug backlog, grooming issues, or cleaning up duplicates and priorities.
metadata:
  expects:
    files:
      - path: docs/bug-triage.md
        required: false
        reason: Project triage conventions (taxonomy, priority meanings, split/duplicate policy) and mutation recipes; the skill offers to scaffold it from the bundled template if absent
    config:
      - key: bugTracker.actionQuery
        in: .genvid-agent.json
        required: false
        reason: Command template the analyst runs to fetch the bugs to triage
      - key: bugTracker.comparisonQuery
        in: .genvid-agent.json
        required: false
        reason: Wider read-only query used to detect duplicates against already-triaged or closed issues
      - key: bugTracker.triagedLabel
        in: .genvid-agent.json
        required: false
        reason: The label the skill stamps when a bug's triage is complete (and excludes from the default action set for idempotent re-runs)
      - key: bugTracker.needsInfoLabel
        in: .genvid-agent.json
        required: false
        reason: The label the skill applies when a triaged bug is missing required fields
    tools:
      - command: git
        required: false
        reason: Confirms repo context before triaging
---

# Triage Bugs

Interactively triage a project's bug backlog: deduplicate, split, enrich, link
dependencies, and stamp a `triaged` label. The workflow is **tracker-agnostic** —
every project specific comes from `docs/bug-triage.md` (conventions + mutation
recipes) and the `bugTracker` block in `.genvid-agent.json` (access mechanics).

## How the work splits

- **Exploration → subagent.** All fetching and cross-bug analysis runs in the
  `genvid-dev:bug-triage-analyst` agent, off this thread, so this conversation
  stays focused on prioritization and adjustment.
- **Decisions → here.** This thread reviews the report, takes your adjustments,
  and performs every write. The analyst never writes.

## 0. Preconditions & scope

1. **Read `docs/bug-triage.md`.** If it is **absent**, stop and offer to scaffold
   it from `${CLAUDE_PLUGIN_ROOT}/skills/triage-bugs/bug-triage.template.md` —
   do not guess conventions. Proceed only once it exists.
2. **Read the `bugTracker` block** from `.genvid-agent.json`. If it is **absent**,
   warn that fetching cannot proceed and offer to add one (show the example block
   at the bottom of this skill). Proceed only once it exists.
3. **Resolve scope:**
   - Default: `actionQuery` minus `triagedLabel` (open bugs not yet triaged).
   - Override: an explicit query/label, or a list of issue IDs passed as args.
4. **Confirm mode:** interactive by default. `--non-interactive` (alias `--auto`)
   runs unattended; `--force` additionally permits destructive actions unattended.

## 1. Dispatch exploration (Phase 1)

Dispatch the `genvid-dev:bug-triage-analyst` agent with: the resolved scope, the
`bugTracker` block verbatim, and the path `docs/bug-triage.md`. It returns one
structured triage report. **Do not fetch issue bodies yourself** — keeping them
off this thread is the point of the split. Mode flags (`--non-interactive`,
`--force`) govern only this thread's approval and write behavior; the analyst
always runs read-only regardless.

## 2. Phase 1 review — cross-cutting findings (interactive)

Present the **relational** findings as a set: duplicate clusters, overlaps,
dependencies, split candidates. For each, let the user accept / reject / adjust
(e.g. change the canonical, drop a cluster member, reject a split). Destructive
items — close-as-duplicate, create split issues — are **recorded but NOT applied
here**; they are carried into the per-bug walk, matched to each affected bug by
issue number.

In `--non-interactive`, accept the analyst's findings as-is, but still defer the
destructive items unless `--force` was passed.

## 3. Phase 2 — per-bug walk (interactive)

For each action-set bug, gather its work from two places in the analyst's
report: its **Per-bug enrichment** row, and any Phase 1 relational findings
whose membership includes this bug's number (duplicate-cluster membership, an
accepted dependency, an approved split). Present both together, then apply the
approved changes using the **Mutation recipes** in `docs/bug-triage.md`:

- type / priority / field updates, label add/remove, body language fixes;
- `needsInfoLabel` + a comment when a required field is missing (or let the
  triager supply the missing info inline, then skip the label);
- dependency links;
- duplicate handling per the project's **Duplicates** policy (link-only, or
  close-as-duplicate to the canonical — closing needs approval, see §4);
- split-issue / sub-issue creation per the **Splitting** policy;
- **last**, add `triagedLabel` — only after the bug's other approved changes
  succeed. This keeps the skill idempotent: an aborted run leaves the bug
  un-triaged, so re-running picks it up again.

Apply one bug fully before moving to the next. If a write fails, stop on that
bug, report the failure, and do **not** stamp `triagedLabel`.

## 4. Safety

| Action | Interactive (default) | `--non-interactive` |
|---|---|---|
| Field / label / priority / body / language | per-bug approval | auto-apply |
| `needs-info` label + comment | approve | auto-apply |
| Dependency links | approve | auto-apply |
| Close-as-duplicate / create split issues | approve per item | **deferred** unless `--force` |
| `triaged` label | after the bug's changes | after the bug's changes |

Never batch-close or mass-create issues without either per-item approval or an
explicit `--force`. These actions are hard to reverse on most trackers.

## 5. Closing summary

Report: bugs triaged; fields / labels / priorities changed; duplicates linked or
closed; issues split or created; dependencies linked; and anything left
`needs-info` or deferred for a follow-up run.

## Example `bugTracker` block

Add this to `.genvid-agent.json` (GitHub / `gh` example — adjust queries, labels,
and the CLI for your tracker):

```json
"bugTracker": {
  "kind": "github",
  "actionQuery": "gh issue list --state open --label bug -L 200 --json number,title,labels,body,assignees",
  "comparisonQuery": "gh issue list --state all -L 500 --json number,title,labels,state",
  "readOne": "gh issue view {id} --json number,title,body,labels,comments",
  "triagedLabel": "triaged",
  "needsInfoLabel": "needs-info"
}
```
