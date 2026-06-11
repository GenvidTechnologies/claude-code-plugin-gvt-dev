# 0002. Two-surface pattern for external-system config

- **Status:** accepted
- **Date:** 2026-06-09
- **Issue:** #29 (origin; refined in #34 and #48)

## Context

Retroactive record. A skill sometimes needs project-specific config for an external system
the plugin can't infer (a bug tracker, CI, a dashboard). The plugin must stay
tool-agnostic — it can't hardcode one tracker — yet a skill still needs both
machine-readable access mechanics AND human-readable conventions and policy.
`triage-issues` was the first skill to hit this problem. The pattern crystallized across
the `triage-issues` work and its follow-on issues.

## Decision

Split external-system config across four surfaces rather than hardcoding one tool or
stuffing prose into JSON:

1. **Structured access mechanics** → a namespaced top-level block in `.genvid-agent.json`
   (e.g. `bugTracker`: queries, command templates, key/label names). Lean, machine-read.
   Declared `required: false` in the skill's `metadata.expects`.
2. **Prose conventions + recipes** → a doc under the consuming repo's `docs/` (e.g.
   `docs/issue-triage.md`): taxonomy, policy, tracker-specific recipes, located by fixed
   headings.
3. **A bundled template** alongside the skill that it offers to scaffold when the doc is
   absent (never guess conventions) — possibly multiple variants auto-selected by probing
   the repo.
4. **A read-only exploration agent** (e.g. `issue-triage-analyst`) that does the
   fetching/analysis off the main thread and returns a structured report.

Architecture: separates the machine-read contract (JSON block) from the human-read contract
(docs + template) from the off-thread exploration (agent), so the orchestrator skill keeps
its context for decisions and writes.

## Compromise

Alternatives rejected:

- **Hardcode one tracker (GitHub-only)** — breaks tool-agnosticism.
- **Put all conventions as prose inside `.genvid-agent.json`** — JSON is a poor home for
  taxonomy/policy prose and recipes.
- **Put everything in a doc** — the machine-read access mechanics need structure a skill
  can reliably parse.

The four-surface split was chosen so each kind of information lives where it is cheapest to
read and maintain. Cost: more moving parts per external system, and the skill author must
keep the `required: false` declaration honest so the audit's aggregated contract isn't
widened.

## Consequences

Reused by `plan-next-issue` and any future external-system skill; now a documented
convention in this repo's `CLAUDE.md` ("two-surface pattern"). The `required: false`
declaration keeps unrelated repos from failing the audit. Template variants (structured vs.
flat-label) can be auto-selected by probing the repo. Pattern was refined across #34
(flat-label variant) and #48 (non-defect issues).
