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
        reason: "Docs-regime registration: §0c adds a one-line Process entry for a contract outside the wiki; resolved through paths['docs/TOC.md']"
    config:
      - key: wiki.wikiDir
        in: .gvt-agent.json
        required: false
        reason: The wiki bundle root, used for registration and the scaffold default
      - key: wiki.indexCommand
        in: .gvt-agent.json
        required: false
        reason: Optional command that regenerates generated wiki indexes; when set, §0c never hand-edits a wiki index
      - key: bugTracker.actionQuery
        in: .gvt-agent.json
        required: false
        reason: Command template the analyst runs to fetch the issues to triage
      - key: bugTracker.comparisonQuery
        in: .gvt-agent.json
        required: false
        reason: Wider read-only query used to detect duplicates against already-triaged or closed issues
      - key: bugTracker.readOne
        in: .gvt-agent.json
        required: false
        reason: The read-one command §3 uses to read an issue's labels back before stamping; the tracker's native issue view is the fallback
      - key: bugTracker.commentsQuery
        in: .gvt-agent.json
        required: false
        reason: Bulk comments fetch the analyst feeds to the `[refs]` cross-reference check; absent, the check reports comments as no data
      - key: bugTracker.structureQuery
        in: .gvt-agent.json
        required: false
        reason: Bulk parent and sub-issue summary fetch the analyst feeds to the `[refs]` cross-reference check; absent, the check reports native structure as no data
      - key: bugTracker.refStateQuery
        in: .gvt-agent.json
        required: false
        reason: Per-reference state lookup ({repo}, {id}) that resolves the state of each issue a `[refs]` finding names
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

