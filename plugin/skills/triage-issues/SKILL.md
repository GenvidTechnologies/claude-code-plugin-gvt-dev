---
name: triage-issues
description: Triages a project's issue backlog interactively — deduplicates, enriches, links dependencies, splits overstuffed issues, and stamps a 'triaged' label. Works for bugs, tickets, or any tracker item. Tracker-agnostic; project specifics come from docs/issue-triage.md and the bugTracker block in .genvid-agent.json. Use when triaging or grooming an issue backlog, or cleaning up duplicates and priorities.
metadata:
  expects:
    files:
      - path: docs/issue-triage.md
        required: false
        reason: Project triage conventions (taxonomy, priority meanings, split/duplicate policy) and mutation recipes; the skill offers to scaffold it from the bundled template if absent
      - path: docs/TOC.md
        required: false
        reason: The §0 scaffold step adds a one-line index entry for the scaffolded docs/issue-triage.md when docs/TOC.md is present
    config:
      - key: bugTracker.actionQuery
        in: .genvid-agent.json
        required: false
        reason: Command template the analyst runs to fetch the issues to triage
      - key: bugTracker.comparisonQuery
        in: .genvid-agent.json
        required: false
        reason: Wider read-only query used to detect duplicates against already-triaged or closed issues
      - key: bugTracker.triagedLabel
        in: .genvid-agent.json
        required: false
        reason: The label the skill stamps when an issue's triage is complete (and excludes from the default action set for idempotent re-runs)
      - key: bugTracker.needsInfoLabel
        in: .genvid-agent.json
        required: false
        reason: The label the skill applies when a triaged issue is missing required fields
    tools:
      - command: git
        required: false
        reason: Confirms repo context before triaging
---

# Triage Issues

Interactively triage a project's issue backlog (bugs, tickets, or any tracker
item): deduplicate, split, enrich, link dependencies, and stamp a `triaged`
label. The workflow is **tracker-agnostic** — every project specific comes from
`docs/issue-triage.md` (conventions + mutation recipes) and the `bugTracker`
block in `.genvid-agent.json` (access mechanics).

## How the work splits

- **Exploration → subagent.** All fetching and cross-issue analysis runs in the
  `genvid-dev:issue-triage-analyst` agent, off this thread, so this conversation
  stays focused on prioritization and adjustment.
- **Decisions → here.** This thread reviews the report, takes your adjustments,
  and performs every write. The analyst never writes.

## 0. Preconditions & scope

1. **Read `docs/issue-triage.md`.** If it is **absent**, offer to scaffold it — do
   not guess conventions. Two bundled templates exist; pick the one that matches the
   repo's label scheme:
   - `${CLAUDE_PLUGIN_ROOT}/skills/triage-issues/issue-triage.template.md` — the
     **structured** variant (`type:*` / `priority/*` / `area:*` taxonomy).
   - `${CLAUDE_PLUGIN_ROOT}/skills/triage-issues/issue-triage.flat.template.md` — the
     **flat** variant for repos using a simple category-label set (e.g. GitHub's
     defaults: `bug`, `enhancement`, `documentation`, `duplicate`, `question`,
     `wontfix`) with no `type:`/`priority/`/`area:` scheme.

   **Detect the default:** probe the repo's labels (`gh label list --json name -L 200`,
   or the tracker equivalent). If any label name is prefixed `type:` or `priority/`,
   default to **structured**; otherwise default to **flat**. Confirm the choice with
   the user (`AskUserQuestion`, detected default first) before copying — the probe is
   a heuristic, not a verdict. Once scaffolded, remind the user to set the
   `bugTracker` block's `needsInfoLabel`/`triagedLabel` to match the chosen variant
   (the flat variant reuses `question` for needs-info). In `--non-interactive`, copy
   the detected default without asking.

   **Index the scaffolded doc in `docs/TOC.md`.** After copying the template, add a
   one-line entry for `docs/issue-triage.md` to `docs/TOC.md` under a **Process**
   heading (create the heading if absent) — mirroring how `plan-task` indexes a
   scaffolded `docs/decisions/` record. An unindexed contract doc is invisible to
   the planning/triage skills that discover docs via the index. Interactively,
   **offer** it; in `--non-interactive`, add it **automatically**. Make it idempotent
   (skip if the entry already exists) and skip gracefully if `docs/TOC.md` is absent.

   **If the user declines scaffolding, or a quick scan of the open backlog shows no
   bugs** (a tiny enhancement/chore backlog where the full taxonomy is overkill),
   offer a **light-touch groom** instead (→ §0a, which skips the rest of §0).
   Otherwise proceed with the full workflow only once the contract exists.
2. **Read the `bugTracker` block** from `.genvid-agent.json` (full workflow only —
   the §0a groom skips this). If it is **absent**, this is not a hard stop: the
   **§0a light-touch groom** already operates directly via the tracker's native CLI
   (e.g. `gh`) with no `bugTracker` block, so offer that path for a quick groom.
   For the full analyst-driven workflow, offer to add a `bugTracker` block (show the
   example block at the bottom of this skill); proceed with §1 onward only once it
   exists.
3. **Resolve scope:**
   - Default: `actionQuery` minus `triagedLabel` (open issues not yet triaged).
   - Override: an explicit query/label, or a list of issue IDs passed as args.
