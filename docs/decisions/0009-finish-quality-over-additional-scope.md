# 0009. Finish-quality over additional scope (principle #8)

- **Status:** accepted
- **Date:** 2026-06-16
- **Issue:** #81

## Context

Retroactive record. Dogfooding surfaced a recurring failure: a change would touch code but
leave it half-migrated or internally inconsistent, deferring the cleanup to a follow-up
ticket that then drifted or never landed. A related failure: tracking items that prescribed
an implementation *mechanism* went stale when a later change shipped a different mechanism,
leaving the next planner to inherit a dead convention as if it were current spec. The plugin
needed a first-class rule distinguishing deferrals that are legitimate from deferrals that
are really unfinished work.

## Decision

Codify **"consistency before features"** as development-principles **#8**, the single source
of truth the skills reference rather than each restating it. It carries two corollaries:

- **Finish-quality vs. additional-scope.** The finish-quality of the code a change *touches*
  — clobbered globals, now-dead blocks, a half-adopted convention exposed in this change's
  own diff — is part of that change's definition of done and folds into the change itself.
  Genuinely separate capabilities are *additional scope* and may be deferred. Every deferral
  is classified before it is deferred.
- **Stale-mechanism.** A tracking item records **outcome + acceptance criteria**, not a
  prescribed mechanism; any prescribed mechanism is re-verified against live code before a
  later planner adopts it.

Architecture: a numbered principle in `development-principles.md` referenced by `plan-task`
(which gates deferrals against it) and `triage-issues` (which flags mechanism-prescribing
issues), rather than duplicated prose. (It first shipped as sub-bullets under principle #4 in
v3.0.0, then was promoted to its own principle #8 in v3.3.0.)

## Compromise

Alternatives rejected:

- **Defer all finish-quality to a separate "make it consistent" ticket** — those tickets
  drift or die; the code stays inconsistent in the meantime.
- **Leave it to author discipline with no gate** — the failure recurred precisely because
  nothing enforced it.

The cost: a change's definition of done is larger (finish-quality can't be carved off), and
authors must actively classify each deferral rather than defaulting to "later."

## Consequences

Enforced at the `plan-task` deferral gate and the `triage-issues` mechanism-prescription
check; both cite principle #8 rather than restating it, consistent with the
[link-don't-duplicate convention](0007-five-dimension-doc-and-adr-convention.md). Companion to
the #83 defer-scope refinements.
