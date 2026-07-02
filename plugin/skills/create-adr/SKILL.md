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
