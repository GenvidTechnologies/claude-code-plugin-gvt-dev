# Triage-Bugs Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tracker-agnostic, interactive `/genvid-dev:triage-bugs` skill — a main-thread orchestrator plus a read-only `bug-triage-analyst` subagent — that triages a bug backlog against a two-surface project-convention contract.

**Architecture:** The skill orchestrates in the main thread (decisions + writes); a dedicated read-only agent does all fetching and cross-bug analysis off-thread and returns one structured report. Project specifics live in a `bugTracker` block in `.genvid-agent.json` (access mechanics, for the analyst) and `docs/bug-triage.md` (prose conventions + mutation recipes, for the main thread). Neither is part of the core four-file contract — both are skill-conditional (`required: false`).

**Tech Stack:** Claude Code plugin authoring — Markdown skills (`skills/<name>/SKILL.md`) and flat agents (`agents/<name>.md`) with YAML frontmatter; verification via `claude plugin validate .`. No code, no npm test runner. Reference: this plan is fully specified by `docs/superpowers/specs/2026-06-04-triage-bugs-skill-design.md`.

**Verification model (read this — there is no unit-test harness):** These artifacts are Markdown content. Each task's "test" is a two-part gate: (1) a **presence/content check** that *fails before* the file exists and *passes after* (the red→green signal), and (2) `claude plugin validate .`, which schema-checks all skill/agent frontmatter and must stay green. Commands are written for the Bash tool (POSIX). On Windows, run them via the Bash tool, not PowerShell, to avoid path/quote mangling.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `agents/bug-triage-analyst.md` | Read-only exploration agent: fetch corpus, analyze, return structured report. | Create |
| `skills/triage-bugs/bug-triage.template.md` | Filled-in conventions template the skill scaffolds when a project lacks `docs/bug-triage.md`. | Create |
| `skills/triage-bugs/SKILL.md` | Main-thread orchestrator: preconditions, dispatch, two-phase approval, writes. | Create |
| `docs/TOC.md` | Plugin doc index — add a one-line pointer to the new skill. | Modify |
| `CHANGELOG.md` | `[Unreleased]` — record the new skill. | Modify |

Build order: the agent first (the skill references it), then the template (the skill references it), then the skill, then the doc/changelog wiring, then a final whole-plugin validation. Each task is one commit.

---

## Task 1: Read-only analyst agent

**Files:**
- Create: `agents/bug-triage-analyst.md`

- [ ] **Step 1: Verify the component does not exist yet (red)**

Run:
```bash
test -f agents/bug-triage-analyst.md && echo "EXISTS" || echo "ABSENT"
```
Expected: `ABSENT`

- [ ] **Step 2: Create `agents/bug-triage-analyst.md` with this exact content**

