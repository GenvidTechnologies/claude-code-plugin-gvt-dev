---
name: create-adr
description: Adds or chronologically inserts an Architecture Decision Record into the repo's docs/decisions/ (or its declared ADR location). On append, dispatches gvt-dev:tech-writer to scaffold and fill the next-numbered record from the shared MADR-lite template, back-link the issue, and self-index the TOC row. On chronological or retroactive insertion, runs a clean-tree gate and the renumber-adrs script to shift later records up, dispatches tech-writer at the explicit inserted number, and sweeps cross-references. Use when recording a non-trivial architecture or trade-off decision on demand, outside a full plan-task run, or when back-filling or inserting a decision into the historical sequence.
metadata:
  expects:
    files:
      - path: docs/decisions/
        required: false
        reason: Home for ADR files; scaffolded on first use if absent
      - path: docs/TOC.md
        required: false
        reason: Decision-Records index this skill self-indexes into and rewrites on renumber
      - path: CLAUDE.md
        required: false
        reason: Read for commit format and any project-declared ADR location that overrides docs/decisions/
    tools:
      - command: git
        reason: Clean-tree gate (git status --porcelain), per-file git mv for renumber, and git-history date derivation
      - command: grep
        required: false
        reason: Only the chronological-insertion ambiguous-reference sweep needs it; a plain append does not
---

# Create ADR

Author or chronologically insert an Architecture Decision Record. Delegates all
writes to `gvt-dev:tech-writer`; this skill owns sequencing, gating, and the
final commit.

## 0. Inputs

Gather from the user before proceeding:

- **Title** — becomes the kebab slug in `NNNN-<title>.md` (required)
- **Decision date** — defaults to today. For a back-dated or retroactive record,
  follow the date policy in `${CLAUDE_PLUGIN_ROOT}/skills/plan-task/SKILL.md`
  Phase-4 step 5 and `${CLAUDE_PLUGIN_ROOT}/docs/development-principles.md`
  principle #7. Never fabricate day precision; hedge to month/year if the exact
  day cannot be derived from git history.
- **Context** — the problem, constraints, and why a decision was needed
- **Decision** — what was decided and how it fits the architecture
- **Compromise** — alternatives rejected and why; trade-offs made
- **Consequences** — what becomes easier or harder as a result
- **Issue ref** — GitHub `#N` or Bitbucket URL to back-link (optional)
- **Placement** — `append` (default) or `insert-at N` / `retroactive`

## 1. Resolve the ADR location

1. Read `CLAUDE.md`. If it declares an ADR location, use that; otherwise use
   `docs/decisions/`.
2. List `NNNN-*.md` files in the ADR directory, sorted numerically. Record the
   **highest existing N** (0 if the directory is empty or absent).
3. If no ADR files exist yet, offer the first-use scaffold (§4) before proceeding.

## 2. Append path (common case)

Use this path when placement is `append`. For `insert-at N` or `retroactive`,
go to §3.

1. N = highest existing N + 1.
2. Dispatch **`gvt-dev:tech-writer`** with:
   - The §0 content (title, date, Context, Decision, Compromise, Consequences,
     issue ref)
   - Template: `${CLAUDE_PLUGIN_ROOT}/docs/decision-record.template.md`
   - ADR directory and target number N
   - Instruction: **stage the file but do not commit** — this skill owns the commit
3. tech-writer names the file `NNNN-kebab-title.md`, fills the template, and
   self-indexes a TOC row under **Decision Records** in `docs/TOC.md`. It is
   the sole write owner; this skill does not duplicate those steps.
4. Proceed to §6 (commit).

## 2b. From-empty chronological backfill (multiple records at once)

Use this path only when the ADR directory is **empty** (highest existing N = 0,
per §1 step 2) and you're seeding **several** past decisions at once from git
history, rather than authoring one new record going forward (§2) or inserting
into an existing sequence (§3).

1. **Why this differs from §3:** §3 exists to open a slot inside an
   already-populated sequence, so it must shift later records up — hence the
   renumber script and the clean-tree gate. Backfilling an empty directory has
   nothing to shift: N is always the next unused number and no existing file
   ever moves. Do **not** run the renumber script or the clean-tree gate for
   this path.
2. **Filter for ADR-worthiness first.** Not every commit is a decision worth a
   record. Backfill only genuine decisions — a non-trivial architecture or
   compromise choice, or a case where an alternative was weighed and rejected —
   the same bar `plan-task` Phase 4 applies when deciding whether a change
   needs an ADR. Skip routine feature commits.
