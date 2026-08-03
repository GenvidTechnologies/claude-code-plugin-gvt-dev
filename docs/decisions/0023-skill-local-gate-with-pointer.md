# 0023. `run-retro`'s cache-lags-source gate stays skill-local, with a bidirectional `CLAUDE.md` pointer

- **Status:** accepted
- **Date:** 2026-08-03
- **Issue:** #201

## Context

#201 added a gate to `run-retro` §1: inside the plugin repo, verify every
retro finding against working-tree `plugin/` source before proposing it,
because the skills and agents a session just exercised ran from the
**installed cache**, which lags `plugin/` between releases (see `CLAUDE.md`'s
existing dogfooding caveat). While planning it via `plan-task`'s
full-proposal shortcut, the `AskUserQuestion` checkpoint offered three scope
options for where the gate's guidance should live:

- (a) `run-retro/SKILL.md` only.
- (b) that, plus a cross-reference from `CLAUDE.md`'s dogfooding caveat.
- (c) that, plus generalizing the cache-lags-source hazard into
  `plugin/docs/development-principles.md` as a shared principle.

**Retroactive note.** This record was authored after PR #205 shipped, in the
same session. The orchestrator initially judged the fork to be conventional
scope placement and skipped the ADR; #207 then clarified `plan-task`'s ADR
threshold with a surface-vs-scope-width tiebreak (see Decision below), under
which this fork does qualify. This record is the worked example that
motivated that clarification, not a decision made independently of it.

## Decision

Option (b): keep the gate **skill-local** in `run-retro/SKILL.md` §1, and
make the existing `CLAUDE.md` dogfooding caveat point at it, so the link is
bidirectional — the caveat is where a maintainer already looks when a
dogfooded skill misbehaves, and it now names the gate as the concrete
consequence; the gate, in turn, is one instance of the hazard the caveat
describes.

This fits the architecture as follows: `run-retro/SKILL.md` §2 already
carries a plugin-repo-conditional note (which files a plugin-repo retro
edits) — the new §1 gate is that note's sibling, same conditionality,
different phase (whether a finding is real, vs. which files to touch). No
new config surface, template, or agent is introduced; the change is entirely
within the existing skill-body-plus-`CLAUDE.md` documentation surface.

**Why this is a surface decision, not a scope-width one (the #207
tiebreak).** All three options did the *same amount of work* in the sense
that mattered to #201's ask — none of them changed what the gate checks or
when it fires. What varied was **which component owns the guidance**: one
skill's body, that plus a maintainer doc, or a citable shared principle. That
is a surface choice (architecture: where does this live and why), which is
exactly the kind of fork #207 says warrants a record even when the delta
looks small — as opposed to a scope-*width* fork (do more or less of the same
kind of work), which doesn't automatically need one.

## Compromise

**Rejected: (c), promote to `development-principles.md` as a shared
principle.** `plugin/docs/development-principles.md` is runtime-imported
reference content shipped to consumers. The hazard it would describe — a
dogfooded plugin's cache lagging its own source — exists only in *this*
repo: no consuming repo dogfoods the plugin it installs. A principle stated
there would never fire for its actual audience, so it would add citable
surface with no citing use.

**Rejected: (a), `run-retro` only, no `CLAUDE.md` pointer.** Cheaper, and
arguably sufficient since the gate already lives where it fires. Rejected as
under-linked: `CLAUDE.md`'s dogfooding caveat is the entry point a maintainer
reaches for first when a dogfooded skill misbehaves, and a one-way link
(gate → caveat, implicitly) would leave the gate undiscoverable from there.
Making the pointer bidirectional costs one sentence and closes that gap.

## Consequences

Guidance about the same hazard now lives in two places by design — the
skill body carries the gate itself, `CLAUDE.md` carries the caveat plus a
pointer to it — so they must be kept in sync if either changes (e.g. if the
gate's mechanics move within `run-retro/SKILL.md`, the `CLAUDE.md` pointer's
wording should be re-checked).

Follow-up #206 extends the `CLAUDE.md` side to cover the *missing-instruction*
half of the same hazard (a cache that lacks a gate the source has since
added, distinct from stale-wording drift), which this skill-local gate
structurally cannot address on its own since it only fires once `run-retro`
itself is invoked from working-tree source.
