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

**Print the full output** (file moves, heading edits, unambiguous reference
rewrites, ambiguous-reference list). Then **wait for user confirmation** before
applying.

### 3d. Apply on approval

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/create-adr/scripts/renumber-adrs.mjs \
  --dir <adr-dir> --insert-at <N> --apply
```

### 3e. Author the record at N

Dispatch **`gvt-dev:tech-writer`** with the same content as §2 step 2, plus the
explicit target number N. tech-writer honors an explicitly supplied number rather
than computing next-highest (see tech-writer decision-records step 2). Instruct
it to stage only — do not commit.

### 3f. Ambiguous-reference report

Print the script's ambiguous-reference list (bare `ADR N` / `// See ADR N`
matches in `.md` and source files). Tell the user:

> These were not auto-fixed — their context determines whether they point to the
> old or new number. Please review and update manually.

This skill never blindly replaces ambiguous references.

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

1. After tech-writer (and `--apply`, if an insertion) stages its files, confirm
   the staged set with `git status`.
2. Commit using the project's commit format from `CLAUDE.md` (e.g.
   `docs: add ADR NNNN — <title>`; follow whatever the project uses).
3. For an insertion: the renumber script's `git mv` operations are already staged;
   tech-writer adds the new record; one commit covers both.