1. **Resolve the conventions contract.** Resolve the contract path first:
   `paths['docs/issue-triage.md']` from `.gvt-agent.json` when set, else
   `docs/issue-triage.md` — the runtime path resolution `CONVENTIONS.md`
   describes (the same override `/gvt-dev:audit-conventions` itself uses).
   Every later mention of the contract in this skill means this resolved
   path. Locate it, and independently check for a **near-miss** — a
   hand-authored triage doc that exists under a different name. This guards
   against a real failure mode (issue #178): a repo can carry a doc written
   before the `triage-bugs` → `triage-issues` rename, or under a typo'd name,
   and under exact-filename resolution it reads as "absent" while the real,
   hand-authored contract sits dead and unread.

   **Scan the top level of the resolved contract's parent directory, and the
   top level of `docs/` — both explicitly non-recursive.** (With no override,
   the resolved path's parent *is* `docs/`, and this is one scan.) This repo
   is the proof case for the non-recursive constraint: a recursive scan would
   also match `docs/superpowers/plans/` and `docs/superpowers/specs/`, frozen
   and accurate historical design records from before the rename — files that
   must never be touched or flagged as a live near-miss. Scanning `docs/` in
   addition to the resolved parent catches a stale pre-migration copy of
   `docs/issue-triage.md` left behind there after the contract moves
   elsewhere (e.g. into a wiki bundle). When the wiki default of §0b holds (no
   `paths['docs/issue-triage.md']` override, and the resolved
   `paths['docs/TOC.md']` inside `wiki.wikiDir`), the scan also covers the top
   level of `<wikiDir>/`, and of `<wikiDir>/process/` when it exists — still
   non-recursive — so a contract at the wiki root is seen whichever
   subdirectory the scaffold would pick.

   Either positive signal nominates a candidate. A veto outranks both signals.
   A rename is the likeliest origin of a near-miss, and that is the entire
   population this detection addresses.
   - **Filename glob:** `*[Tt]riage*.md`.
   - **Marker line:** a line that, after an optional `>`, begins with
     `Project conventions consumed by` followed, after optional whitespace, by a reference to
     `triage-issues` or the pre-rename `triage-bugs` (any namespace, optional
     leading `/`, optional backticks). The skill name is load-bearing: a
     prefix-only match is a false positive. maintain-wiki's
     `wiki-schema.template.md` emits the same prefix naming itself, and a
     file naming a different skill is never a match.

   Vetoes (any one removes a candidate):
   - **Index files.** An index file is never a near-miss candidate:
     `index.md`, `TOC.md`, `log.md`, and whatever `paths['docs/TOC.md']`
     resolves to.
   - **Derived pages.** A file whose frontmatter `sources` cites the resolved
     contract (an entry, or its `resource`, equal to the resolved path or ending in `/` followed by the resolved path)
     declares itself derived and is never a candidate. The suffix match is
     deliberate, and sits on a path-segment boundary (`…/mydocs/issue-triage.md` is not `docs/issue-triage.md`): a `resource` value can be a URL such as
     `https://…/blob/main/wiki/process/issue-triage.md`. When the wiki default
     holds (§0b), also compare against the wiki default path or paths
     (`<wikiDir>/process/issue-triage.md`, `<wikiDir>/issue-triage.md`): with no
     override the resolved path is `docs/issue-triage.md`, so a wiki derived page
     citing the wiki default would otherwise escape the veto.

   Combine detection with canonical-file presence into four outcomes,
   resolved **before any routing to §0b**:
   - **Canonical, no near-miss** (the resolved path present) → proceed to
     step 2.
   - **Near-miss, no canonical** → route to §0b's "Near-miss found" branch.
   - **Absent** (neither present) → route to §0b's "No contract at all"
     branch.
   - **Both present** — a dead duplicate, possibly contradicting the live
     contract → proceed to step 2 as normal (the canonical file *is* the
     contract; nothing routes to §0b). Then, **during §0c**, report the
     duplicate by path and offer either removing it or merging its content
     into the canonical file. Interactively, offer that choice per-option; in
     `--non-interactive` and `--force` alike, defer it, leave both files
     untouched, and carry it into the §5 closing summary as an outstanding
     item.
2. **Read the `bugTracker` block** from `.gvt-agent.json` (full workflow only —
   the §0a groom skips this). If it is **absent**, this is not a hard stop: the
   **§0a light-touch groom** already operates directly via the tracker's native CLI
   (e.g. `gh`) with no `bugTracker` block, so offer that path for a quick groom.
   For the full analyst-driven workflow, offer to add a `bugTracker` block (show the
   example block at the bottom of this skill); proceed with §1 onward only once it
   exists.
3. **Reconcile the resolved contract** (→ §0c) — label keys, set recipes, required
   headings, registration. Runs for **any resolved contract** — freshly
   scaffolded, adopted via rename, or **already-canonical** — and is
   **skipped on the §0a light-touch path**.
4. **Resolve scope:**
   - Default: `actionQuery` minus `triagedLabel` (open issues not yet triaged).
   - Override: an explicit query/label, or a list of issue IDs passed as args.
   - Carried-in close proposal: when invoked scoped to one issue with a
     **carried-in close proposal** `{issue, reason, evidence}` (offered by
     `plan-next-issue` for a done-but-unclosed issue, or a deferred issue whose
     measurement met its close rule), the scope is that one issue. The proposal
     is presented for per-item approval and applied through the contract's
     "Close as completed or not planned (only with approval)" recipe. The
     proposal's `reason` and `evidence` are posted through the Comment recipe,
     and `{closeReason}` is the recipe's enumerated value chosen per §3:
     `completed` for a done-but-unclosed issue or a measured-zero deferral,
     unless the user picks `not planned`. It is never applied unattended unless
     `--force`.
5. **Confirm mode:** interactive by default. `--non-interactive` (alias `--auto`)
   runs unattended; `--force` additionally permits destructive actions unattended, but still never
   removes a stale duplicate, never auto-picks between near-miss candidates,
   never moves a file into or inside the wiki, and never moves or copies a file
   onto an existing one (the occupied-destination rule, §0b; §4). Creating a new
   file, appending an index entry (§0c) and inserting a config key are not
   moves and stay automatic as §4 states.

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
- **Verify** the applied labels: read the labels back before reporting an issue done.
- **Summarize** what changed.

When the groom reveals a backlog large or bug-heavy enough to warrant the full
taxonomy, stop and offer to scaffold the contract at its scaffold target
(→ §0b) rather than grooming on.

### 0b. Establish the contract

**Near-miss found.** Step 1 detected a file (under the resolved contract's
parent directory, or under `docs/`, or — when the wiki default holds — at the
top level of `<wikiDir>/` or `<wikiDir>/process/`) that looks like the triage contract under
a different name, with no canonical file at the resolved path present.
Report, for every candidate:
- its path,
- its first line,
- its heading list (`##`/`###` lines), and
- whether it carries the marker line — a marker-bearing candidate is far more
  likely to be the dead-orphan case than a coincidental filename match.

**Rank marker-bearing candidates first.** If more than one near-miss exists,
present all of them — never auto-pick one.

Offer three options via `AskUserQuestion`:
- **Rename it to the contract path** — the **default**. `git mv` the file
  when it is tracked, a plain filesystem move otherwise; this preserves every
  hand-authored word. Then fall through to step 3 as if the contract had
  always lived at the resolved path. When the wiki default holds (the
  trigger under "No contract at all" below), the rename target is the wiki
  default the scaffold uses: `<wikiDir>/process/issue-triage.md` when
  `<wikiDir>/process/` exists, else `<wikiDir>/issue-triage.md`, so a
  wiki-resident candidate is never moved out of the bundle. Show that
  destination in the offer.
  - **Occupied destination.** No file is ever moved or copied onto an existing
    file unattended, whether it is this rename's move or the scaffold's copy
    below. A destination counts as occupied when anything other than the
    candidate itself exists at that path (a file the derived-page veto
    excluded can sit there). Interactively it is a conflict: never write onto
    it. Report both files, and offer to keep both, to merge (preview, then
    apply, per `development-principles.md` principle #6), or to pick a
    different destination. Under `--force` and `--non-interactive` it defers:
    write nothing, and report the occupied path in §5 as outstanding (with the
    candidate's path too, for a rename).
  - **Write order.** The rename moves the file first and then, when the wiki
    default holds, writes the `paths` override. A stop in between leaves the file at the wiki default
    with no override; the next run's wiki-default scan finds it at its own
    target, where only the override is written, so it heals. (The scaffold
    branch below writes the override first instead, and heals because the
    scaffold re-offers on Absent.)
  - If the candidate already sits at that target path, there is nothing to
    move: write only the override. §0c then registers it under the wiki
    regime.
- **Replace it with a fresh scaffold** — destructive. Enumerate exactly what
  gets discarded (the file's path, size, and heading list) and, per
  `development-principles.md` principle #6, **preview the plan in one turn and
  apply it in the next**, only after the user has seen it, before writing
  anything.
- **Keep both** — the skill still reads only the resolved path, so state
  plainly that choosing to keep both files leaves the near-miss dead and
  unread, and carry it into the §5 closing summary as an outstanding item.

On the **rename** option specifically, do not carry over the scaffold
branch's variant-matching nudge — an adopted, hand-authored doc has no chosen
variant to match. §0c's evidence-based label-keys check, and its
required-headings check, run instead once the contract is adopted. (**Replace**
produces a fresh scaffold, so the nudge still applies there; **keep both**
leaves no resolved contract, so §0c does not run at all.)

In `--non-interactive`, **defer**: report the near-miss and the three options
above, write nothing — no rename, no scaffold — and stop the run, recording
the deferral as an outstanding item. This deliberately departs from issue
#178's own acceptance criterion, which asked for unattended auto-rename:
renaming a hand-authored consumer file unattended is a write the §4 safety
table had no row for, and deferring still prevents the double-scaffold
outcome without an unattended mutation of the user's file. **Inside the wiki,
nothing moves unattended:** a candidate whose source lies inside `<wikiDir>/`,
or whose rename destination does (the wiki default or an override path), defers
under `--force` and under `--non-interactive` alike. Report it in §5 as
outstanding, with the destination an interactive run would offer. The
`--force` rename (the documented default) applies only when the source and
the destination are both outside the wiki, exactly one marker-bearing
candidate exists, and the destination is not occupied (the occupied-destination
rule above); then
§0c's required-headings check runs report-only and its registration sub-block
runs automatically. In the mixed case, one marker-bearing candidate plus
glob-only candidates, rename the marker-bearing one; the glob-only candidates
stay deferred. A glob-only candidate (matched by filename alone) is carried into §5 as outstanding, and so are all
candidates when two or more are marker-bearing (never auto-pick).

**No contract at all.** If the resolved path is absent, offer to scaffold it
there — do not guess conventions. **Wiki default (trigger):** when there is no
`paths['docs/issue-triage.md']` override AND the resolved `paths['docs/TOC.md']`
(T) lies inside `wiki.wikiDir` (W, default `wiki`), the default target is
`<wikiDir>/process/issue-triage.md` when `<wikiDir>/process/` exists, else
`<wikiDir>/issue-triage.md`. Otherwise keep the resolved-path default. This
check covers the scaffold only: no contract exists at either location when the
default is chosen. (A rename checks its resolved destination, and an occupied
one is a conflict; see above.) The scaffold target is checked against the
occupied-destination rule (above) before anything is written, so a deferred or
declined scaffold leaves `.gvt-agent.json` untouched. On
acceptance the skill writes the override before the file: it inserts
`paths['docs/issue-triage.md']` into `.gvt-agent.json` as a key insertion that
preserves every other key, then copies the template. If a run stops between
the two writes, the next run resolves the override, finds it Absent and
re-offers the scaffold, so it heals itself; the reverse order would leave an
unread file. When the trigger holds, step 1's near-miss scan also covers the
top level of the would-be target's parent and the wiki root, so a
`wiki/bug-triage.md` is not missed and double-scaffolded. This does not conflict with ADR-0062's rejected
implicit wiki convention: only the default is inferred, and resolution stays
the declared override. Two bundled templates exist; pick the one
that matches the repo's label scheme:
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

**Wiki-bundle target.** When the resolved path lies inside `wiki.wikiDir`
(read from `.gvt-agent.json`, default `wiki`), the scaffolded file opens with
a minimal OKF frontmatter block — `---`, `type: convention`, a `title`, a
`description`, `---` — before the template body: the wiki schema (`wiki/schema.md`,
OKF §4.1/§11.2) requires a non-empty `type` on every page,
and the `title` and `description` give the index entry text to quote.

Once scaffolded, §0c's "Registration follows the contract's location"
sub-block registers the new contract in the index its location calls for.

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

**Set recipes.** Check each set recipe in the resolved contract (set category,
set type, set priority). Warn when one
names the label it adds in its own remove list: the add and the remove then
cancel on that label, and the tracker can still exit 0. A legacy recipe adds a
placeholder (`type:{type}`, a bare `{type}` in the flat template, or
`priority/{p}`), so the label is not known at load: substitute each
label of the recipe's own set (from the contract's taxonomy) for the
placeholder, and warn if any substitution lands in that recipe's remove list. Print the fix: rewrite
the recipe in the others-only form the bundled templates use, where
`--remove-label` lists only the other labels of that kind and is omitted when
there are none. **No automatic write in either mode**; §3 strips the
overlapping label for the call in the meantime.

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

**Registration follows the contract's location.** Runs for the scaffolded,
adopted, and already-canonical paths alike — not just a fresh scaffold. The
origin repo's contract was also unindexed, which is why nothing else surfaced
it: an unindexed contract doc is invisible to the planning/triage skills that
discover docs through the index. Resolve T = `paths['docs/TOC.md']` (default
`docs/TOC.md`) and W = `wiki.wikiDir` (default `wiki`); which index the
contract belongs in depends on whether the resolved contract lies inside W.

- **Contract outside W, T inside W.** Do not write: an out-of-bundle link in a
  wiki index is a wiki-lint finding. Report that the contract sits outside the
  wiki bundle and that its index lives in the wiki, and suggest moving the
  contract into the bundle via the `paths['docs/issue-triage.md']` override.
- **Docs regime** (contract outside W, T outside W). Add a one-line entry for the resolved
  path to T under a **Process** heading (create the heading if absent) —
  mirroring how `plan-task` indexes a scaffolded `docs/decisions/` record.
  Interactively, **offer** it; in `--non-interactive`, add it
  **automatically**. Make it idempotent (skip if the entry already exists) and
  skip gracefully if T is absent.
- **Wiki regime** (contract inside W, wherever T lies). The contract is
  registered in the wiki, and `docs/TOC.md` is never written.
  - **After a wiki-default rename (§0b), first,** if any wiki index that linked
    the candidate's old path (the root index and any subdirectory index alike)
    still links it, update each such link to the new path; when
    `wiki.indexCommand` is set, report each stale link instead of editing.
    Never leave a dead link silently. §5 reports each link updated or
    reported. Do this before the indexed check below, so the updated link
    counts and no second entry is written.
  - The contract counts as **indexed** when a link in `<W>/index.md`, or in the
    `index.md` of its own subdirectory, resolves to it — the same rule
    maintain-wiki's lint applies.
  - If it is listed only in a subdirectory index that `<W>/index.md` does not
    link, report an **unreachable subtree** and do not fix it.
  - If it is not indexed, the write target is the `index.md` in its own
    directory when one exists, else `<W>/index.md`. Write one line under the
    target index's `## Pages`-style list heading (the index's first `##`
    heading that is followed by a link list) when it has one,
    else under a `## Process` heading (created if absent), quoting the
    contract's frontmatter `description`. When the contract has no
    frontmatter `description`, use its first `#` heading as the entry text;
    when it has no frontmatter at all, report that the page lacks the `type`
    the wiki schema requires (`wiki/schema.md`, OKF §4.1/§11.2), and still
    write the entry. If the target
    index is absent, skip and report.
  - **Generated index.** When `wiki.indexCommand` is set, never hand-edit a
    wiki index: report the missing entry together with that command. When it
    is unset, **offer** the entry interactively and write it **automatically**
    under `--non-interactive`.

**Do not write on the "keep both" outcome** from §0b — there the indexed
path is not the contract.

**Stale duplicate.** Only on step 1's **both present** outcome, where a
near-miss sits alongside a canonical file at the resolved path. The canonical
file is the contract and the run proceeds normally; the near-miss is dead
weight that may contradict it — and, having never been read, may be the older
and more carefully written of the two. Report it by path, with its first line
and heading list so the user can judge, then offer either **removing** it or
**merging** its content into the canonical file. Removal is destructive and a
merge rewrites the live contract, so both take per-option approval and the
preview-then-apply discipline of `development-principles.md` principle #6.
In `--non-interactive`, defer and write nothing; `--force` defers it too and never removes it unattended. Either way, carry the outcome into the §5 closing summary.

## 1. Dispatch exploration (Phase 1)

Dispatch the `gvt-dev:issue-triage-analyst` agent with: the resolved scope, the
`bugTracker` block verbatim, and the resolved contract path (§0 step 1). It
returns one structured triage report. **Do not fetch issue bodies
yourself** — keeping them off this thread is the point of the split. Mode
flags (`--non-interactive`, `--force`) govern only this thread's approval and
write behavior; the analyst always runs read-only regardless.

## 2. Phase 1 review — cross-cutting findings (interactive)

Present the **relational** findings as a set: duplicate clusters, overlaps,
dependencies, split candidates. For each, let the user accept / reject / adjust
(e.g. change the canonical, drop a cluster member, reject a split). Destructive
items — close-as-duplicate, create split issues — are **recorded but NOT applied
here**; they are carried into the per-issue walk, matched to each affected issue
by issue number.

Present each dependency with its **resolved state**: for a link the analyst
resolved, show the target's state beside it (open, closed with its date, a PR,
nonexistent, or unresolvable and why), so the user accepts or rejects a link
knowing whether it still blocks. `[refs]` findings are Verification findings,
not relational ones: they are accepted or rejected in the §3 walk, not here.

In `--non-interactive`, accept the analyst's findings as-is, but still defer the
destructive items unless `--force` was passed.

## 3. Phase 2 — per-issue walk (interactive)

For each action-set issue, gather its work from three places in the analyst's
report: its **Per-issue enrichment** row, its entry under the verification
findings, and any Phase 1 relational findings whose membership includes this
issue's number (duplicate-cluster membership, an accepted dependency, an approved
split). Present them together, then apply the approved changes using the **Mutation recipes** in the resolved contract:

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
- when a body rewrite in this walk records acceptance criteria — the outcome +
  acceptance-criteria rewrite above, or a verification rewrite below that
  restates a checkable criterion — write them as `- [ ]` rows under a
  `## Acceptance Criteria` heading, never as a bold or inline label inside
  another section. If the body already states acceptance — under that heading,
  or as other acceptance text, which `plan-task` Phase 4 recognises by an
  opening label carrying the word acceptance in its first two words (its
  *Writing the section into an issue body* block) — edit that statement rather
  than adding a second one. `plan-task` matches the canonical heading and
  supersedes it with a mapping; a criterion left as a label is one it can only
  mark superseded or fork on;
- when the analyst's **Verification findings** report an `[artifact]` finding
  other than `agreement` for this issue, present the finding with the target's
  actual text and offer a body rewrite that cites what the target says: `partly-shipped` →
  rescope to the residual; `proposal-stale` → drop or reframe the stale passage,
  and never adopt wording a `stricter-shipped` flag marks as weaker than what
  shipped; `premise-false` → correct the premise; `target-absent` → record that
  the target is absent or owned elsewhere; `artifact-wrong` → keep the proposal
  and add that the artifact is the side in error, naming what settled it. Fold
  this into the mechanism rewrite when both apply — one rewrite, one approval.
  The rewrite names the claims it checked and the commit it read, rather than a
  general "verified" stamp. Under `--non-interactive` without `--force`, post the
  note as a comment instead (§4). The note opens with this first line:
  `Triage verification note — [<comparand>] <outcome> — <source>`, where
  `<source>` is `<path> @ <sha>` (the target path and the read sha) for
  `[artifact]`, and the comment's URL for `[comments]`, taken from the finding
  (a tracker whose comments have no URL uses its stable comment id). Before
  posting, check the issue's comments and skip the note when an existing
  comment's first line begins `Triage verification note` and carries the same
  `[<comparand>]` and `<source>`. The outcome is not part of the match: a re-run
  can word it differently for the same evidence, so a re-run never posts the
  note twice. An `[artifact]` note read at a different sha is a different note and
  is posted, because the evidence moved. Post it through the
  contract's Comment recipe. A contract scaffolded before 4.32.0 still
  passes the text inline; never send a backticked note through that form — write
  it to `{tmpfile}` and post it with `gh issue comment {id} --body-file {tmpfile}`
  (or the tracker's equivalent body-file form) instead. The analyst
  stays read-only: this skill makes the write. Per `development-principles.md`
  principle #13;
- when the analyst's **Verification findings** report a `[comments]` finding for
  this issue (`refines` · `narrows` · `widens` · `reverses`), present the
  comment (author, date, and whether that is the issue author) and the
  corrected ask, and offer, with per-issue approval, to reconcile the body:
  either append a refined-proposal section citing the comment (the author's
  original framing stays as the record) or rewrite the proposed-change section
  in place. A comment by anyone is reported alike; adopting it is this
  per-issue approval's decision. Acceptance criteria in the rewrite follow the
  `- [ ]` rows rule above. `[comments]` and `[artifact]` are distinct checks —
  the first reads the issue's own later reasoning, the second an artifact — but
  when a mechanism rewrite, an `[artifact]` rewrite and a `[comments]`
  reconciliation apply to one issue, fold them into one rewrite, one approval.
  Under `--non-interactive` without `--force`, post the finding as a comment
  instead (§4), through the same body-file Comment recipe as the `[artifact]`
  note above, opening with the same first-line template (here `<source>` is the
  comment's URL) and skipped on the same comparand-and-source match;
- when the analyst's **Verification findings** report a `[refs]` finding for this
  issue (a cross-reference whose recorded state disagrees with the tracker's),
  present the reference, its relation, its outcome and the evidence, and remedy it
  by outcome. A reference with relation `qualifier` (inside a parenthetical, or
  right after "sub-issue of", "part of", "child of", "see", "cf.", "per", "as in",
  "from" or "under", on a `Blocked by` or `Depends on` line) never blocks and is
  not a finding; a blocker line left with no other reference is `unresolvable`
  kind `prose`. A remedy that edits the body is offered with per-issue approval;
  annotate the line or row and never tick or untick it, because ticking is reverse
  propagation and out of scope:
  - `cleared` (`via` is `same-repo`, `source-consumed` or `released (version check
    only)`): offer to append "— cleared: #N closed <date> (triage <date>)" to the
    body line that records the dependency. A blocker taken from a comment has no
    body line, so a comment is the only remedy.
  - `ticked-open` and `unticked-closed`: annotate the sub-issue row with the
    mismatch.
  - `closed-unreleased` and `closed-release-unverified`: comment only. The blocker
    is closed but its fix is not shown to be released. That includes a source
    consumed at a pinned ref (a `.gitmodules` submodule, or a git or GitHub
    dependency URL with a `#ref`), which is `closed-release-unverified` with
    the pin named, since the pin may predate the fix; an unpinned consumption is
    `cleared` via `source-consumed`.
  - `unresolvable` (kinds `prose`, `repo-ambiguous`, `cross-repo-unread`,
    `absent`, `pr`, `nonexistent` (not found or not readable), `heading-detached`,
    `truncated`, `lookup-failed`): offer to rewrite the reference into `owner/repo#N` form.
    For a kind that rewrite cannot fix (`truncated`, `lookup-failed`), report it
    and write nothing.
  - Two issue-level findings come from the record's `readiness.state`, not from a
    reference's `refs[].outcome`:
    - `done-but-unclosed`: propose closing the issue through the contract's
      "Close as completed or not planned (only with approval)" recipe, per the
      close-proposal walk below.
    - `banner-no-open-child`: report only. A banner is the author saying the
      issue stays open on purpose, so this is never a close proposal.
  - `retracted`: no write. A later note already withdrew the claim.
  Under `--non-interactive` without `--force`, post the finding as a comment
  instead (§4) and rewrite the body only under `--force`. The note opens with
  `Triage verification note — [refs] <outcome> — <source>`, where `<source>` is
  `<target> @ <state anchor>` and the state anchor is `closed <closed_at>`,
  `open`, `latest <version>`, or `sub-issues <completed>/<total>` (for
  `done-but-unclosed` the target is the issue itself). Dedup follows the same
  rule as above: skip when an existing comment's first line carries the same
  `[refs]` comparand and `<source>`, outcome ignored. A blocker that is reopened
  and closed again, or a new release, moves the anchor, so that is a new note.
  For `cleared`, add a second line, "No longer blocked by #N: #N closed <date>.",
  so the next run reads the note as a retraction;
- **reference findings outside the action set.** A `[refs]` finding can name an
  issue that is not in the action set, such as an already-triaged issue. After the
  action-set issues, walk those findings one at a time with the remedies above
  and the same approvals. These issues are not in the walk, so do not stamp
  `triagedLabel` on them;
- **close proposals.** A `done-but-unclosed` finding, and a carried-in close
  proposal (§0 step 4), are walked the same way: present the reason and its
  evidence, and on per-item approval post the reason through the Comment recipe,
  then close through the contract's "Close as completed or not planned (only with
  approval)" recipe with `{closeReason}` set to `completed` or `not planned`.
  Read the state back afterwards, as for labels. When the resolved contract
  **has no Close recipe** (one scaffolded before it existed), do not improvise a
  close command: report the approved close as outstanding, with the issue, the
  reason and the evidence, and carry it into §5;
- **then read the labels back.** Read the labels back with `bugTracker.readOne` (or the tracker's native issue view) and compare them with the set you intended to leave on the issue. A tracker CLI can exit 0 while a label write did nothing, so the write's own exit code is not evidence. On a mismatch, re-apply once and re-read. If it still mismatches, it is a failed write: stop on that issue and do not stamp it;
- **last**, add `triagedLabel` — only after the issue's other approved changes
  succeed and only after a matching readback. This keeps the skill idempotent: an
  aborted run leaves the issue un-triaged, so re-running picks it up again.

Apply one issue fully before moving to the next. If a write fails, stop on that
issue, report the failure, and do **not** stamp `triagedLabel`.

**Legacy set recipes.** A contract scaffolded before the others-only form may carry a
set recipe (set category, type or priority) that
names the label it adds in its own remove list. Running it as written can
strip the label it just added. When the recipe does, drop that label from the
remove list for that call, run the call, and note the strip for §5. §0c reports
the same pattern at load time.

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
| Near-miss contract resolution — rename to the resolved path, or replace it (§0b) | preview, then per-option approval | **deferred** unless `--force`, which takes the **rename** default for a sole marker-bearing candidate when neither it nor its destination is inside the wiki and the destination is not occupied (glob-only candidates alongside it stay deferred); a candidate or destination inside the wiki, an occupied destination (§0b), or more than one marker-bearing candidate stays deferred (nothing is moved into or inside the wiki unattended) |
| Contract registration — a docs-index row or a wiki-index entry (§0c) | offer | auto-apply, except a generated wiki index (`wiki.indexCommand` set), which is reported, never edited |
| Write the `paths` override for a wiki-default scaffold or rename (§0b) | part of that approval | automatic with the scaffold only, and not when the scaffold target is occupied (§0b); a wiki rename never runs unattended |
| Update a stale wiki-index link after a wiki-default rename (§0c) | part of the rename approval | not reached; a wiki rename never runs unattended |
| Stale-duplicate resolution — remove or merge a dead near-miss alongside a canonical contract (§0c) | preview, then per-option approval | **deferred**, including under `--force` |
| Field / label / priority / body / language (except a verification-finding rewrite — next row) | per-issue approval | auto-apply |
| Body rewrite from a verification finding (§3) — an `[artifact]` rewrite or a `[comments]` reconciliation | per-issue approval | **comment only** — the finding is posted as a comment; the body is rewritten only under `--force` |
| `needs-info` label + comment | approve | auto-apply |
| Dependency links | approve | auto-apply |
| Body annotation from a `[refs]` finding (§3) — a cleared line, or a mismatched row | per-issue approval | **comment only** — posted as a comment; the body is annotated only under `--force`. Never tick or untick a row |
| Close as completed / not planned (done-but-unclosed, or a carried-in proposal) (§3) | approve per item | **deferred** unless `--force` |
| Close-as-duplicate / create split issues | approve per item | **deferred** unless `--force` |
| Label readback (§3) | always | always |
| `triaged` label | after the issue's changes and a matching readback | after the issue's changes and a matching readback |

Never batch-close or mass-create issues without either per-item approval or an
explicit `--force`. These actions are hard to reverse on most trackers.

## 5. Closing summary

Report: issues triaged; fields / labels / priorities changed; duplicates linked or
closed; issues split or created; dependencies linked; and anything left
`needs-info` or deferred for a follow-up run. Report verification findings by
comparand (`[artifact]`, `[comments]` or `[refs]`) and outcome, and which were
rewritten into the body versus posted as a comment. For `[refs]`, also report the
`retracted` count (findings withdrawn by an earlier note, so nothing was written),
the truncated count (lists or comment sets cut off at their limit, so some
references were not resolved), and each close applied or deferred, with any
approved close left outstanding for lack of a Close recipe.

Report the label readback per issue (§3): matched, re-applied, or failed. Report
any legacy-guard strips (§3), and §0c's set-recipe warning. Do not cite the write
loop's own exit codes as evidence.

Also report, when §0 produced them: how the contract was resolved (scaffolded /
adopted, and from which near-miss path / already canonical); any deferred
near-miss resolution (§0b's `--non-interactive` defer, so a stopped run leaves a
record of why), including a near-miss whose source or destination is inside the
wiki with the destination an interactive run would offer, an occupied
destination with both paths, and each stale wiki-index link updated or reported
(§0c); §0c's label-key warning or inconclusive result; any missing
required headings; which index received the entry (`docs/TOC.md` under the
docs regime, or the wiki index written under the wiki regime), or why none did
(already indexed, index absent, generated index with its regenerate command,
or an unreachable subtree); and any dead duplicate carried forward from the both-present outcome or a "keep
both" choice. Report each vetoed candidate by path and the veto that removed it
(index file, or derived page), so a wrong veto stays visible.

## Example `bugTracker` block

Add this to `.gvt-agent.json` (GitHub / `gh` example — adjust queries, labels,
and the CLI for your tracker):

```json
"bugTracker": {
  "kind": "github",
  "actionQuery": "gh issue list --state open -L 200 --json number,title,labels,body,assignees,author,createdAt,milestone",
  "comparisonQuery": "gh issue list --state all -L 500 --json number,title,labels,state",
  "readOne": "gh issue view {id} --json number,title,body,labels,comments",
  "commentsQuery": "gh issue list --state open -L 200 --json number,comments",
  "structureQuery": "gh issue list --state open -L 200 --json number,parent,subIssuesSummary",
  "refStateQuery": "gh api repos/{repo}/issues/{id} --jq '{number,state,state_reason,closed_at,pull_request:(.pull_request != null),sub_issues_summary}'",
  "triagedLabel": "triaged",
  "needsInfoLabel": "needs-info"
}
```

Keep `actionQuery` scoped to the **whole open backlog** — do **not** narrow it to a
single label (e.g. `--label bug`). The triage-need detection subtracts only
`triagedLabel`, so a label-scoped `actionQuery` silently hides untriaged issues
that don't match the label (enhancements, docs, tech-debt), making the backlog look
groomed when it isn't.

`commentsQuery`, `structureQuery` and `refStateQuery` feed the analyst's `[refs]`
cross-reference check, and all three are optional. `commentsQuery` and
`structureQuery` are bulk fetches: give them the **same `-L` as `actionQuery`**
(200 in the example above), so truncation (a
returned count equal to `-L`) is detected consistently across them. JSON has no
comments, so the constraint lives here. `refStateQuery` is a per-reference lookup
and takes `{repo}` and `{id}`; it has no `-L`.
