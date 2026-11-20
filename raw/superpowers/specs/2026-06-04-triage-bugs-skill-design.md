# Design: `triage-bugs` skill

**Date:** 2026-06-04
**Status:** Approved (brainstorming) — pending spec review
**Scope:** A new `genvid-dev` plugin skill (+ a supporting agent and a two-surface project-convention contract) for interactive bug-backlog triage.

## Problem

Genvid game projects accumulate bug backlogs that need periodic triage: deduplicating, splitting overstuffed issues, filling missing information, normalizing types/labels/priorities to project conventions, and recording dependencies. Most bug trackers have no pull-request-style review gate, so triage edits land directly. We want a skill that does this work **interactively by default** (the human approves changes before they're written) while keeping the workflow reusable across trackers and projects.

The hard requirement is a clean split between **the skill** (the tracker-agnostic workflow) and **the project's conventions** (where bugs live, how to access them, the label/type/priority taxonomy, mutation recipes).

## Goals

- Fetch a project's untriaged bugs and analyze their content.
- Detect duplicates and overlaps; detect bugs that should be split into sub-issues or multiple issues.
- Flag missing information and improve issue language.
- Update type, labels, priorities, and other fields per project conventions.
- Detect dependencies with other issues and record them.
- Stamp a `triaged` label so triage is idempotent and re-runnable.
- Keep the main conversation focused on prioritization/adjustment by doing exploration in a subagent.

## Non-goals

- Shipping a universal fetch script (impossible while tracker-agnostic — each project declares its own commands).
- Adding bug-triage to the core four-file convention contract (it's skill-conditional, opt-in).
- A non-interactive "fire and forget" mode that performs irreversible actions without any guard (non-interactive auto-applies safe edits but still defers destructive ones unless `--force`).

## Architecture

Three pieces:

### 1. Skill — `skills/triage-bugs/SKILL.md`
Orchestrator, runs in the **main thread**. Namespaced `/genvid-dev:triage-bugs`. Responsibilities:
- Read project triage conventions and resolve scope.
- Dispatch the analyst subagent to do all fetching + cross-bug exploration.
- Drive the two-phase interactive approval.
- Perform all **writes** (label/field/body updates, dependency links, split-issue creation, the `triaged` label). Writes are decisions, so they stay in the main thread.

### 2. Agent — `agents/bug-triage-analyst.md`
Read-only, dispatched as `subagent_type: "genvid-dev:bug-triage-analyst"`, runs **outside** the main thread. Tools restricted to `Read, Grep, Glob, Bash`; prompt-restricted to read-only tracker commands (mirrors `genvid-dev:analyst`). Given the conventions + scope, it:
- Runs the project's list/read commands to build the corpus: the **action set** plus a wider **read-only comparison set** (already-triaged + recently-closed) so dedup can catch new bugs that duplicate already-triaged ones.
- Produces the heavy analysis: duplicate clusters, overlaps, dependencies, split candidates, missing-info gaps, and per-bug field/label/priority/language proposals.
- Returns **one structured triage report**. Writes nothing.

### 3. Project-convention surfaces (the skill/convention split)

**`.genvid-agent.json` → `bugTracker` block** (lean access mechanics; what the *analyst* needs):
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
- `actionQuery` — the set the skill acts on. Default semantics: open bugs *without* `triagedLabel`; the skill appends the "minus triaged" guard if the query doesn't already encode it.
- `comparisonQuery` — wider read-only set for dedup/dependency detection.
- `readOne` — full body + comments for one issue; `{id}` substituted.
- Label names referenced by key so doc recipes and the skill agree.

**`docs/bug-triage.md`** (prose conventions + mutation recipes; what the *main thread* needs). Fixed section skeleton, relied on by heading:
```markdown
# Bug Triage Conventions
## Types            # valid issue types and when each applies
## Priorities       # the scale + decision rule per level
## Labels           # taxonomy; mutual exclusivity; which the triager sets
## Required fields   # what every triaged bug must have
## Splitting         # when a bug becomes sub-issues vs. multiple issues
## Duplicates        # policy: link-only vs. close-as-duplicate to a canonical
## Dependencies      # how a "blocked by / relates to" link is expressed
## Mutation recipes  # exact commands for each write the main thread performs
```
- Analyst reads everything above "Mutation recipes" (the semantics it reasons with).
- Main thread reads "Mutation recipes" when applying approved changes.
- Missing sections degrade gracefully: warn that project guidance was unavailable, fall back to generic triage judgement.

**Bootstrapping:** the skill ships `skills/triage-bugs/bug-triage.template.md` (filled-in) and an example `bugTracker` block in its SKILL.md. When `docs/bug-triage.md` is absent, the skill stops and offers to scaffold from the template — it does **not** auto-add either surface to the greenfield scaffold or the core contract.

## Workflow

### Step 0 — Preconditions & scope (main thread)
- Read `docs/bug-triage.md` (offer scaffold if absent) and the `bugTracker` block (warn if absent → can't fetch).
- Resolve scope: default = `actionQuery` minus `triagedLabel`; overridable by explicit query, label, or a list of issue IDs.
- Interactive by default; `--non-interactive` / `--auto` for unattended runs.

### Phase 1 — Exploration (analyst subagent, read-only, off main thread)
Dispatched with the resolved scope, the `bugTracker` block, and the path to `docs/bug-triage.md`. Fetches action + comparison sets, returns one structured report:
```markdown
## Triage Report — <project> (<N> bugs in scope)
### Duplicate clusters
- [#12, #47, #88] — same crash; canonical #12. Confidence: high. Proposed: per duplicate policy.
### Overlaps (related, not duplicate)
- #20 ⊃ #33 — #33 is a subset of #20's scope.
### Dependencies
- #55 blocked-by #54.
### Split candidates
- #61 — bundles 3 unrelated defects → propose 3 issues / sub-issues.
### Per-bug enrichment   (one entry per action-set bug)
- #12: type=bug→crash · priority=∅→P1 · labels +area:netcode · body: language cleanup · missing: repro steps → needs-info · deps: none
```
Proposals only — the analyst writes nothing; raw issue bodies never enter main context.

### Phase 1 review (main thread, interactive)
Present cross-cutting findings (clusters, overlaps, dependencies, split candidates) as a set for approval — they're inherently relational. User accepts/rejects/adjusts each. Destructive items (close-as-duplicate, create split issues) are flagged and **not applied yet** — scheduled into the Phase-2 walk.

### Phase 2 — Per-bug walk (main thread, interactive)
For each action-set bug, present proposed enrichment + inherited relational actions, apply on approval via the **mutation recipes**:
- field/type/priority updates, label changes, body language fixes,
- `needs-info` label + comment when required info missing (triager may fill inline instead),
- dependency links, duplicate links/closes (per policy), split-issue creation,
- finally stamp `triagedLabel` — applied **last**, only after the bug's other changes succeed, so an aborted run leaves the bug un-triaged and re-runnable (idempotent).

### Safety & modes
| Action | Interactive (default) | `--non-interactive` |
|---|---|---|
| Field/label/priority/body/language | per-bug approval | auto-apply |
| `needs-info` + comment | approve | auto-apply |
| Dependency links | approve | auto-apply |
| Close-as-duplicate / create split issues | approve per item | **deferred** unless `--force` |
| `triaged` label | after changes | after changes |

Final summary: what changed, what was deferred, what's flagged `needs-info`.

## Plugin integration

**Files added:**
```
skills/triage-bugs/SKILL.md
skills/triage-bugs/bug-triage.template.md
agents/bug-triage-analyst.md
```

**`SKILL.md` frontmatter** — everything skill-conditional is `required: false`:
```yaml
---
name: triage-bugs
description: <third-person what+when>
metadata:
  expects:
    files:
      - path: docs/bug-triage.md
        required: false
        reason: Project's triage conventions and mutation recipes; skill offers to scaffold from template if absent
    config:
      - key: bugTracker.actionQuery
        in: .genvid-agent.json
        required: false
        reason: Command template the analyst runs to fetch the bugs to triage
      - key: bugTracker.comparisonQuery
        in: .genvid-agent.json
        required: false
        reason: Wider read-only query for detecting duplicates against already-triaged/closed issues
    tools:
      - command: git
        required: false
        reason: Confirms repo context
---
```
The tracker CLI (`gh`/`jira`/`acli`) is **not** declared as a required tool — it's project-chosen and named by the `bugTracker` block.

**`bug-triage-analyst.md` frontmatter:**
```yaml
---
name: bug-triage-analyst
description: Read-only. Fetches a bug corpus via project-declared tracker commands and returns a structured triage report. Writes nothing.
tools: Read, Grep, Glob, Bash
metadata:
  expects:
    config:
      - key: bugTracker.actionQuery
        in: .genvid-agent.json
        required: false
        reason: The fetch command for the action set
---
```

**Validation surface:**
- `claude plugin validate .` passes (custom data under `metadata`).
- `audit-conventions` aggregates only **required** expectations → no new repo-wide requirement; a repo that never triages bugs still audits clean.

**Docs/dogfood touch-ups:**
- `docs/TOC.md` — add a pointer to the new skill.
- `CHANGELOG.md` `[Unreleased]` — add the feature entry (release handled separately via `/genvid-dev:release-plugin`).
- No `docs/bug-triage.md` is added to this plugin repo itself (it has no bug-triage conventions of its own); the template lives under the skill.

## Testing / verification

- `claude plugin validate .` — schema check on the new skill + agent frontmatter.
- `claude plugin details genvid-dev` — confirm the new components appear in the inventory after a local update.
- Manual content review against the house style (thin prose orchestrator; conventions externalized).
- No eval harness: this is a judgment-heavy interactive workflow skill, not an objectively-verifiable/state-gated one (per the project's testing guidance).
