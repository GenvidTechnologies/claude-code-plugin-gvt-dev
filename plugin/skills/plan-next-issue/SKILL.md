---
name: plan-next-issue
description: Orchestrates picking the next backlog issue to work on and planning it — optionally triages the backlog first (gvt-dev:triage-issues), proposes a ranked shortlist of candidate issues for the user to choose from (one or more), then hands each chosen issue to gvt-dev:plan-task. Interactive by default. Use when the user asks "what should I work on next", wants to go from a groomed backlog straight into a plan, or says "triage and plan", "pick an issue and plan it", or "plan the next bug".
metadata:
  expects:
    config:
      - key: bugTracker.actionQuery
        in: .gvt-agent.json
        required: false
        reason: Read on the auto-detect and light-fetch paths to list open issues and rank candidates when triage was skipped
      - key: bugTracker.triagedLabel
        in: .gvt-agent.json
        required: false
        reason: Subtracted from the action query to detect whether untriaged issues remain (and thus whether to offer triage)
      - key: repo.host
        in: .gvt-agent.json
        required: false
        reason: Read to choose the host-native issue CLI fallback when bugTracker is absent (github → gh); otherwise inferred from the git remote
    tools:
      - command: git
        required: false
        reason: Confirms repo context before orchestrating
---

# Plan Next Issue

A small orchestrator: go from a backlog to a plan in three steps — **triage if
necessary → propose an issue (or several) → plan it**. This skill owns no
exploration and no writes of its own. It sequences two existing skills and makes
the *selection* decision in between:

- **Triage** is delegated to `gvt-dev:triage-issues` (which runs the
  `gvt-dev:issue-triage-analyst` off-thread).
- **Planning** is delegated to `gvt-dev:plan-task`.
- **This thread** decides whether triage is needed, ranks and presents the
  candidates, and routes the choice into planning.

Both delegated skills are invoked with the **Skill tool** — this skill never
re-implements their work.

## How the work splits

- **Exploration → subagent.** Candidate fetching/ranking reuses
  `triage-issues`'s analyst (or a lightweight metadata fetch); full issue bodies
  stay off this thread.
- **Decisions → here.** Whether to triage, which issue(s) to address, and how
  multiple selections flow into planning are all decided on this thread.

## 0. Preconditions & mode

1. **Read the `bugTracker` block** from `.gvt-agent.json`. If it is **present**,
   use it for the steps below. If it is **absent**, don't dead-end — fall back in
   this order:
   - **Host-derived native CLI (preferred).** If `repo.host` maps to a tracker
     with a usable issue CLI, drive the backlog directly with it for this run:
     `repo.host: github` → `gh issue list` / `gh issue view` (the same commands the
     `bugTracker` example uses). Treat the host-native list as the action query and
     `gh issue view {id}` as the read. *(Only `github` currently has a usable native
     issue CLI; `bitbucket` has none — for it, use the options below.)* This skill
     still performs **no writes**, so do not persist anything automatically; once a
     run succeeds, **print a suggested `bugTracker` block** (the example from
     `gvt-dev:triage-issues`, adjusted to the repo) and invite the user to add it
     so the next run is fully configured.
   - **Name the issue(s) directly** — the user supplies issue numbers and we skip
     to step 3 (no fetch needed).
   - **Add a `bugTracker` block** — see the example in `gvt-dev:triage-issues`.
2. **Confirm mode:** interactive by default. `--non-interactive` (alias `--auto`)
   runs unattended; `--force` additionally lets the delegated `triage-issues`
   perform destructive actions unattended (it is otherwise deferred).

## 1. Triage if necessary

Detect whether the backlog needs grooming before planning:

