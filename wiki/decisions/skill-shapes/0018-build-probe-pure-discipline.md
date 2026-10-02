# 0018. build-probe adopts a pure-discipline shape, deviating from the five-part pattern

- **Status:** accepted
- **Date:** 2026-07-24
- **Issue:** #144 (part of epic #142)

## Context

Epic #142 (the practice-layer epic) assigns `build-probe` the Moldable pillar:
state a checkable question, scaffold a throwaway probe in the scratchpad, run
it against the real system, report the concrete result on-thread, then
promote or discard. Epic #142's cross-cutting constraints direct new
practice-layer skills to follow the established five-part `triage-issues`
pattern (a namespaced `.gvt-agent.json` block, a prose doc under `docs/`, a
bundled scaffold template, a `docs/TOC.md` self-index, and a read-only
analyst agent — see `docs/decisions/0006-two-surface-external-system-pattern.md`)
"where relevant." Task 5 (#144) designed `build-probe` and had to decide how
much of that apparatus actually applies.

## Decision

**1. Pure-discipline (Option A) over the fuller apparatus.** The five-part
pattern exists to tame *external-system integration* — a bug tracker, CI, a
dashboard: structured access mechanics plus prose conventions plus a scaffold
plus an exploration agent. A probe integrates with **no external system**; it
investigates the repo already at hand. Its nearest neighbours are the other
pure-discipline skills, `run-retro` and `condense-lessons` (a single
`SKILL.md`, light `metadata.expects`, no bundled agent or config block), not
`triage-issues`/`maintain-wiki`. "Follow the five-part pattern where
relevant" resolves, on the merits, to *almost none of it is relevant*:
`build-probe` ships as one `SKILL.md` with no bundled scripts, no analyst
agent, no namespaced config block, and no scaffold template.

**2. No read-only analyst/probe subagent.** This is the sharpest point.
`triage-issues` dispatches an analyst because reading the whole corpus *is*
the work and belongs off the main thread. A probe exists precisely to answer
a question **without** reading the whole corpus — the probe *is* the
exploration mechanism, sized to one question. Step 4 of the skill's loop
requires reporting the concrete result **on the deciding thread**: off-
threading the probe run to a subagent that hands back a one-line summary
would throw away exactly the raw signal the promote/discard decision (Step 5)
needs to see. An analyst subagent here wouldn't just add nothing — it would
contradict the skill's premise. (Contrast `condense-lessons`, which fans out
to subagents because *writes* are its bottleneck; a probe has no such
bottleneck.)

**3. No bundled generic probes shipped.** Three candidate generic probes were
considered — a frontmatter/`metadata.expects` dumper, a TOC-versus-components
drift probe, a CHANGELOG-versus-version probe. All three (a) overlap checks
`audit-conventions` already owns (`readme-inventory`, `orphaned-doc`), and
(b) are plugin-repo-specific rather than generic across consuming repos.
Shipping any of them would violate the epic's "ship discipline plus maybe
generic probes, never a probe library" constraint. More fundamentally, a
shipped generic probe is exactly what the skill's own promote-when-recurring-
and-generic rule (Step 5) would *produce* — pre-shipping one skips the very
discipline the skill teaches. The generic-probe question resolves to: none
ship; the skill body carries one in-body worked example instead, which
honestly ends in *discard* rather than a manufactured promotion.

Architecture: `build-probe` sits in the practice layer as the Moldable pillar
alongside the Spec, Verify, and Environment pillars (epic #142), but unlike
those it has no consuming-repo config surface at all — it reads `CLAUDE.md`
(optionally) to understand the target system and otherwise touches nothing
durable until a probe is explicitly promoted, at which point promotion is the
author's own decision about where the promoted tool belongs (see
Consequences).

## Compromise

Alternatives rejected:

- **Option B — discipline plus 2-3 bundled generic probes.** Rejected because
  the candidate probes fail the genericness bar (plugin-repo-specific),
  duplicate checks `audit-conventions` already runs, and contradict the
  epic's explicit "never a probe library" constraint.
- **Option C — scaffold template plus an off-thread probe subagent.**
  Rejected because a committed scaffold template contradicts "throwaway" (the
  scratchpad *is* the mechanism that keeps discard the zero-effort default,
  per the skill body), and an off-thread subagent hides the raw result the
  on-thread promote/discard decision depends on.

Deliberately deferred, not decided here: no promoted-tool *home* convention
for consuming repos is defined by this record. A consuming repo owns wherever
its promoted tools already live (a `scripts/` or `tools/` directory, its own
convention); prescribing one now would be premature given `build-probe` has
not yet been exercised against a real promotion.

## Consequences

`plugin/skills/build-probe/` holds only `SKILL.md` — no `scripts/`,
`docs/build-probe.*.md`, config block, or bundled agent. `audit-conventions`
keeps sole ownership of this repo's standing contract-drift checks; the skill
body's scope disclaimer makes that explicit so no one reads the skill as a
second source of such checks. The epic's "follow the five-part pattern where
relevant" constraint is satisfied by an explicit, recorded justified
deviation rather than by silence — mirroring how
`docs/decisions/0015-maintain-wiki-design-boundaries.md` recorded
`maintain-wiki`'s own boundary decisions for the prior epic building block. A
future maintainer tempted to add an analyst agent or bundled generic probes
to `build-probe` should read this record first.
