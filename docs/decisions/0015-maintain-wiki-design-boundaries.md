# 0015. maintain-wiki design boundaries: repo-root placement, standalone lint, thin ingest

- **Status:** accepted
- **Date:** 2026-07-21
- **Issue:** #143

## Context

Planning #143 designed `maintain-wiki` — a three-tier, markdown-only LLM-wiki
practice (`raw/` immutable captures → `wiki/` LLM-maintained pages →
`docs/wiki-schema.md` maintenance rules) exposing `ingest`, `query`, and `lint`
verbs. Three cross-cutting design questions came up during planning that don't
belong in the transient plan.md: where the wiki's tiers should live relative to
`docs/`, whether `lint` should be wired into the existing `audit-conventions`
gate, and whether `ingest` should reuse or rewrite the shipped `run-retro` /
`condense-lessons` skills.

## Decision

**1. `wiki/` and `raw/` live at the repo root, not under `docs/`.** The
`audit-conventions` hygiene scanners share one candidate-file walk
(`listCandidateFiles` in `plugin/skills/audit-conventions/scripts/lib/hygiene.mjs`)
that covers `docs/**.md` plus the repo-root `CLAUDE.md`. Rooting the wiki's two
churning/accumulating tiers outside that walk means they are never subject to
scanners built for curated docs: `raw/` legitimately holds retired tokens and
dead links as part of its captured-source record (the same "correct-as-history"
exemption the scanners already grant `CHANGELOG.md` and `docs/superpowers/` via
`excludePaths`), and `wiki/` pages churn on a different cadence than curated
reference docs. The maintenance-rules *schema* doc (`docs/wiki-schema.md`) is
the one wiki artifact that stays under `docs/` — it's curated, indexed in
`docs/TOC.md`, and hygiene-covered like any other reference doc.

**2. `lint` is a standalone `maintain-wiki` verb, never wired into
`audit.mjs`.** Wiki content-health (dead links, orphaned pages, staleness,
optional `raw/` immutability) is only meaningful for a repo that has adopted
the wiki practice. Folding it into the audit would run it unconditionally on
every consuming repo and risk a non-zero audit exit driven by wiki content
issues rather than plugin-contract violations. Keeping `lint` a skill verb,
invoked on demand, keeps a consuming repo's audit exit code independent of
wiki health. This also draws the line with sibling issue #146, which owns
audit-side *detection/migration* of the practice (does a repo have a wiki?
offer to scaffold/migrate it) — a distinct concern from #143's `lint`, which
owns *content health* of a wiki already in place.

**3. `ingest` is a new, thin verb — not a rewrite of `run-retro` or
`condense-lessons`.** Those are shipped, consumer-visible skills operating on
different tiers: `run-retro` on the live session, `condense-lessons` on
`docs/lessons-learned.md`. Neither owns the `raw/` → `wiki/` tier. `ingest`
becomes the wiki's own entry point — reading unabsorbed `raw/` captures or
freshly handed-in insight, dispatching `gvt-dev:tech-writer` to author or
update a `wiki/` page under the create-vs-update rule in
`docs/wiki-schema.md`. `run-retro` and `condense-lessons` each gain one
additive cross-reference line pointing at `ingest` as a durable home an
extracted insight can land in, rather than being rewritten to target the wiki
directly.

## Compromise

Alternatives rejected:

- **Nest the wiki under `docs/wiki/` and `docs/raw/`.** Simpler single-root
  layout, but it puts exactly the content designed to accumulate raw history
  and LLM churn inside the scanners' walk — the scanners would need a bespoke
  new exclusion for a tier that, by design, isn't docs-hygiene content in the
  first place. Repo-root placement sidesteps the scanner boundary entirely
  instead of growing another exclusion.
- **Wire `lint` into `audit.mjs`.** Would give wiki health a "free" check on
  every audit run, but couples an optional, repo-specific practice's content
  quality to the plugin-contract gate every consuming repo runs, and blurs the
  boundary with #146's detection/migration scope. Keeping `lint` a separate
  verb keeps both concerns — and their failure/exit semantics — independent.
- **Rewrite `run-retro`/`condense-lessons` to write directly into `wiki/`.**
  Would collapse two ingest surfaces into one, but both are shipped skills
  used by repos with no wiki at all; retargeting them is a breaking change to
  non-wiki consumers for no gain. The cost of the chosen path is two ingest
  surfaces coexisting, mitigated by the additive cross-reference lines and by
  the two surfaces operating on genuinely distinct tiers (session/lessons-doc
  vs. raw/wiki).

## Consequences

`maintain-wiki`'s scaffold step (§0) writes `wiki/`, `raw/` at the repo root
and only `docs/wiki-schema.md` under `docs/` (indexed in `docs/TOC.md`).
`audit-conventions`'s hygiene scanners need no new exclusion entries for the
wiki tiers — they're simply outside the walked paths. A consuming repo can
adopt the wiki practice without any change to its audit exit code, and can run
`lint` as often or as rarely as it wants. `run-retro` and `condense-lessons`
carry one new cross-reference line each; #146 remains free to build
detection/migration on top of this same repo-root layout.
