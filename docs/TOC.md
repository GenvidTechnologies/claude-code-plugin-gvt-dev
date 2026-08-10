# Documentation Index

This repo is the `gvt-dev` **plugin itself**, not a consuming game project — so
its "documentation" is the convention contract and the plugin components, not the
`docs/architecture.md` / `docs/runbook.md` set a consumer would have. Genvid skills
(`plan-task`, `run-retro`, `tech-writer`, …) consult this index to find what to
read and update.

## Plugin contract & guidance

- [`../plugin/CONVENTIONS.md`](../plugin/CONVENTIONS.md) — the public convention contract consuming repos satisfy (canonical source)
- [`../CLAUDE.md`](../CLAUDE.md) — maintainer guide: repo layout, commands, how to add skills/agents, release flow
- [`../README.md`](../README.md) — plugin overview and install instructions
- [`../plugin/docs/development-principles.md`](../plugin/docs/development-principles.md) — the philosophy behind the analysis → design → planning pipeline (incl. principle #7: five-dimension doc coverage + decision records)
- [`plugin-authoring.md`](plugin-authoring.md) — cross-plugin authoring gotchas (shipping MCP servers via `plugin.json`; `npx` package-name resolution; version pinning)

## Process

- [`issue-triage.md`](issue-triage.md) — this repo's dogfooded issue-triage conventions (types, priorities, labels, required fields, splitting/duplicate/dependency policy, and the `gh` mutation recipes) consumed by `/gvt-dev:triage-issues` and the `issue-triage-analyst`; access mechanics live in `.gvt-agent.json`'s `bugTracker` block

## Components

Each skill and agent carries its own documentation in its frontmatter (`metadata.expects`) and body:

- `../plugin/skills/*/SKILL.md` — one directory per skill
- `../plugin/agents/*.md` — flat agent definitions (analyst, designer, planner, code-reviewer, ts-implementer, tech-writer, validator, issue-triage-analyst)
- `../plugin/skills/triage-issues/SKILL.md` — interactive issue-backlog triage; reads project conventions from a consuming repo's `docs/issue-triage.md` + `bugTracker` block (scaffolds from `issue-triage.template.md` or the flat-label `issue-triage.flat.template.md`, auto-selected per the repo's label scheme — see SKILL.md §0)
- `../plugin/skills/plan-next-issue/SKILL.md` — orchestrator that goes backlog → plan: optionally triages (`triage-issues`), proposes a ranked shortlist of issues, then hands the choice to `plan-task`
- `../plugin/skills/reconcile-mcp-pin/SKILL.md` — maintainer skill: after a bundled MCP server pin is bumped in `plugin.json`, reconcile the agents' hand-enumerated tool inventories (read/mutate split, count-sanity-checked `npm pack` surface, stale-version sweep) and hand off to `release-plugin`
- `../plugin/skills/migrate-cordova-ci/SKILL.md` — migrate a Cordova plugin's CI/CD from CircleCI to GitHub Actions; bundles parameterized `android.yml`/`ios.yml` (smoke + distribute tiers) + `version-guard.js` templates (lifted from `cordova-plugin-marketplace`), encodes the 8 known CI gotchas, and runs a manual live-CI gate
- `../plugin/skills/maintain-wiki/SKILL.md` — maintain a project's LLM-wiki compounding-memory knowledge base (`ingest`/`query`/`lint`); scaffolds the three-tier `raw/`/`wiki/`/`docs/wiki-schema.md` layout; carries the `wiki-librarian` agent for its read-only `query` phase
- `../plugin/skills/build-probe/SKILL.md` — the Moldable pillar of the practice layer: state a checkable question → scaffold a throwaway probe in the scratchpad → run against the real system → report on-thread → promote or discard. Pure-discipline skill (SKILL.md only), operationalizing `development-principles.md` #1/#3 (see ADR-0018)
- [`create-adr`](../plugin/skills/create-adr/SKILL.md) — author or chronologically insert an ADR on demand; dispatches `tech-writer` for scaffold/fill/index, owns the numbering + renumber-and-sweep
- [`../plugin/docs/decision-record.template.md`](../plugin/docs/decision-record.template.md) — MADR-lite decision-record (ADR) template; `tech-writer` scaffolds it into a consuming repo's `docs/decisions/` when dispatched from `plan-task` Phase 4 or the `create-adr` skill (see development-principles principle #7)

## Decision Records

