---
name: create-adr
description: Adds or chronologically inserts an Architecture Decision Record into the repo's resolved decisions location (paths['docs/decisions/'] in .gvt-agent.json, default docs/decisions/). On append, dispatches gvt-dev:tech-writer to scaffold and fill the next-numbered record from the shared MADR-lite template, back-link the issue, and self-index it. On chronological or retroactive insertion, runs a clean-tree gate and the renumber-adrs script to shift later records up, dispatches tech-writer at the explicit inserted number, and sweeps cross-references. Use when recording a non-trivial architecture or trade-off decision on demand, outside a full plan-task run, or when back-filling or inserting a decision into the historical sequence.
metadata:
  expects:
    files:
      - path: docs/decisions/
        required: false
        reason: Home for ADR files; scaffolded on first use if absent
      - path: docs/TOC.md
        required: false
        reason: Decision Records index this skill self-indexes into outside the wiki, and rewrites on renumber
      - path: CLAUDE.md
        required: false
        reason: Read for commit format
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
- **Theme** — optional. Only meaningful when the resolved location (§1) lays
  records out under theme subdirectories; interactive runs are offered a
  choice there, non-interactive runs may pass one up front to skip inference.

## 1. Resolve the ADR location and the next number

1. Run from the repo root:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/skills/create-adr/scripts/renumber-adrs.mjs --next
   ```
   This resolves `paths['docs/decisions/']` from `.gvt-agent.json` (falling
   back to `docs/decisions/` when unset) the way CONVENTIONS.md's Runtime path
   resolution describes — the same override `/gvt-dev:audit-conventions`
   itself uses. **Nothing in this skill reads an ADR location from
   `CLAUDE.md`.** It prints one JSON object: `dir`, `resolvedFrom`, `wiki`,
   `wikiDir`, `layout` (`flat`/`themed`/`mixed`/`empty`/`missing`), `themes`
   (each with `name`, `count`, and whether an `index.md` exists), `highest`,
   `next`, `nextPadded`, `rootIndex`, `rootReadme`, and `records` — every
   discovered ADR, recursively across theme subdirectories, as `{ num, path }`.
   If it reports a `warning` (e.g. an unusable `paths` override), surface it to
   the user before continuing.

   **Every later mention of "the ADR directory" in this skill means this
   resolved `dir`.**
2. If `layout` is `missing` or `empty`, offer the first-use scaffold (§4)
   before proceeding.
3. **Theme choice** — only relevant when `layout` is `themed` or `mixed`, or
   the user asked for one. Candidates are the `themes` array from step 1,
   plus, for a `mixed` layout, the root itself.
   - **Interactive:** route to `AskUserQuestion` with the existing themes, the
     root (mixed layout only), and a "new theme" option.
   - **New theme:** create a kebab-case subdirectory under `dir` and an
     `index.md` in it from
     `${CLAUDE_PLUGIN_ROOT}/skills/create-adr/decisions-index.template.md`;
     inside the wiki, also add a theme row to `<dir>/index.md`. **Never create
     a new theme without an explicit instruction to do so** — a
     non-interactive run with no theme supplied falls to the next bullet
     instead of creating one.
   - **Non-interactive, no theme supplied:** pick the best-matching
     **existing** theme (by title/keyword overlap with §0's Title/Context) and
     report the choice; never invent one.
4. **Regime** — where the record is written and registered is keyed on `wiki`;
   `layout` (and the theme chosen above) decides placement within it:

   | Case | File | Register in | Frontmatter | First-use scaffold |
   |---|---|---|---|---|
   | Outside the wiki (flat or themed) | `<dir>[/<theme>]/NNNN-slug.md` | `docs/TOC.md` Decision Records row (link includes `<theme>/` when themed) | None | `<dir>/README.md` breadcrumb + TOC row (§4) |
   | Inside the wiki, theme chosen | `<dir>/<theme>/NNNN-slug.md` | `<dir>/<theme>/index.md` (created from `decisions-index.template.md` if absent; theme row added to `<dir>/index.md`) | Yes | — |
   | Inside the wiki, flat or empty themed root | `<dir>/NNNN-slug.md` | `<dir>/index.md`; if that's absent, whichever index already lists sibling ADRs; if neither exists, create `<dir>/index.md` | Yes | `<dir>/index.md` (no frontmatter) + link from `<wikiDir>/index.md` (skip if absent) + one idempotent TOC Decision Records pointer row (skip if `docs/TOC.md` absent). **No README.** (§4) |

   Inside the wiki: no per-record TOC row beyond the single pointer row above;
   no `<wikiDir>/log.md` entry (the log is ingest-scoped — git already records
   authorship); honor any stricter local indexing rule stated in the repo's
   `CLAUDE.md` or wiki schema over the defaults above.

   **Entry shape:** mirror whatever shape the target index already uses for
   its existing entries; a fresh index uses
   `* [<Title>](NNNN-slug.md) - <description>` — title without the ADR number,
   since renumbering can rewrite file names but never rewrites link text.

   **Frontmatter** (the "Yes" rows above only): mirror sibling ADRs' existing
   key set and `type` when siblings exist in that location; otherwise use the
   default block documented in
   `${CLAUDE_PLUGIN_ROOT}/docs/decision-record.template.md`'s leading comment
   — single-quoted `title` (no number), single-quoted `description`,
   `tags: [decisions, <theme>]` (or `[decisions]` with no theme), and `status`
   mapped from this skill's MADR Status field: proposed → draft, accepted →
   stable, superseded → deprecated. The body heading `# NNNN. Title` stays in
   every case.