4. **Confirm mode:** interactive by default. `--non-interactive` (alias `--auto`)
   runs unattended; `--force` additionally permits destructive actions unattended.

### 0a. Light-touch groom (no-contract path)

A sanctioned path for small or bug-free backlogs that skips the full contract. It
needs **neither `docs/issue-triage.md` nor the `bugTracker` block** (skip §0 step 2)
and operates **directly via the tracker's native CLI** (e.g. `gh`), using only the
tracker's **existing label vocabulary** — no analyst dispatch, no
`docs/issue-triage.md` or `bugTracker` writes, and no `triagedLabel` stamp. It
**bypasses §1–§5 entirely**:

- **Scan** the open issues in scope with the tracker's native list command.
- **Propose**, per issue, label / priority / clarity / cross-reference fixes drawn
  **only from labels that already exist** — never invent a taxonomy.
- **Apply** with per-item approval, holding the same §4 safety bar: never
  batch-close or mass-create issues without per-item approval (or `--force`).
- **Summarize** what changed.

When the groom reveals a backlog large or bug-heavy enough to warrant the full
taxonomy, stop and offer to scaffold `docs/issue-triage.md` (back to §0 step 1)
rather than grooming on.

## 1. Dispatch exploration (Phase 1)

Dispatch the `genvid-dev:issue-triage-analyst` agent with: the resolved scope, the
`bugTracker` block verbatim, and the path `docs/issue-triage.md`. It returns one
structured triage report. **Do not fetch issue bodies yourself** — keeping them
off this thread is the point of the split. Mode flags (`--non-interactive`,
`--force`) govern only this thread's approval and write behavior; the analyst
always runs read-only regardless.

## 2. Phase 1 review — cross-cutting findings (interactive)

Present the **relational** findings as a set: duplicate clusters, overlaps,
dependencies, split candidates. For each, let the user accept / reject / adjust
(e.g. change the canonical, drop a cluster member, reject a split). Destructive
items — close-as-duplicate, create split issues — are **recorded but NOT applied
here**; they are carried into the per-issue walk, matched to each affected issue
by issue number.

In `--non-interactive`, accept the analyst's findings as-is, but still defer the
destructive items unless `--force` was passed.

## 3. Phase 2 — per-issue walk (interactive)

For each action-set issue, gather its work from two places in the analyst's
report: its **Per-issue enrichment** row, and any Phase 1 relational findings
whose membership includes this issue's number (duplicate-cluster membership, an
accepted dependency, an approved split). Present both together, then apply the
approved changes using the **Mutation recipes** in `docs/issue-triage.md`:

- type / priority / field updates, label add/remove, body language fixes;
- `needsInfoLabel` + a comment when a required field is missing (or let the
  triager supply the missing info inline, then skip the label);
- dependency links;
- duplicate handling per the project's **Duplicates** policy (link-only, or
  close-as-duplicate to the canonical — closing needs approval, see §4);
- split-issue / sub-issue creation per the **Splitting** policy;
- when the analyst flagged a mechanism prescription, offer to rewrite the issue
  body to outcome + acceptance criteria, dropping the prescribed mechanism — per
  `development-principles.md` principle #8 (stale-mechanism corollary);
- **last**, add `triagedLabel` — only after the issue's other approved changes
  succeed. This keeps the skill idempotent: an aborted run leaves the issue
  un-triaged, so re-running picks it up again.

Apply one issue fully before moving to the next. If a write fails, stop on that
issue, report the failure, and do **not** stamp `triagedLabel`.

## 4. Safety

| Action | Interactive (default) | `--non-interactive` |
|---|---|---|
| Field / label / priority / body / language | per-issue approval | auto-apply |
| `needs-info` label + comment | approve | auto-apply |
| Dependency links | approve | auto-apply |
| Close-as-duplicate / create split issues | approve per item | **deferred** unless `--force` |
| `triaged` label | after the issue's changes | after the issue's changes |

Never batch-close or mass-create issues without either per-item approval or an
explicit `--force`. These actions are hard to reverse on most trackers.

## 5. Closing summary

Report: issues triaged; fields / labels / priorities changed; duplicates linked or
closed; issues split or created; dependencies linked; and anything left
`needs-info` or deferred for a follow-up run.

## Example `bugTracker` block

Add this to `.genvid-agent.json` (GitHub / `gh` example — adjust queries, labels,
and the CLI for your tracker):

```json
"bugTracker": {
  "kind": "github",
  "actionQuery": "gh issue list --state open -L 200 --json number,title,labels,body,assignees",
  "comparisonQuery": "gh issue list --state all -L 500 --json number,title,labels,state",
  "readOne": "gh issue view {id} --json number,title,body,labels,comments",
  "triagedLabel": "triaged",
  "needsInfoLabel": "needs-info"
}
```

Keep `actionQuery` scoped to the **whole open backlog** — do **not** narrow it to a
single label (e.g. `--label bug`). The triage-need detection subtracts only
`triagedLabel`, so a label-scoped `actionQuery` silently hides untriaged issues
that don't match the label (enhancements, docs, tech-debt), making the backlog look
groomed when it isn't.
