# 0011. create-adr skill: dispatch to tech-writer, shared template, and third-writer safety

- **Status:** accepted
- **Date:** 2026-07-01
- **Issue:** #108

## Context

The `create-adr` skill lets a user invoke ADR authoring directly — outside a `plan-task` run — while still producing records that match the MADR-lite convention and are indexed in `docs/TOC.md`. Three non-trivial design decisions arose: where the writing logic should live, who should own the ADR template now that it has multiple callers, and how to contain the risk of a skill that bulk-edits a shared, cross-linked store.

Pleasing recursion: `create-adr` is its own first customer, but this very record was authored via the existing `tech-writer` dispatch path — the separation of skill entry-point from writing agent was working before the skill shipped.

## Decision

**1. Share-by-dispatch, not duplicate.** `create-adr` is a thin orchestrator that dispatches the existing `gvt-dev:tech-writer` agent for scaffold, fill, numbering, and TOC-indexing. `tech-writer` is the single canonical owner of that logic. `create-adr` owns only the user-facing entry point: gathering context, presenting a dry-run preview, and reporting what changed. It does no writing itself.

**2. Promote `decision-record.template.md` to shared plugin content.** The MADR-lite template moves from `plugin/skills/plan-task/` — where its location falsely signalled plan-task-private ownership — to `plugin/docs/`, the neutral shared-reference home alongside `development-principles.md`. This is a **move** (single canonical owner preserved), not a copy. Three co-equal consumers now reference it from `${CLAUDE_PLUGIN_ROOT}/docs/decision-record.template.md`: `plan-task` Phase 4, `tech-writer` standalone, and `create-adr`. All referrers are repointed; no stub or forwarding copy is left behind.

**3. Accept `create-adr` as a third writer of a shared store, gated by a clean tree.** `docs/decisions/*.md` and `docs/TOC.md` are written by three paths: `plan-task → tech-writer`, `tech-writer` standalone, and `create-adr`. The risk is not a race (all writers are user-invoked, never concurrent) but blast radius: `create-adr`'s chronological-insertion renumber touches many existing ADR files, headings, TOC rows, and cross-references in one operation, versus tech-writer's single append. Mitigations baked in: a **clean-tree precondition** (makes the change git-recoverable), a **dry-run-then-confirm-before-apply** flow, a **highest-down `git mv` order** (prevents collision mid-rename), and a **"report ambiguous textual references, never blind-replace"** rule for cross-document mentions.

Architecture: the dual-writer anti-pattern (see #95) is avoided because `create-adr` delegates all writes to `tech-writer`; the template has exactly one canonical location; the third-writer blast-radius risk is contained by the gate-and-dry-run flow rather than by restricting access.

## Compromise

Alternatives rejected:

- **Fully standalone skill that re-implements scaffold / fill / number / index** — would create a second independent writer of `docs/decisions/` + `docs/TOC.md`, duplicating `tech-writer`'s logic and introducing format/behaviour drift over time: the exact dual-writer anti-pattern the designer and code-reviewer guard against (#95). The single owner is reused by dispatch.
- **Copy the template to `plugin/docs/` while keeping the original in `plugin/skills/plan-task/`** — a copy guarantees the two copies diverge; the move is the only way to preserve a single canonical source.
- **Block `create-adr` from renumbering; append-only** — renumbering is the core value proposition (chronological insertion maintains logical sequence); restricting it to append-only makes `create-adr` a weaker alias for direct `tech-writer` dispatch, not a distinct skill.

The cost: `create-adr` must re-establish the highest existing ADR number at runtime on every invocation (no caching), and the dry-run confirmation step adds a round-trip for simple cases — both judged worthwhile given the blast radius.

## Consequences

`plan-task` Phase 4's template reference and `tech-writer`'s bundled path both update to `${CLAUDE_PLUGIN_ROOT}/docs/decision-record.template.md`; the `docs/TOC.md` Components row is updated to reflect the new location. The `docs/decisions/` store gains a third authoring path, all gated by the same `tech-writer` implementation and the same MADR-lite template — so format consistency is structural, not aspirational.
