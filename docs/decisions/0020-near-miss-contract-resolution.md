# 0020. Near-miss contract resolution in `triage-issues`

- **Status:** accepted
- **Date:** 2026-07-28
- **Issue:** #178

## Context

`triage-issues` §0 resolved its conventions contract by exact filename —
`docs/issue-triage.md`. A hand-authored contract under a near-miss name read
as "absent", so the skill offered to scaffold a second, contradicting
contract while the real one sat dead and unread.

Discovered in `claude-code-plugin-gvt-construct3` on 2026-07-28. That repo
carried `docs/bug-triage.md`, authored 2026-07-02 — a month after the
v3.0.0 rename (`triage-bugs` → `triage-issues`, `docs/bug-triage.md` →
`docs/issue-triage.md`, shipped 2026-06-05). So the affected population is
wider than "repos that adopted before the rename": consumers are still
creating the old name from stale knowledge. The v3.0.0 CHANGELOG migration
note even predicted this failure ("the skill will otherwise offer to
re-scaffold it") — the note was the only mitigation, and it relied on
consumers reading it.

Two things made it worse than a no-op: the stale doc declared a
`needs-info` label that did not exist in that repo (a latent failure that
would fire only when the flag-missing-info recipe ran), and following §0 as
written nearly produced two contradicting contracts side by side.

## Decision

Two independent detection signals over the **top level of `docs/` only,
non-recursive** — a filename glob `docs/*[Tt]riage*.md`, and a marker-line
grep tolerant of the pre-rename name and any namespace prefix. Either alone
qualifies.

Detection combines with canonical-file presence into **four outcomes**:
canonical / near-miss / absent / **canonical + near-miss both present**.
Resolution offers rename (default), replace (preview-then-apply with an
enumerated discard list), or keep both. A new §0c reconcile step then
validates label keys, required headings, and the `docs/TOC.md` index for
**any** resolved contract — not only the near-miss branch — so a
hand-authored canonical file gets the same reconciliation a scaffold would
have.

The non-recursive scoping is recorded here as an empirically-derived
constraint, not a stylistic one: a recursive scan of this very repo matches
`docs/superpowers/plans/2026-06-04-triage-bugs.md` and
`docs/superpowers/specs/2026-06-04-triage-bugs-skill-design.md`, frozen
accurate history that must never be flagged as a live near-miss.

## Compromise

Two alternatives were considered and rejected — both worth recording so
neither is re-proposed on the merits it superficially has.

1. **Unattended auto-rename — rejected in favor of defer.** This is issue
   #178's own acceptance criterion (AC 3), which argued that discarding
   hand-authored conventions unattended is the worse failure. Rejected
   because renaming a hand-authored consumer file unattended is a write the
   §4 safety table had no row for, and because deferring already satisfies
   the primary criterion (no silent double-scaffold) *without* an
   unattended mutation. `--force` preserves the issue's intent as an
   explicit opt-in. This is the one a future reader will most want the
   rationale for — the shipped behavior contradicts the issue that
   requested it.
2. **Placing the check in `audit-conventions` — rejected.** That is where
   every *other* rename-drift check lives (#124, #117, #118, #149, #153),
   so it looks like the natural home. It cannot work: `audit-conventions`
   is never invoked by `triage-issues` (only `sync-config`,
   `validate-changes`, and `.gvt-agent.json` `commands.validate` chain it).
   In the actual failure scenario the user invoked triage directly and it
   scaffolded immediately — no audit ran, and none would have. An
   audit-side check is a separate, later, opt-in safety net that cannot
   prevent the double-scaffold. This is durable and non-obvious, and
   exactly the kind of thing that gets re-proposed.

## Consequences

- A `triage-issues-evals/` harness was considered and **deferred**, not
  rejected. The four-outcome resolution is objectively verifiable,
  state-dependent, and safety-gated — the profile `CLAUDE.md`'s Testing
  section says warrants an eval harness. It was deferred as a large new
  surface that does not run in CI and is orthogonal to this change; a
  follow-up issue tracks it.
- A `plugin/CONVENTIONS.md` line-18 edit was considered and **rejected on
  cost**. The line ("some skills scaffold a doc into `docs/` and
  self-index it in `docs/TOC.md`") remains true after this change. Any
  byte change to `CONVENTIONS.md` puts every migrated consuming repo's root
  copy into drift, emitting an audit warning on every run until each
  consumer runs `--fix --apply` — not worth it for a clause about a
  branch-specific behavior. Recorded here so the edit is not re-proposed.
- This repo **cannot dogfood** the change: it has the correct filename and
  both labels exist, so it is the healthy case in every dimension.
  `gvt-construct3` is the only live fixture.
- Companion issue #179 (the `plan-next-issue` triage-skip heuristic
  correction) shipped in the same PR but is a separate decision, not part
  of this one.