```markdown
---
name: bug-triage-analyst
description: Read-only. Fetches a project's bug corpus via its declared tracker commands and returns one structured triage report — duplicate clusters, overlaps, dependencies, split candidates, and per-bug field/label/priority/language proposals. Proposes changes; never writes. Use as the exploration phase of the triage-bugs skill.
tools: Read, Grep, Glob, Bash
model: opus
metadata:
  expects:
    files:
      - path: docs/bug-triage.md
        required: false
        reason: The project's triage conventions (taxonomy, priority meanings, split/duplicate policy) the analysis reasons against
    config:
      - key: bugTracker.actionQuery
        in: .genvid-agent.json
        required: false
        reason: The command the analyst runs to fetch the action set
      - key: bugTracker.comparisonQuery
        in: .genvid-agent.json
        required: false
        reason: The wider read-only query used to detect duplicates against already-triaged or closed issues
      - key: bugTracker.readOne
        in: .genvid-agent.json
        required: false
        reason: The command the analyst runs to read a single issue's full body and comments
---

You are a read-only bug-triage analyst for this project.

## Role

You are the exploration phase of `/genvid-dev:triage-bugs`. You run off the main thread so the orchestrator's context stays focused on decisions. You fetch the bug corpus, analyze it against the project's triage conventions, and return ONE structured report. You **propose** changes; you **never** apply them.

## Inputs (from the dispatching skill)

The dispatch prompt gives you:

- **Scope** — the resolved action set: a query, a label, or an explicit list of issue IDs.
- **`bugTracker` block** — from `.genvid-agent.json`: `kind`, `actionQuery`, `comparisonQuery`, `readOne`, `triagedLabel`, `needsInfoLabel`.
- **Conventions path** — `docs/bug-triage.md`.

If the conventions doc is missing, say so in the report and fall back to generic triage judgement.

## Process

1. **Read conventions.** Read `docs/bug-triage.md`, sections *above* "Mutation recipes" — Types, Priorities, Labels, Required fields, Splitting, Duplicates, Dependencies. These are the rules you reason with. Ignore "Mutation recipes" — that is the main thread's concern.
2. **Fetch the action set.** Run the resolved scope command (default `actionQuery`, minus `triagedLabel` if the query does not already encode it). This is the set you propose changes for.
3. **Fetch the comparison set.** Run `comparisonQuery` for the wider read-only corpus (already-triaged + recently-closed). You compare against it but never propose changes to its issues.
4. **Read full bodies** for action-set issues — and for any comparison issue a finding hinges on — via `readOne` (substitute `{id}`).
5. **Analyze:**
   - **Duplicate clusters** — the same defect reported more than once. Pick a canonical (per the Duplicates policy); give a confidence (high/medium/low).
   - **Overlaps** — related-but-distinct (subset/superset/shared-cause), not duplicates.
   - **Dependencies** — blocked-by / blocks / relates-to links between issues.
   - **Split candidates** — one issue bundling multiple unrelated defects, per the Splitting policy.
   - **Per-bug enrichment** — proposed type, priority, label add/remove, body language cleanup, and any missing required fields (→ `needsInfoLabel`).

## Hard rule: read-only

Run ONLY read commands (`list`, `view`, `get`, equivalents). Never run a command that edits, comments, labels, closes, or creates an issue. If a finding needs a write, describe it as a proposal in the report — do not perform it.

## Output Format

```markdown
## Triage Report — <project> (<N> bugs in scope)

