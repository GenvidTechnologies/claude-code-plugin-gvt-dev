---
name: triage-issues
description: Triages a project's issue backlog interactively — deduplicates, enriches, links dependencies, splits overstuffed issues, and stamps a 'triaged' label. Works for bugs, tickets, or any tracker item. Tracker-agnostic; project specifics come from docs/issue-triage.md and the bugTracker block in .gvt-agent.json. Use when triaging or grooming an issue backlog, or cleaning up duplicates and priorities.
metadata:
  expects:
    files:
      - path: docs/issue-triage.md
        required: false
        reason: Project triage conventions (taxonomy, priority meanings, split/duplicate policy) and mutation recipes; §0 adopts a near-miss-named contract when one exists, or offers to scaffold one from the bundled template otherwise
      - path: docs/TOC.md
        required: false
        reason: §0c adds a one-line index entry for the resolved docs/issue-triage.md contract — scaffolded, adopted from a near-miss, or already canonical — when docs/TOC.md is present
    config:
      - key: bugTracker.actionQuery
        in: .gvt-agent.json
        required: false
        reason: Command template the analyst runs to fetch the issues to triage
      - key: bugTracker.comparisonQuery
        in: .gvt-agent.json
        required: false
        reason: Wider read-only query used to detect duplicates against already-triaged or closed issues
      - key: bugTracker.triagedLabel
        in: .gvt-agent.json
        required: false
        reason: The label the skill stamps when an issue's triage is complete (and excludes from the default action set for idempotent re-runs)
      - key: bugTracker.needsInfoLabel
        in: .gvt-agent.json
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
block in `.gvt-agent.json` (access mechanics).

## How the work splits

- **Exploration → subagent.** All fetching and cross-issue analysis runs in the
  `gvt-dev:issue-triage-analyst` agent, off this thread, so this conversation
  stays focused on prioritization and adjustment.
- **Decisions → here.** This thread reviews the report, takes your adjustments,
  and performs every write. The analyst never writes.

## 0. Preconditions & scope