- **First, `git fetch` the default branch** (`repo.default_branch` from
  `.gvt-agent.json`, e.g. `main` — a read-only network call, consistent with
  this skill's no-writes stance) so candidates are ranked and planned against
  fresh `origin/<default-branch>`, not stale local state. **An open issue is not
  proof of pending work:** a merged PR that omitted a `Closes #N` / `Fixes #N` link
  leaves its issue OPEN indefinitely, so already-shipped work can surface as
  plannable. Fetching first lets the ranking step (§2) catch this before any branch
  is created — rather than leaving it to `plan-task`'s late Phase 4 freshness check.
  **If `git fetch` fails because the remote needs interactive auth** (e.g. a
  1Password SSH agent prompting to approve a signature while the user is away,
  failing `Permission denied (publickey)`), don't stall or interrupt them — this
  check is purely read-only, so satisfy it over the host API instead. Stay
  host-aware (`repo.host`): for `github`, the cached `origin/<default-branch>` is
  fresh iff `git rev-parse origin/<default-branch>` equals `gh api
  repos/:owner/:repo/commits/<default-branch> --jq .sha` (HTTPS, no SSH); other
  hosts have their own read-only commit API. Equal SHAs ⇒ the local tracking ref
  already matches the remote, so proceed. (Compare the **tracking ref**, not
  `HEAD` — a failed fetch leaves `origin/<default-branch>` at its last-fetched
  value, and you may be on any branch.) The signing/push path still legitimately
  needs the user — this fallback is only for the read.
- Run `bugTracker.actionQuery` minus `bugTracker.triagedLabel` (open issues not
  yet triaged). This is a count/metadata check — do **not** pull bodies here.
- **First, sanity-check the query's scope.** If `actionQuery` contains a label
  filter (GitHub `gh`: `--label`/`-l` or a `label:` term — adjust for your
  tracker's equivalent), warn the user:
  the triage-need check then only ever sees that label, so untriaged
  enhancements / docs / tech-debt issues are invisible and the skill may wrongly
  report "nothing to triage." Recommend an `actionQuery` that covers the **whole
  open backlog**, and offer to proceed against the unfiltered backlog for this run.
- **If untriaged open issues exist**, surface the count and **offer** to triage:
  *"N open issues are untriaged. Triage first so the shortlist is deduplicated and
  enriched?"* If the user accepts, **invoke `gvt-dev:triage-issues`** and keep
  its analyst report (priorities, enrichment) in hand for step 2. **With only one
  (or very few) untriaged issues, triage's dedup/linking value is nil — note that
  and skip straight to ranking (§2) rather than offering; a lone issue's enrichment,
  if any, folds into the §2 metadata fetch.**
- **If none are untriaged** (or the user declines), skip to step 2.

In `--non-interactive`, triage automatically when untriaged issues exist; pass
`--force` through to `triage-issues` only if it was given here.

## 2. Propose issue(s)

Build a **ranked shortlist** of candidate issues to address:

- **If triage just ran**, reuse the `issue-triage-analyst` report's priorities and
  enrichment — no second fetch.
- **Otherwise**, do a **lightweight inline metadata fetch** (number, title,
  priority, labels — **not** full bodies) via `bugTracker.actionQuery` and rank
  from that.

Rank by readiness to plan: higher priority first, then issues that are already
triaged/enriched and unblocked (no open dependency), de-prioritizing anything
still `needsInfoLabel` or flagged a duplicate. **An epic / tracking / umbrella
issue is not itself a plannable unit** — recognize one by an `epic:`/`tracking:`
title prefix or a body that's a checklist of child issues, and don't rank it as
a candidate; route to its next *unblocked* child instead. And when a
higher-priority issue is **blocked by** a lower-priority one (its dependency),
surface the *unblocker* as the better candidate rather than the blocked parent —
planning the blocker first is what actually advances the higher-priority work. **Also flag/de-prioritize any
candidate that may already be shipped:** when an issue names a concrete target
(a file, doc, or section), run a cheap `git log origin/<default-branch> -- <target>`
against the just-fetched default branch — if the proposed change already appears
there, the issue is likely resolved by a merged PR that never auto-closed it.
This is a soft signal, not a hard exclude (the file can exist while the specific
change didn't land, and many issues name no concrete target); surface it in the
candidate's one-line rationale so the user can skip it or confirm it's still
needed. Present the top candidates with a one-line rationale each and ask the user
to pick **one or more** (an `AskUserQuestion` with `multiSelect: true`,
recommended candidate first). **With a single ranked candidate, skip the
`AskUserQuestion` shortlist ceremony** — a one-option multiSelect is just
friction; present it inline with its rationale and route straight to §3, where
`plan-task`'s own checkpoint is the gate. (Mirrors the lone-issue triage-skip in
§1.)

In `--non-interactive`, auto-pick the single top-ranked candidate.

## 3. Plan

Route the selection into `gvt-dev:plan-task`:

- **One issue selected** → invoke `gvt-dev:plan-task` with that issue. A
  triaged, enriched issue feeds plan-task's *"issue is already a full proposal"*
  shortcut **only if it proposes a concrete change/mechanism** (not just a problem
  + goal) — then pass it as the requirements so plan-task can skip its analyst. **A
  triaged issue that states only a problem + goal is *not* shortcut-eligible**: hand
  it over normally and let plan-task run the full analyst → designer → planner
  pipeline, where the design space is explored. (`triaged`/enriched ≠ contains a
  mechanism — don't conflate the label with shortcut-eligibility.)
- **More than one selected** → first check whether the selection forms natural
  **clusters** — issues touching the same skill/area/files, or joined by an
  explicit relates-to/dependency link — versus issues that are independent of each
  other. Then route accordingly (don't force a single global combine-vs-sequential
  choice):
  - **All related** → fold into **one combined plan** (one branch, one `plan.md`).
  - **All independent** → run **sequential `plan-task` invocations**, one branch each.
  - **Mixed (some related, some not)** → route **per cluster**: each related group
    becomes its own combined plan, and each independent issue gets its own
    sequential run. Present the proposed grouping for confirmation before invoking.
  Then invoke plan-task accordingly. In `--non-interactive`, default to
  **sequential** (one run per issue, no combining). On any sequential path — and
  between clusters — after each `plan-task` returns control, resume here with the
  next cluster/issue until the shortlist is exhausted; the queue lives on this thread.
  Across these sequential runs `plan.md` is a **per-issue transient**: it's
  gitignored, so the prior issue's plan survives the `git checkout` onto the next
  issue's branch. That lingering plan is **spent** (its tasks were just committed),
  not pending — `plan-task`'s Phase 4 guard classifies it as such and overwrites it,
  so don't pre-rename or preserve it between issues.

Hand off cleanly: once `plan-task` takes over, it owns the analysis → design →
planning checkpoints and the plan/branch creation. This skill's job ends at the
handoff.

## Safety

| Action | Interactive (default) | `--non-interactive` |
|---|---|---|
| Run `triage-issues` | offer when untriaged issues exist | auto when untriaged issues exist |
| Destructive triage actions (close-as-duplicate, splits) | per delegated approval | **deferred** unless `--force` |
| Pick issue(s) to plan | user selects one or more | auto-pick top-ranked |
| Combine vs sequential plans | ask when >1 selected | sequential |

This skill performs **no writes itself** — every mutation happens inside the
delegated `triage-issues` (tracker edits) or `plan-task` (plan + branch). It only
reads the backlog to detect triage need and rank candidates.

## Closing summary

Report: whether triage ran (and what it changed, from its summary); which issue(s)
were chosen; and how they were routed into planning (one combined plan, or N
sequential `plan-task` runs). Point the user at the plan(s) `plan-task` produced.

If a delegated skill (`triage-issues`, `plan-task`) drafted a follow-up issue but
its `gh issue create` was blocked — the auto-mode write-classifier denied it (a
`Bash(gh issue *)` allow-rule does not override that gate) or a permission prompt
fired while the user was away — **surface the fully drafted body here and record it
as an outstanding action** rather than letting it drop. This is consistent with the
skill's no-writes stance: it reports the drafted body; the user files it (`! gh
issue create …`). See `${CLAUDE_PLUGIN_ROOT}/docs/development-principles.md`
principle #9.
