# 0016. Extend CONVENTIONS.md resync to stale-config via a shared helper; scope the stale-config token report locally

- **Status:** accepted
- **Date:** 2026-07-21
- **Issue:** #149

## Context

`audit-conventions --fix`'s `planStaleConfig` (the `.genvid-agent.json` → `.gvt-agent.json`
migration path, added in 0012) scaffolded `CLAUDE.md` and `docs/TOC.md` skip-if-exists via
`pushScaffold`, but left `CONVENTIONS.md` untouched — the same gap 0013 had just closed for
the `migrated` state. Once a stale-config repo resolves past the C3-marker early return
(`hasC3Markers`), its repo-root `CONVENTIONS.md` is, like a migrated repo's, definitionally a
canonical plugin copy rather than a hand-authored file, so the same drift-resync rationale
from 0013 applies.

Separately, the stale-config Manual-follow-up report needed to flag lingering
`.genvid-agent.json` mentions (the pre-rebrand config filename) alongside the existing
`genvid:`/`genvid-dev:` retired tokens, so a user completing the migration by hand sees a
single consolidated report of what's left to fix.

## Decision

**Decision 1 — extract `planConventionsResync` as a state-agnostic helper, reused by both
states.** The three-branch CONVENTIONS.md resync logic (absent / drifted / identical) that
0013 introduced inside `planMigratedResync` is pulled out into its own exported
`planConventionsResync(repoRoot, pluginRoot)` in `lib/migrate.mjs`, and `planStaleConfig` now
calls it directly (alongside its existing `pushScaffold` calls for `CLAUDE.md`/`docs/TOC.md`),
rather than duplicating the three branches or having the stale-config planner cross-call
`planMigratedResync` (which would couple two unrelated states through an unrelated function
name). `planMigratedResync` itself becomes a thin wrapper: `{ state: 'migrated', actions:
await planConventionsResync(repoRoot, pluginRoot) }`.

This **extends ADR-0013**, it does not contradict it: 0013's exclusion of greenfield/legacy
from resync still holds — their `CONVENTIONS.md` is hand-authored/forked and stays protected
by `pushScaffold`'s skip-if-exists (issue #25). Stale-config is pulled in for the same reason
migrated was in 0013: past the C3-marker branch, the file is a canonical plugin copy, not a
hand-edited artifact, so resyncing drift is correct rather than clobbering.

**Decision 2 — scoped, report-local needle set (`STALE_REPORT_TOKENS`) instead of widening
`DEFAULT_RETIRED_TOKENS`.** The stale-config Manual-follow-up report scans with its own
`STALE_REPORT_TOKENS = ['genvid:', 'genvid-dev:', '.genvid-agent.json']`, passed as an
`opts.retiredTokens` override to the existing `scanRetiredTokens(REPO_ROOT, { retiredTokens:
STALE_REPORT_TOKENS })` (the git-tracked-config-scoped scanner from ADR-0014), rather than
adding `.genvid-agent.json` to the global `DEFAULT_RETIRED_TOKENS` in `lib/hygiene.mjs`.
`.genvid-agent.json` is intentionally kept live and referenced by name during a stale-config
repo's transition window and by genvid-construct3 (C3) port-and-keep repos (the C3-marker
branch above) — repos where the filename mention is correct, not a rename left half-done.

## Compromise

Alternatives rejected:

- **Duplicate the three-branch resync logic inside `planStaleConfig`** — rejected: the
  absent/drifted/identical branches and the `lineMultisetDiffCount` diff-hint machinery are
  non-trivial and state-agnostic; duplicating them would drift the two copies apart on the
  next edit, the exact failure mode principle #7/ADR-0007 records decision-rationale docs to
  guard against.
- **Have `planStaleConfig` call `planMigratedResync` directly** — rejected: it works today but
  wires one state's planner through a function named for a different state, and would break
  if `planMigratedResync` ever grew migrated-only side effects. Extracting the shared part by
  name (`planConventionsResync`) keeps the state-specific planners each doing only their own
  state's work, per `CLAUDE.md`'s per-state-branch layering (0012).
- **Add `.genvid-agent.json` to `DEFAULT_RETIRED_TOKENS`** — rejected: it would newly flag the
  filename in every repo's plain (non-`--fix`) audit run, including mid-migration repos still
  carrying the old file on purpose and C3 port-and-keep repos that document it deliberately —
  turning an intentional interim/permanent state into permanent audit noise across the fleet,
  for the sake of one report in one code path.

## Consequences

Stale-config CONVENTIONS.md handling changes from skip-if-exists to resync-if-drifted, so a
hand-edited stale-config `CONVENTIONS.md` is now overwritten on `--apply`. This is an
**inherited** risk, not a new one: it is the identical trade-off ADR-0013 already accepted for
the migrated state, mitigated the same way — the mandatory dry-run `+N/−M` diff hint and the
clean-tree apply gate remain the user's veto point before anything is overwritten.

The stale-config report's token set is deliberately narrower than, and diverges from,
`DEFAULT_RETIRED_TOKENS` (it adds `.genvid-agent.json`, which the global list omits). This is
called out at the definition site in `audit.mjs` so a future edit to `DEFAULT_RETIRED_TOKENS`
doesn't get assumed to auto-propagate to the stale-config report, or vice versa — the two
lists are intentionally decoupled, not out of sync by accident.