3. **Order the filtered decisions chronologically**, oldest first, and assign
   them `0001…000N` in that order.
4. **Derive each record's date from git history of the code the decision is
   about**, not from today:
   - `git log --diff-filter=A -- <file>` for when the affected file first
     appeared, or
   - `git log -S'<symbol>'` for when a specific pattern/approach was
     introduced.
   Hedge to month/year when the exact day can't be pinned from history — never
   fabricate day precision. Follow the §0 date policy and
   `plan-task` Phase-4 step 5 for how to record this: each record distinguishes
   **Originally decided** (the derived git-history date) from **Recorded**
   (today, when the ADR file is actually written).
5. **On a date tie with unknown day** (two candidate decisions land in the same
   month/year with no way to order them from history), ask the user which
   comes first — never fabricate an ordering.
6. **Dispatch `gvt-dev:tech-writer` once per record**, each at its explicit
   assigned number, reusing the same content contract as §2 step 2 (template,
   target number, stage-only instruction). Do not let tech-writer compute
   next-highest — pass the number explicitly, as in §3e.
7. **Write the `docs/TOC.md` Decision-Records index once, centrally,** after
   all records are drafted — not as N parallel per-record writes, which would
   race the same file. This skill (not tech-writer) owns this single index
   pass for the batch.
8. **Land the whole backfill as one commit** covering all N records plus the
   single TOC update, per §6.

## 3. Chronological / retroactive insertion path

### 3a. Determine insertion number N

1. Read the `Date:` field from each existing ADR.
2. Place the new decision's date in the chronological sequence; N is the slot to
   open (the number the new record will bear).
3. **On a date tie (same month/year, exact day unknown):** ask the user which
   record should come first — never fabricate day precision.

### 3b. Clean-tree gate

```bash
git status --porcelain
```

If output is non-empty, **abort** with a clear message:

> Working tree has uncommitted changes. Commit or stash them before inserting an
> ADR — the renumber script uses `git mv` and requires a clean tree so any bad
> rename is git-recoverable.

### 3c. Dry-run the renumber

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/create-adr/scripts/renumber-adrs.mjs \
  --dir <adr-dir> --insert-at <N>
```

The script discovers `NNNN-*.md` records **recursively at any depth** under
`--dir` — theme subdirectories included — as **one** chronological sequence.
`index.md`/`README.md` and date-named files (`NNNN-NN-NN-...`) are not ADRs and
are skipped. It stops with exit 1, changing nothing, on: a duplicate number
found anywhere under `--dir`, an `--insert-at` below 1 or non-integer, or no
ADRs discovered at all.

**Print the full output.** A dry run reports, in order: the discovered-ADR
count; each move as a repo-relative `old -> new` path; unambiguous reference
rewrites grouped by citing file; a "Left untouched" list (see §3f); the
ambiguous-reference list, also grouped by file (see §3f); and a closing
`Summary:` line tallying moves, reference rewrites, files touched, left-untouched
occurrences, and ambiguous lines. The reference rewrite is a **single pass over
every moved filename token**, in whatever path form it appears — a
sibling-relative link, a cross-theme relative link, a root-absolute link, a
`docs/TOC.md` row, a backticked bare or path-qualified `file.md` pointer, and
occurrences inside `.json`/`.mjs` files.

Then **wait for user confirmation** before applying.

### 3d. Apply on approval

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/create-adr/scripts/renumber-adrs.mjs \
  --dir <adr-dir> --insert-at <N> --apply
```

Apply stages the renames and the heading and reference edits.

### 3e. Author the record at N

Dispatch **`gvt-dev:tech-writer`** with the same content as §2 step 2, plus the
explicit target number N. tech-writer honors an explicitly supplied number rather
than computing next-highest (see tech-writer decision-records step 2). Instruct
it to stage only — do not commit.

### 3f. Ambiguous-reference report

The scan flags bare mentions of a **moved** number in any tracked text file —
`ADR N`, `ADR-NNNN`, and `decision N`. These are report-only and never
rewritten; their context determines whether they point to the old or new
number. Print the script's ambiguous-reference list, grouped by file. Tell the
user:

> These were not auto-fixed — their context determines whether they point to the
> old or new number. Please review and update manually.

This skill never blindly replaces ambiguous references.

The dry run's "Left untouched" list reports that frozen history
(`CHANGELOG.md`, `docs/superpowers/`, the wiki raw tree and `log.md`) and
`.pointer-baseline.json` are deliberately not rewritten — triage those by hand
if needed.