### Duplicate clusters
- [#12, #47, #88] — same crash on connect; canonical #12. Confidence: high. Proposed: per Duplicates policy.

### Overlaps (related, not duplicate)
- #20 ⊃ #33 — #33 is a subset of #20's scope.

### Dependencies
- #55 blocked-by #54 — #54 must ship first.

### Split candidates
- #61 — bundles 3 unrelated defects → propose 3 issues / sub-issues per Splitting policy.

### Per-bug enrichment (one entry per action-set bug)
- #12: type bug→crash · priority ∅→P1 · labels +area:netcode · body: language cleanup · missing: repro steps → needs-info · deps: none
- #20: type ok · priority P2→P1 · labels none · body: ok · missing: none · deps: none

### Notes
- Conventions doc present: yes/no. Fallbacks applied: <list or none>.
```
```

- [ ] **Step 3: Verify presence + required structure (green)**

Run:
```bash
test -f agents/bug-triage-analyst.md \
  && grep -q "^name: bug-triage-analyst$" agents/bug-triage-analyst.md \
  && grep -q "Hard rule: read-only" agents/bug-triage-analyst.md \
  && echo "OK"
```
Expected: `OK`

- [ ] **Step 4: Schema-validate the plugin**

Run: `claude plugin validate .`
Expected: validation passes with no errors (the new agent is accepted; custom keys live under `metadata`).

- [ ] **Step 5: Commit**

```bash
git add agents/bug-triage-analyst.md
git commit -m "$(cat <<'EOF'
triage-bugs: add read-only bug-triage-analyst agent

Exploration phase for the triage-bugs skill: fetches the action set plus a
wider read-only comparison set, analyzes duplicates/overlaps/dependencies/
split candidates and per-bug enrichment, returns one structured report.
Writes nothing.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Conventions template

**Files:**
- Create: `skills/triage-bugs/bug-triage.template.md`

- [ ] **Step 1: Verify the component does not exist yet (red)**

Run:
```bash
test -f skills/triage-bugs/bug-triage.template.md && echo "EXISTS" || echo "ABSENT"
```
Expected: `ABSENT`

- [ ] **Step 2: Create `skills/triage-bugs/bug-triage.template.md` with this exact content**

````markdown
# Bug Triage Conventions

> Project conventions consumed by `/genvid-dev:triage-bugs`. Copy this file to
> `docs/bug-triage.md` and edit it for your tracker and taxonomy. The companion
> **access mechanics** (fetch queries, label names) live in the `bugTracker`
> block of `.genvid-agent.json` — see the skill's SKILL.md for that block.
>
> The example commands below assume **GitHub Issues via the `gh` CLI**. Replace
> them with your tracker's equivalents (Jira `acli`, Linear API, …); the section
> headings must stay the same — the skill and analyst locate guidance by heading.

## Types

- `bug` — incorrect behavior in shipped functionality (default).
- `crash` — hard failure, exception, or hang.
- `regression` — worked in a prior build, broken now.

Set the type via the matching `type:*` label; exactly one per issue.

## Priorities

- `P0` — blocks release or breaks the build; fix now.
- `P1` — major feature broken, no workaround; fix this sprint.
- `P2` — broken with a workaround, or a minor feature; schedule.
- `P3` — cosmetic or nice-to-have; backlog.

Decision rule: pick by the worst **observable** impact, not the suspected cause.

## Labels

- `type:*` — exactly one (mutually exclusive): `type:bug`, `type:crash`, `type:regression`.
- `area:*` — one or more subsystem tags (`area:netcode`, `area:ui`, …).
- `priority/*` — exactly one: `priority/P0` … `priority/P3`.
- `needs-info` — set when required fields are missing; cleared when supplied.
- `duplicate` — set on non-canonical members of a duplicate cluster.
- `triaged` — set **last**, by the skill, when triage is complete.

The triager sets `type:*`, `area:*`, and `priority/*`. Reporters may set `area:*`.

## Required fields

Every triaged bug must have: a reproduction (steps or a failing case), expected
vs. actual behavior, the build/version, and at least one `area:*` label. Missing
any of these → add `needs-info` and comment exactly what is missing.

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
`{body}`, `{tmpfile}`, and `{triagedLabel}` are substituted by the skill.

- Set type: `gh issue edit {id} --remove-label "type:bug,type:crash,type:regression" --add-label "type:{type}"`
- Set priority: `gh issue edit {id} --remove-label "priority/P0,priority/P1,priority/P2,priority/P3" --add-label "priority/{p}"`
- Add area: `gh issue edit {id} --add-label "area:{a}"`
- Remove area: `gh issue edit {id} --remove-label "area:{a}"`
- Edit body (language fix / fill missing info): `gh issue edit {id} --body-file {tmpfile}`
- Comment: `gh issue comment {id} --body "{text}"`
- Mark duplicate: `gh issue edit {id} --add-label duplicate` then `gh issue comment {id} --body "Duplicate of #{canonical}"`
- Close duplicate (only with approval): `gh issue close {id} --reason "not planned" --comment "Duplicate of #{canonical}"`
- Create split issue: `gh issue create --title "{title}" --body "{body}" --label "type:{type},area:{a}"`
- Link dependency: `gh issue comment {id} --body "Blocked by #{other}"`
- Stamp triaged: `gh issue edit {id} --add-label {triagedLabel}`
````

- [ ] **Step 3: Verify presence + required headings (green)**

Run:
```bash
test -f skills/triage-bugs/bug-triage.template.md \
  && for h in "## Types" "## Priorities" "## Labels" "## Required fields" "## Splitting" "## Duplicates" "## Dependencies" "## Mutation recipes"; do \
       grep -qF "$h" skills/triage-bugs/bug-triage.template.md || { echo "MISSING: $h"; exit 1; }; \
     done \
  && echo "OK"
```
Expected: `OK`

- [ ] **Step 4: Confirm the template is NOT a discovered plugin component**

Run: `claude plugin validate .`
Expected: passes. (A `.template.md` file alongside `SKILL.md` is supporting content, not a second skill — the loader only treats `SKILL.md` as the skill. This step confirms the template doesn't break validation.)

- [ ] **Step 5: Commit**

```bash
git add skills/triage-bugs/bug-triage.template.md
git commit -m "$(cat <<'EOF'
triage-bugs: add bug-triage conventions template

Filled-in GitHub/gh example with the eight fixed sections (Types, Priorities,
Labels, Required fields, Splitting, Duplicates, Dependencies, Mutation recipes)
the skill and analyst locate by heading. Scaffolded into a project's
docs/bug-triage.md when absent.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: The orchestrator skill

**Files:**
- Create: `skills/triage-bugs/SKILL.md`

- [ ] **Step 1: Verify the component does not exist yet (red)**

Run:
```bash
test -f skills/triage-bugs/SKILL.md && echo "EXISTS" || echo "ABSENT"
```
Expected: `ABSENT`

- [ ] **Step 2: Create `skills/triage-bugs/SKILL.md` with this exact content**

````markdown
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
````

- [ ] **Step 3: Verify presence + structure (green)**

Run:
```bash
test -f skills/triage-bugs/SKILL.md \
  && grep -q "^name: triage-bugs$" skills/triage-bugs/SKILL.md \
  && grep -q "genvid-dev:bug-triage-analyst" skills/triage-bugs/SKILL.md \
  && grep -qF '"bugTracker"' skills/triage-bugs/SKILL.md \
  && echo "OK"
```
Expected: `OK`

- [ ] **Step 4: Schema-validate the plugin**

Run: `claude plugin validate .`
Expected: passes. The new skill is discovered; `metadata.expects` is accepted under `metadata`.

- [ ] **Step 5: Confirm no new *required* repo-wide expectation was introduced**

Run: `node skills/audit-conventions/scripts/audit.mjs`
Expected: exit 0 / no new required failures. Every `triage-bugs` expectation is `required: false`, so the audit of this repo (which has no `bugTracker` block or `docs/bug-triage.md`) must still pass. If it reports a *required* miss for `bugTracker.*` or `docs/bug-triage.md`, a `required: false` was dropped — fix the frontmatter in Task 1 or Task 3.

- [ ] **Step 6: Commit**

```bash
git add skills/triage-bugs/SKILL.md
git commit -m "$(cat <<'EOF'
triage-bugs: add orchestrator skill

Main-thread orchestrator for interactive bug triage: reads project conventions,
dispatches the read-only bug-triage-analyst, then drives a two-phase approval
(cross-cutting findings as a set, then a per-bug enrichment walk) and performs
all writes. Idempotent triaged-label stamping; destructive-action guards;
tracker-agnostic via the bugTracker block + docs/bug-triage.md.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Wire into the doc index and changelog

**Files:**
- Modify: `docs/TOC.md` (Components section)
- Modify: `CHANGELOG.md` (`[Unreleased]` section)

- [ ] **Step 1: Verify the wiring is absent (red)**

Run:
```bash
grep -q "triage-bugs" docs/TOC.md && echo "TOC-HAS-IT" || echo "TOC-ABSENT"; \
grep -q "triage-bugs" CHANGELOG.md && echo "CHANGELOG-HAS-IT" || echo "CHANGELOG-ABSENT"
```
Expected: `TOC-ABSENT` then `CHANGELOG-ABSENT`

- [ ] **Step 2: Add the skill pointer to `docs/TOC.md`**

In `docs/TOC.md`, the `## Components` section lists agents on one line. Update the
agents inventory line to include the new agent, and add a skill pointer. Replace:

```markdown
- `../agents/*.md` — flat agent definitions (analyst, designer, planner, code-reviewer, ts-implementer, tech-writer, validator)
```

with:

```markdown
- `../agents/*.md` — flat agent definitions (analyst, designer, planner, code-reviewer, ts-implementer, tech-writer, validator, bug-triage-analyst)
- `../skills/triage-bugs/SKILL.md` — interactive bug-backlog triage; reads project conventions from a consuming repo's `docs/bug-triage.md` + `bugTracker` block (see `skills/triage-bugs/bug-triage.template.md` for the template)
```

- [ ] **Step 3: Add the changelog entry**

In `CHANGELOG.md`, replace the empty Unreleased section:

```markdown
## [Unreleased]

## [2.7.0] - 2026-06-04
```

with:

```markdown
## [Unreleased]

### Added

- `triage-bugs`: new skill for interactive, tracker-agnostic bug-backlog triage.
  A main-thread orchestrator dispatches a read-only `bug-triage-analyst` agent to
  fetch the untriaged bugs (plus a wider comparison set for dedup) and propose
  duplicate clusters, overlaps, dependencies, split candidates, and per-bug
  field/label/priority/language fixes; the orchestrator then drives a two-phase
  approval and applies the writes, stamping a `triaged` label last for
  idempotent re-runs. Project specifics come from a new `bugTracker` block in
  `.genvid-agent.json` and a `docs/bug-triage.md` conventions doc (both
  skill-conditional / `required: false`; a template ships with the skill).

## [2.7.0] - 2026-06-04
```

- [ ] **Step 4: Verify the wiring is present (green)**

Run:
```bash
grep -q "triage-bugs" docs/TOC.md \
  && grep -q "bug-triage-analyst" docs/TOC.md \
  && grep -q "triage-bugs" CHANGELOG.md \
  && grep -q "### Added" CHANGELOG.md \
  && echo "OK"
```
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add docs/TOC.md CHANGELOG.md
git commit -m "$(cat <<'EOF'
triage-bugs: index the skill and log the changelog entry

Add the skill + bug-triage-analyst agent to docs/TOC.md Components, and record
the feature under CHANGELOG [Unreleased].

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Whole-plugin verification

**Files:** none (verification only)

- [ ] **Step 1: Schema-validate the whole plugin**

Run: `claude plugin validate .`
Expected: passes with the two new components present and no errors.

- [ ] **Step 2: Run the audit-conventions unit tests (guard against regressions)**

Run: `node --test skills/audit-conventions/scripts/test/*.test.mjs`
Expected: all tests pass. (We added no audit logic, but this confirms the new frontmatter didn't trip an aggregate-expectations test.)

- [ ] **Step 3: Confirm this repo still audits clean**

Run: `node skills/audit-conventions/scripts/audit.mjs`
Expected: exit 0. The plugin repo has no `bugTracker` block or `docs/bug-triage.md`; because every new expectation is `required: false`, the audit must still pass — proving the skill is opt-in and didn't widen the core contract.

- [ ] **Step 4: Inventory check (if a local plugin install is available)**

Run: `claude plugin details genvid-dev` (after `claude plugin update genvid-dev@genvid-plugins` if testing against the marketplace install)
Expected: the inventory lists the `triage-bugs` skill and the `bug-triage-analyst` agent. If no local install is wired up, skip — Step 1 already confirms discoverability.

- [ ] **Step 5: Final review against the spec**

Re-read `docs/superpowers/specs/2026-06-04-triage-bugs-skill-design.md` and confirm each goal maps to delivered content: fetch untriaged bugs (analyst Step 2), dedup/overlap (report sections), split candidates (report + Phase 2), missing info/language (per-bug enrichment + recipes), type/label/priority updates (recipes + Phase 2), dependencies (recipes + report), `triaged` label (Phase 2, applied last), skill/convention split (bugTracker block + docs/bug-triage.md), exploration-off-thread (analyst dispatch). No commit needed — this is a sign-off.

---

## Self-Review

**Spec coverage:**
- Fetch untriaged bugs → Task 1 analyst (`actionQuery` minus `triagedLabel`). ✓
- Duplicates / overlaps → analyst report + comparison set (Task 1). ✓
- Split into sub-issues / multiple issues → template Splitting + skill Phase 2 (Tasks 2, 3). ✓
- Missing info / improve language → per-bug enrichment + `needs-info` + body-edit recipe (Tasks 1–3). ✓
- Update type/labels/priorities/fields → Labels/Priorities/Types + Mutation recipes + Phase 2 (Tasks 2, 3). ✓
- Dependencies → Dependencies section + link recipe + report (Tasks 1–2). ✓
- `triaged` label, applied last, idempotent → skill Phase 2 (Task 3). ✓
- Skill vs. conventions split → `bugTracker` block (config) + `docs/bug-triage.md` (prose), both `required: false` (Tasks 1–3). ✓
- Interactive-by-default, `--non-interactive` / `--force` → skill §0/§4 (Task 3). ✓
- Exploration off the main thread → analyst agent dispatch (Tasks 1, 3). ✓
- Plugin integration / no widened contract → audit checks (Tasks 3, 5). ✓

**Placeholder scan:** no TBD/TODO; every file's full content is inlined; commands have expected output. ✓

**Type/name consistency:** `bugTracker` keys (`kind`, `actionQuery`, `comparisonQuery`, `readOne`, `triagedLabel`, `needsInfoLabel`) are identical across the analyst, the skill, and the template. Agent name `bug-triage-analyst` and dispatch `genvid-dev:bug-triage-analyst` match. Skill name `triage-bugs`. The eight `docs/bug-triage.md` headings are identical in the template and in the skill/analyst references. ✓