This repo dogfoods the ADR convention it ships (see `development-principles.md` principle #7). Records live in `docs/decisions/` using the MADR-lite template at `plugin/docs/decision-record.template.md`, numbered in chronological decision order.

- [`decisions/0001-skills-as-directories-agents-as-flat-files.md`](decisions/0001-skills-as-directories-agents-as-flat-files.md) — why skills are directories (carrying supporting files) while agents are flat, stateless files
- [`decisions/0002-self-declaring-skill-contract.md`](decisions/0002-self-declaring-skill-contract.md) — why each component declares its prerequisites in `metadata.expects` and the audit aggregates them (with the `required: false` lever)
- [`decisions/0003-plugin-root-path-substitution.md`](decisions/0003-plugin-root-path-substitution.md) — why shared reference docs are cited via `${CLAUDE_PLUGIN_ROOT}/docs/…` rather than absolute or relative paths
- [`decisions/0004-agent-pipeline-with-user-checkpoints.md`](decisions/0004-agent-pipeline-with-user-checkpoints.md) — why `plan-task` runs analyst → designer → planner as separate agents with a user checkpoint between phases
- [`decisions/0005-git-subdir-plugin-layout.md`](decisions/0005-git-subdir-plugin-layout.md) — why the plugin lives under `plugin/` and ships via git-subdir rather than at the repo root or as a separate mirror
- [`decisions/0006-two-surface-external-system-pattern.md`](decisions/0006-two-surface-external-system-pattern.md) — why external-system config is split across a JSON block, a prose doc, a bundled template, and an exploration agent
- [`decisions/0007-five-dimension-doc-and-adr-convention.md`](decisions/0007-five-dimension-doc-and-adr-convention.md) — why durable architecture + compromise rationale lands in a committed decision record instead of the transient plan
- [`decisions/0008-orchestrator-owns-commit.md`](decisions/0008-orchestrator-owns-commit.md) — why dispatched implementers stage but don't commit, and the validator gate runs before the orchestrator's commit
- [`decisions/0009-finish-quality-over-additional-scope.md`](decisions/0009-finish-quality-over-additional-scope.md) — why finish-quality of touched code is part of a change's definition of done (principle #8) and can't be deferred
- [`decisions/0010-agent-dispatch-guide-domain-explorers.md`](decisions/0010-agent-dispatch-guide-domain-explorers.md) — why `plan-task` Phase 1 prefers a repo's named domain explorer over the generic analyst when one is declared
- [`decisions/0011-create-adr-skill-dispatch-design.md`](decisions/0011-create-adr-skill-dispatch-design.md) — why `create-adr` delegates all writes to `tech-writer` (not reimplementing), moves the MADR-lite template to `plugin/docs/`, and gates renumber blast radius with clean-tree + dry-run
- [`decisions/0012-stale-config-migration-state.md`](decisions/0012-stale-config-migration-state.md) — why the audit-conventions state detector gets a distinct `stale-config` state for the pre-rebrand `.genvid-agent.json` filename instead of falling through to `greenfield` or reusing `legacy`
- [`decisions/0013-migrated-state-conventions-resync-scoping.md`](decisions/0013-migrated-state-conventions-resync-scoping.md) — why the `--fix` CONVENTIONS.md resync is scoped to the migrated state only, leaving `pushScaffold`'s skip-if-exists intact for greenfield/stale/legacy
- [`decisions/0014-git-tracked-config-scan-for-retired-tokens.md`](decisions/0014-git-tracked-config-scan-for-retired-tokens.md) — why the retired-token scanner's config-file coverage is intersected with `git ls-files` rather than scanned by presence, so untracked local overrides (e.g. `.claude/settings.local.json`) can't trip false positives
- [`decisions/0015-maintain-wiki-design-boundaries.md`](decisions/0015-maintain-wiki-design-boundaries.md) — why `maintain-wiki`'s `wiki/`+`raw/` tiers live at the repo root (outside the hygiene scanners' `docs/**` walk), why `lint` stays a standalone verb never wired into `audit.mjs`, and why `ingest` is a new thin verb rather than a rewrite of `run-retro`/`condense-lessons`
- [`decisions/0016-stale-config-conventions-resync-and-scoped-token-report.md`](decisions/0016-stale-config-conventions-resync-and-scoped-token-report.md) — why the migrated-state CONVENTIONS.md resync (0013) is extracted into a shared `planConventionsResync` helper and reused for the stale-config state, and why the stale-config token report uses a report-local needle set instead of widening `DEFAULT_RETIRED_TOKENS`
- [`decisions/0017-pre-committed-acceptance-criteria.md`](decisions/0017-pre-committed-acceptance-criteria.md) — why `plan-task` pins a `## Acceptance Criteria` checklist (seeded from the design's Test Criteria) to the GitHub issue body before implementation, reusing the existing `bugTracker` block and validator/code-reviewer gate rather than adding a new schema or engine
- [`decisions/0018-build-probe-pure-discipline.md`](decisions/0018-build-probe-pure-discipline.md) — why `build-probe` ships as a pure-discipline skill with no analyst/subagent (would contradict the on-thread-report probe premise) and no bundled generic probes (they'd overlap `audit-conventions` and pre-empt the promote-when-generic rule), deviating from the mandated five-part pattern
- [`decisions/0019-principle-citation-error-severity.md`](decisions/0019-principle-citation-error-severity.md) — why the `principle-citation` content scanner is `error` severity instead of matching the all-`warning` author-time family (`readme-inventory`, `desc-length`, `orphaned-doc`), and why an unparseable principles doc collapses to one finding rather than one per citation
- [`decisions/0020-near-miss-contract-resolution.md`](decisions/0020-near-miss-contract-resolution.md) — why `triage-issues` §0 detects a near-miss conventions doc via a non-recursive filename glob + marker-line grep, resolves it to one of four outcomes (canonical/near-miss/absent/both), defers unattended rather than auto-renaming, and why the check couldn't instead live in `audit-conventions`
- [`decisions/0021-proposal-artifact-cross-check.md`](decisions/0021-proposal-artifact-cross-check.md) — why a full proposal's claims are cross-checked against the artifact it modifies via a shared principle (#13) cited at both `plan-task` entry points, rather than a local-only gate or an artifact-wins-by-default fallback
- [`decisions/0022-okf-bundle-root-is-the-wiki-tier.md`](decisions/0022-okf-bundle-root-is-the-wiki-tier.md) — why the OKF v0.2 bundle root is `<wikiDir>/` (not the repo root or a `wiki/references/` mirror), leaving `<rawDir>/` outside the bundle so the `raw/` immutability rule stands unamended
- [`decisions/0023-skill-local-gate-with-pointer.md`](decisions/0023-skill-local-gate-with-pointer.md) — why `run-retro`'s cache-lags-source verification gate stays skill-local rather than a shared `development-principles.md` principle, with a bidirectional pointer from `CLAUDE.md`'s dogfooding caveat
- [`decisions/0024-okf-concept-page-frontmatter-contract.md`](decisions/0024-okf-concept-page-frontmatter-contract.md) — why the concept-page frontmatter emits the full OKF v0.2 key set rather than the `type`-only minimum, drops the `## Sources` body section while keeping `## Related`, and retires `wiki.decay` in favor of per-page `stale_after`
- [`decisions/0025-okf-consumer-bound-in-the-skill-body.md`](decisions/0025-okf-consumer-bound-in-the-skill-body.md) — why the OKF §11 tolerant-consumer bound (what `lint` and the future mechanical checker may never reject a bundle for) is written in `maintain-wiki`'s skill body rather than the `required: false` schema doc or a new plugin-owned doc, with a bidirectional pointer to the schema copies
- [`decisions/0026-okf-dogfood-migration-semantics.md`](decisions/0026-okf-dogfood-migration-semantics.md) — why the dogfood wiki's OKF v0.2 migration dates `generated.at` from content production rather than the migration, omits `usage_window` (deferring the format defect to #221), prunes `sources[]` to claim-supporting captures, keeps the two out-of-bundle links as a standing advisory, converts exactly one link to the bundle-absolute form, and treats §9's re-render of an existing `log.md` entry as append-only-safe
- [`decisions/0027-pillar-declaration-and-two-sided-coverage-report.md`](decisions/0027-pillar-declaration-and-two-sided-coverage-report.md) — why pillar coverage uses an opt-in comma-delimited `metadata.pillar` scalar on 11 named components rather than a real YAML sequence or a census of all 32, why the coverage report is a zero-finding section so a missing practice can never move the audit's exit code, and why Moldable/Verify render as deliberate non-detection citing ADR-0018 and #160
- [`decisions/0028-single-fetch-tag-aware-delta-check.md`](decisions/0028-single-fetch-tag-aware-delta-check.md) — why `plan-next-issue`'s unreleased-delta check drops §1's explicit-refspec fetch in favor of a whole-remote fetch (tag auto-following requires it) rather than a second `git fetch --tags`, host-API read, or accepting stale local tags, and why the check skips silently on the no-fetch `gh api` fallback path
- [`decisions/0029-combined-plan-canonical-issue.md`](decisions/0029-combined-plan-canonical-issue.md) — why `plan-task`'s Phase 4 pledges a combined plan's `## Acceptance Criteria` checklist to the lowest-numbered target issue only, with a pointer comment on each sibling, rather than full duplication, a per-issue partition, or a `docs/acceptance/<slug>.md` home

## Knowledge Base

This repo maintains an LLM-wiki compounding-memory knowledge base about its
own practice, per `/gvt-dev:maintain-wiki`: immutable captured sources under
the repo-root `raw/`, LLM-maintained pages under the repo-root `wiki/`
(`wiki/index.md`, `wiki/log.md`), and the maintenance rules below. `raw/` and
`wiki/` sit outside `docs/`, so the orphan-doc scanner doesn't index them —
this pointer is here for human/agent discovery.

- [`wiki-schema.md`](wiki-schema.md) — the maintenance schema for this repo's `raw/`/`wiki/` tiers: page format, create-vs-update lifecycle, `raw/` immutability, and the (currently manual, unenforced) decay policy

## Scaffolding sources

- [`../plugin/skeleton/`](../plugin/skeleton/) — pristine placeholder convention files that `audit-conventions --fix` writes to a greenfield repo
- [`../examples/`](../examples/) — a worked, filled-in example consuming-repo (the Bunny game) for reference