### 3g. Pointer baseline

Only when the ADR repo carries a `.pointer-baseline.json` (the pointer-anchor
ratchet maintained by `audit-conventions`): re-key it before running
`commands.validate`, since a renumber moves the very files the baseline's
entries point at.

1. Probe for a rename mode:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/skills/audit-conventions/scripts/pointer-baseline.mjs --help
   ```
   If the help text lists `--rename`, build one `--rename old=new` for
   **every** `old -> new` line in the renumber's dry-run "File moves" output —
   a move whose file holds no baseline entries is reported per-pair as
   `no baseline entries — nothing to re-key` and simply skipped, no special
   handling needed. Run the full set as a dry run first (no `--write`):
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/skills/audit-conventions/scripts/pointer-baseline.mjs \
     --rename <old1>=<new1> --rename <old2>=<new2> …
   ```
   Then branch on the result:
   - **Clean** (no `REFUSED`) — show the dry run, wait for the user's
     confirmation, then re-run the identical command with `--write` added, and
     stage `.pointer-baseline.json`.
   - **Refused, with drift `explained by this rename`** — the tool prints a
     ready `--allow-drift '…'` argument for each explained entry. An explained
     drift is a cited line the renumber's own token rewrite changed, and the
     allowance pins the reviewed current digest. Copy the printed
     `--allow-drift` arguments onto the command and dry-run again.
   - **Refused, with drift not explained by this rename** — stop and report:
     the cited content actually changed independently of the move, so the
     citation needs repair. Never reach for `--accept-new` to get past this.
   - **Refused with `nothing to re-key`** (the whole-run refusal, not a
     per-pair line) — no moved file holds baseline entries; continue on to
     `commands.validate`.
   - **Any other refusal** — stop and report it.
2. Otherwise, run `--accept-new` **without** `--write` first and read its
   output: confirm every newly-added entry pairs with a pruned entry under a
   renamed path — evidence the renumber produced it, not unrelated drift. Only
   once that's confirmed, re-run with `--write` added.

`--accept-new` **also accepts any unrelated new debt** already present in the
tree, not only the renumber's, takes fresh digests, and refuses — with no
write — while any drift or broken pointer-anchor finding exists.

A guard test naming an ADR path (this repo's pointer-baseline guard `CONTROL`)
is rewritten by the renumber and stays red until the baseline is re-keyed.

## 4. First-use scaffold

If `docs/decisions/README.md` is **absent**, scaffold it from:
`${CLAUDE_PLUGIN_ROOT}/skills/create-adr/README.breadcrumb.template.md`

Then **self-index it in `docs/TOC.md`** under the **Decision Records** heading
(create the heading if absent). An unindexed scaffolded doc is invisible to
planning and triage skills that discover docs via the index — the same gap
`triage-issues` §0 addresses for `docs/issue-triage.md` (plugin issue #90).

This step is **idempotent**: skip if `docs/decisions/README.md` already exists;
skip gracefully if `docs/TOC.md` is absent.

## 5. Windows / git safety

The renumber script performs **per-file `git mv OLD NEW`** for each renamed
record — it never runs `git mv` on the `docs/decisions/` directory itself. On
Windows, a `git mv` of a watched directory fails with Permission Denied (`EBUSY`);
per-file moves are safe. If running renumber steps manually, apply the same rule.

## 6. Commit ownership

0. **If this skill was invoked from inside a `plan-task` execution, stop after
   staging — that orchestrator owns the commit** (ADR-0008), and steps 1–3 below
   do not apply. Stage tech-writer's files by explicit path, report them, and
   return. The `git status` sweep in step 1 assumes this skill is the only writer
   in the tree; during `plan-task` execution it is not, because independent tasks
   may be dispatched concurrently and stage into the same index — so the sweep
   would land a sibling task's files in the ADR commit. `plan-task` Phase 4 step 5
   dispatches `gvt-dev:tech-writer` directly for exactly this reason; reach for
   this skill on demand *outside* a plan run, or for an insertion/backfill whose
   renumber step this skill owns.
1. After tech-writer (and `--apply`, if an insertion) stages its files, confirm
   the staged set with `git status`.
2. Commit using the project's commit format from `CLAUDE.md` (e.g.
   `docs: add ADR NNNN — <title>`; follow whatever the project uses).
3. For an insertion: the renumber's renames and its heading and reference edits are staged;
   tech-writer adds the new record; one commit covers both. If §3g re-keyed
   `.pointer-baseline.json`, stage it too.