## 2. Append path (common case)

Use this path when placement is `append`. For `insert-at N` or `retroactive`,
go to §3.

1. N = the `next`/`nextPadded` value §1 already resolved. If meaningful time
   has passed since §1 ran (e.g. after a scaffold or theme decision), re-run
   `--next` to confirm N still holds.
2. Dispatch **`gvt-dev:tech-writer`** with:
   - The §0 content (title, date, Context, Decision, Compromise, Consequences,
     issue ref)
   - Template: `${CLAUDE_PLUGIN_ROOT}/docs/decision-record.template.md`
   - The resolved ADR directory (`dir`), target number N, the chosen theme (if
     any), and whether the location is inside the wiki (`wiki`)
   - Instruction: **stage the file but do not commit** — this skill owns the commit
3. tech-writer names the file `NNNN-kebab-title.md`, fills the template, and
   registers it per §1's regime table — self-indexing a `docs/TOC.md` row
   outside the wiki, or indexing into the theme/root wiki index inside it. It
   is the sole write owner; this skill does not duplicate those steps.
4. Proceed to §6 (commit).

## 2b. From-empty chronological backfill (multiple records at once)

Use this path only when the ADR directory is **empty** (§1's `--next` reports
`highest: 0`) and you're seeding **several** past decisions at once from git
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
   resolved dir, target number, theme, wiki flag, stage-only instruction). Do
   not let tech-writer compute next-highest — pass the number explicitly, as in
   §3e.
7. **Register the whole batch once, centrally** — per §1's regime table (the
   `docs/TOC.md` Decision Records index outside the wiki; the resolved wiki
   index inside it) — not as N parallel per-record writes, which would race the
   same file. This skill (not tech-writer) owns this single registration pass
   for the batch.
8. **Land the whole backfill as one commit** covering all N records plus the
   single index update, per §6.

## 3. Chronological / retroactive insertion path

### 3a. Determine insertion number N

1. Use §1's `--next` output: its `records` list is the full existing sequence,
   discovered recursively across theme subdirectories. Read the `Date:` field
   (or frontmatter date) from each.
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
  --dir <dir> --insert-at <N>
```

`<dir>` is the location §1 resolved. The script discovers `NNNN-*.md` records
**recursively at any depth** under `--dir` — theme subdirectories included —
as **one** chronological sequence. `index.md`/`README.md` and date-named files
(`NNNN-NN-NN-...`) are not ADRs and are skipped. It stops with exit 1,
changing nothing, on: a duplicate number found anywhere under `--dir`, an
`--insert-at` below 1 or non-integer, or no ADRs discovered at all.

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
  --dir <dir> --insert-at <N> --apply
```

Apply stages the renames and the heading and reference edits.

### 3e. Author the record at N

Dispatch **`gvt-dev:tech-writer`** with the same content as §2 step 2 — the
resolved dir, theme, and wiki flag included — plus the explicit target number
N. tech-writer honors an explicitly supplied number rather than computing
next-highest (see tech-writer decision-records step 2). Instruct it to stage
only — do not commit.

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

Triggered from §1 step 2, when `layout` is `missing` or `empty`. Branch on
§1's `wiki` flag — never hard-code the unresolved default directory name here,
only the resolved `dir`:

**Outside the wiki:** if `<dir>/README.md` is absent, scaffold it from
`${CLAUDE_PLUGIN_ROOT}/skills/create-adr/README.breadcrumb.template.md`,
filling its `<toc-link>` placeholder with the relative path from `<dir>` to
`docs/TOC.md` (which renders `../TOC.md` for the default `docs/decisions/`).
Then **self-index it in `docs/TOC.md`** under the **Decision Records** heading
(create the heading if absent). An unindexed scaffolded doc is invisible to
planning and triage skills that discover docs via the index — the same gap
`triage-issues` §0 addresses for `docs/issue-triage.md` (plugin issue #90).
Idempotent: skip if `<dir>/README.md` already exists; skip gracefully if
`docs/TOC.md` is absent.

**Inside the wiki:** no README. If `<dir>/index.md` is absent, create it from
`${CLAUDE_PLUGIN_ROOT}/skills/create-adr/decisions-index.template.md` (no
frontmatter) and link it from `<wikiDir>/index.md` (skip if absent). Add one
idempotent Decision Records pointer row to `docs/TOC.md` naming the wiki index
— a single row pointing at the index, never a per-record row — skipping if
`docs/TOC.md` is absent. Idempotent: skip if `<dir>/index.md` already exists.

## 5. Windows / git safety

The renumber script performs **per-file `git mv OLD NEW`** for each renamed
record — it never runs `git mv` on the ADR directory itself. On Windows, a
`git mv` of a watched directory fails with Permission Denied (`EBUSY`);
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
4. Report to the user: the resolved ADR directory (`dir`), whether it's inside
   the wiki, and the theme chosen (if any).