1. **Resolve the conventions contract.** Locate `docs/issue-triage.md`, and
   independently check for a **near-miss** — a hand-authored triage doc that
   exists under a different name. This guards against a real failure mode
   (issue #178): a repo can carry a doc written before the `triage-bugs` →
   `triage-issues` rename, or under a typo'd name, and under exact-filename
   resolution it reads as "absent" while the real, hand-authored contract sits
   dead and unread.

   **Scan the top level of `docs/` only — explicitly non-recursive.** This
   repo is the proof case: a recursive scan would also match
   `docs/superpowers/plans/` and `docs/superpowers/specs/`, frozen and
   accurate historical design records from before the rename — files that must
   never be touched or flagged as a live near-miss.

   Either of these two independent signals qualifies a `docs/*.md` file as a
   near-miss:
   - **Filename glob:** `docs/*[Tt]riage*.md`.
   - **Marker line:** the file contains the line the bundled templates emit
     (`Project conventions consumed by …triage-issues`), matched tolerantly of
     the pre-rename name this doc was renamed from and of any plugin
     namespace prefix — a rename is the likeliest origin of a near-miss, and
     that is the entire population this detection addresses.

   Combine detection with canonical-file presence into four outcomes,
   resolved **before any routing to §0b**:
   - **Canonical, no near-miss** (`docs/issue-triage.md` present) → proceed to
     step 2.
   - **Near-miss, no canonical** → route to §0b's "Near-miss found" branch.
   - **Absent** (neither present) → route to §0b's "No contract at all"
     branch.
   - **Both present** — a dead duplicate, possibly contradicting the live
     contract → proceed to step 2 as normal, **and** report the duplicate
     (its path) alongside that review, offering removal or a merge into the
     canonical file. Interactively, offer it there; in `--non-interactive`,
     defer the offer, leave both files untouched, and carry it into the §5
     closing summary as an outstanding item.
2. **Read the `bugTracker` block** from `.gvt-agent.json` (full workflow only —
   the §0a groom skips this). If it is **absent**, this is not a hard stop: the
   **§0a light-touch groom** already operates directly via the tracker's native CLI
   (e.g. `gh`) with no `bugTracker` block, so offer that path for a quick groom.
   For the full analyst-driven workflow, offer to add a `bugTracker` block (show the
   example block at the bottom of this skill); proceed with §1 onward only once it
   exists.
3. **Reconcile the resolved contract** (→ §0c) — label keys, required
   headings, TOC index. Runs for **any resolved contract** — freshly
   scaffolded, adopted via rename, or **already-canonical** — and is
   **skipped on the §0a light-touch path**.
4. **Resolve scope:**
   - Default: `actionQuery` minus `triagedLabel` (open issues not yet triaged).
   - Override: an explicit query/label, or a list of issue IDs passed as args.
5. **Confirm mode:** interactive by default. `--non-interactive` (alias `--auto`)
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
taxonomy, stop and offer to scaffold `docs/issue-triage.md` (→ §0b)
rather than grooming on.

### 0b. Establish the contract

**Near-miss found.** Step 1 detected a `docs/*.md` file that looks like the
triage contract under a different name, with no `docs/issue-triage.md`
present. Report, for every candidate:
- its path,
- its first line,
- its heading list (`##`/`###` lines), and
- whether it carries the marker line — a marker-bearing candidate is far more
  likely to be the dead-orphan case than a coincidental filename match.

**Rank marker-bearing candidates first.** If more than one near-miss exists,
present all of them — never auto-pick one.

Offer three options via `AskUserQuestion`:
- **Rename it to `docs/issue-triage.md`** — the **default**. `git mv` the file
  when it is tracked, a plain filesystem move otherwise; this preserves every
  hand-authored word. Then fall through to step 3 as if the contract had
  always lived at the canonical path.
- **Replace it with a fresh scaffold** — destructive. Enumerate exactly what
  gets discarded (the file's path, size, and heading list) and, per
  `development-principles.md` principle #6, **preview the plan in one turn and
  apply it in the next**, only after the user has seen it, before writing
  anything.
- **Keep both** — the skill still reads only `docs/issue-triage.md`, so state
  plainly that choosing to keep both files leaves the near-miss dead and
  unread, and carry it into the §5 closing summary as an outstanding item.

Do not carry over the scaffold branch's variant-matching nudge into this
branch — an adopted, hand-authored doc has no chosen variant to match. §0c's
evidence-based label-keys check, and its required-headings check, run instead
once the rename lands.

In `--non-interactive`, **defer**: report the near-miss and the three options
above, write nothing — no rename, no scaffold — and stop the run, recording
the deferral as an outstanding item. This deliberately departs from issue
#178's own acceptance criterion, which asked for unattended auto-rename:
renaming a hand-authored consumer file unattended is a write the §4 safety
table had no row for, and deferring still prevents the double-scaffold
outcome without an unattended mutation of the user's file. With `--force`,
take the documented default (rename), then §0c's required-headings check runs
report-only and its TOC-index sub-block runs automatically.

**No contract at all.** If `docs/issue-triage.md` is absent, offer to scaffold it — do
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

Once scaffolded, §0c's TOC-index sub-block indexes the new
`docs/issue-triage.md` in `docs/TOC.md`.

**If the user declines scaffolding, or a quick scan of the open backlog shows no
bugs** (a tiny enhancement/chore backlog where the full taxonomy is overkill),
offer a **light-touch groom** instead (→ §0a, which skips the rest of §0).
Otherwise proceed with the full workflow only once the contract exists.

### 0c. Reconcile the resolved contract

Runs for **any resolved contract** — freshly scaffolded, adopted via rename,
or already-canonical — and is **skipped on the §0a light-touch path**.

**Label keys.** Check `bugTracker.triagedLabel` and `bugTracker.needsInfoLabel`
against the repo's actual label set.

- **Reuse the label set §0b already probed when one is available** (the
  scaffold branch's `gh label list --json name -L 200`, or the tracker
  equivalent); **fetch it on demand here otherwise** — the already-canonical
  path never enters §0b, so nothing has probed yet. Either shape is fine; the
  point is never probing twice when the set is already in hand.
- A key naming a label that does not exist → **warn at load time**, print the
  exact fix commands (create the label, or repoint the config key), and
  **continue**. Never a stop. **No automatic write in either mode.**
- If the probe failed (CLI absent, unauthenticated), **or the list came back
  at exactly the `-L 200` cap and may be truncated**, report **inconclusive**
  rather than warning — a truncated list would produce false "label missing"
  reports.
- If `bugTracker` is absent there is nothing to check; say so and move on.

Why this matters: the origin repo's contract declared a `needs-info` label
that did not exist there. Nothing surfaced it, and the flag-missing-info
recipe would have failed — or created a spurious label — only later, when
that specific recipe fired. This turns a latent mid-run failure into a
load-time warning.

This is an evidence-based check, and it **replaces** the scaffold branch's
blind variant-matching nudge (the one telling the user which label keys the
just-copied template expects) on the adopted and already-canonical paths.
**Leave that nudge where it is in the scaffold branch** — it is still correct
there, where a variant was just chosen — and do not duplicate it here.

**Required headings.** Check the resolved contract for the eight headings the
skill and analyst locate guidance by: `## Types`, `## Priorities`,
`## Labels`, `## Required fields`, `## Splitting`, `## Duplicates`,
`## Dependencies`, `## Mutation recipes`.

- Report any missing ones. A pre-rename doc may predate sections the skill
  now reads.
- **Interactively, offer to append stubs.** **Never rewrite an existing
  section.** Word each stub so an empty section cannot be misread as a
  deliberate policy of "none" — e.g. "not yet specified — see the bundled
  template".
- **Unattended (`--non-interactive`, including `--force`): report only.**

**`docs/TOC.md` index.** Runs for the scaffolded, adopted, and
already-canonical paths alike — not just a fresh scaffold. The origin repo's
contract was also unindexed, which is why nothing else surfaced it: an
unindexed contract doc is invisible to the planning/triage skills that
discover docs through the index.

Once the contract is resolved (copied from a template, renamed from a
near-miss, or already sitting at the canonical path), add a one-line entry
for `docs/issue-triage.md` to `docs/TOC.md` under a **Process** heading
(create the heading if absent) — mirroring how `plan-task` indexes a
scaffolded `docs/decisions/` record. Interactively, **offer** it; in
`--non-interactive`, add it **automatically**. Make it idempotent (skip if
the entry already exists) and skip gracefully if `docs/TOC.md` is absent.

**Do not write on the "keep both" outcome** from §0b — there the indexed
path is not the contract.

## 1. Dispatch exploration (Phase 1)

Dispatch the `gvt-dev:issue-triage-analyst` agent with: the resolved scope, the
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

**A blocked create is not a plain failure — recover it.** When a split/sub-issue
`gh issue create` is blocked by the auto-mode write-classifier (a `Bash(gh issue
*)` allow-rule does not override that gate) or a permission prompt the user isn't
present for — distinct from a genuine tracker/API error — don't drop the split:
surface the fully drafted issue body so the user can file it (`! gh issue create
…`) and record it as an outstanding action. The drafted split body is required
regardless; only the create is best-effort (see
`development-principles.md` principle #9).

## 4. Safety

| Action | Interactive (default) | `--non-interactive` |
|---|---|---|
| Contract-file resolution (rename a near-miss to `docs/issue-triage.md`, replace it, remove a stale duplicate) | preview, then per-option approval | **deferred** unless `--force` (which renames) |
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

Also report, when §0 produced them: how the contract was resolved (scaffolded /
adopted, and from which near-miss path / already canonical); any deferred
near-miss resolution (§0b's `--non-interactive` defer, so a stopped run leaves a
record of why); §0c's label-key warning or inconclusive result; any missing
required headings; whether the `docs/TOC.md` index entry was added or skipped;
and any dead duplicate carried forward from the both-present outcome or a "keep
both" choice.

## Example `bugTracker` block

Add this to `.gvt-agent.json` (GitHub / `gh` example — adjust queries, labels,
and the CLI for your tracker):

```json
"bugTracker": {
  "kind": "github",
  "actionQuery": "gh issue list --state open -L 200 --json number,title,labels,body,assignees,author,createdAt",
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
