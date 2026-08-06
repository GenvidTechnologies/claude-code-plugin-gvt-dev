# 0027. Two-sided pillar coverage via an opt-in scalar `metadata.pillar`

- **Status:** accepted
- **Date:** 2026-08-05
- **Issue:** #227 (part of epic #142)

## Context

Epic #142 evolves the plugin into a four-pillar practice layer (Spec /
Verify / Environment / Moldable). #143–#145 shipped the practices
themselves; #227 is the *detect and report* half — extending
`audit-conventions` from "contract-present" (does the repo have the
required files/config/tools?) to "practice-present" (has each pillar's
practice actually been adopted?). The report is two-sided by design: it
shows both **plugin-side pillar coverage** (does `gvt-dev` itself cover all
four pillars?) and **consumer-side practice adoption** (has this repo
adopted each practice?).

## Decision

**1. Where the pillar declaration lives and how it is encoded.** A single
YAML plain scalar `metadata.pillar` in component frontmatter, **opt-in** on
the 11 components epic #142's own "Where we stand today" table names as a
pillar's implementation — not all 32 plugin components. `lib/pillars.mjs`'s
`parsePillars()` splits the scalar on commas, so a future
`pillar: spec,verify` works with zero parser or schema change.

Rejected alternative: extending `lib/frontmatter.mjs` to parse real YAML
scalar sequences (`pillar:\n  - spec`). That parser is deliberately minimal
and cannot handle a block sequence — it silently yields `[{}, {}]`, verified
by a live probe — so a comma-delimited scalar gives the multi-pillar seam
for free with zero parser change, zero schema change, and zero migration.
This is a **surface** decision, not merely a width one: the rejected option
puts the change in the parser every component's frontmatter flows through,
where a comma-delimited scalar confines it to the one new key.

Also rejected: declaring a pillar on all 32 components. That would
manufacture census data rather than record it, and make "imbalance" measure
decomposition granularity instead of coverage.

**2. The report is a section carrying zero findings, not a set of
findings.** `lib/pillar-report.mjs` renders a new `### Practice Coverage`
section that contributes no findings to the audit's result set. This makes
the constraint structural rather than intentional: a missing practice
*cannot* move the audit's exit code, because `hasErrors` only counts
`error`-severity findings and this section emits none.

Rejected alternative: emitting findings for un-adopted practices. The audit
aggregates expectations across all consuming repos, so anything
error-severity here would fail every repo that hasn't adopted a given
practice. `principle-citation`'s precedent for an author-time `error`
(ADR-0019) explicitly does not transfer: that check is confined to this
repo's own tree (`AUDITING_PLUGIN_SOURCE`-gated), while a practice-adoption
check runs against every consumer.

**3. Two pillars are represented as deliberate non-detection, each citing
its own record.** Moldable renders `n/a by design` citing **ADR-0018**:
`build-probe` ships no config block, doc, template, agent, or repo artifact
— a recorded deviation from the five-part pattern, so there is nothing for
`practice-detect.mjs` to look for. Verify renders `not detectable` citing
**#160**: `write-eval` never shipped (#145 delivered only its
acceptance-criteria half), so no eval artifact exists to detect. These are
honest representations of a real, already-recorded state, not gaps to be
filled — inventing a detector for either pillar would silently overturn a
decision made elsewhere.

**Architecture.** `practice-detect.mjs` is presence-only: six explicit
`fs.stat`s (`<wikiDir>/`, `<wikiDir>/index.md`, `<wikiDir>/log.md`,
`<rawDir>/`, `docs/wiki-schema.md`, the `wiki` config block) classify a
repo's Environment adoption as `absent` / `partial` / `adopted`; it never
`readdir`s and never reads a page body. `lib/pillars.mjs` separately
computes plugin-side coverage from the declared `metadata.pillar` values
across `plugin/skills/*/SKILL.md` and `plugin/agents/*.md`. The two halves
share nothing but the `PILLARS` table and are rendered together in one
report section.

## Compromise

Keyed to the decision each alternative was rejected under.

- **(1) Parse real YAML scalar sequences in `lib/frontmatter.mjs`.**
  Rejected: the minimal parser cannot handle a block sequence and would
  need real work to gain it, for a multi-pillar case the comma-delimited
  scalar already covers at zero cost.
- **(1) Declare `metadata.pillar` on all 32 components.** Rejected: it
  would manufacture census data for components that serve repo mechanics,
  not a pillar, and turn "imbalance" into a decomposition-granularity
  artifact rather than a coverage signal.
- **(2) Emit findings (even `warning`) for un-adopted practices.**
  Rejected on the same aggregation logic that keeps every other
  `required: false` expectation from becoming a universal requirement — a
  practice's absence is a fact to report, not a defect to flag, and the
  audit has no per-repo opt-out mechanism for a finding.
- **(3) Invent a detectable artifact for Moldable or a shipped-eval
  fixture for Verify.** Rejected: both pillars have a real, already-accepted
  record of why no artifact exists (ADR-0018; #160/#145's split). Detecting
  around that record would silently contradict it instead of reporting it.

**What this costs.** Opt-in declaration means the census reflects a curated
judgment about which components are practice-layer, not a mechanical
property — a new practice-layer component that forgets to declare
`metadata.pillar` is invisible to the coverage table. This is mitigated only
by a test (`pillars.test.mjs`) asserting the declaring set matches the
intended 11 exactly, not by anything structural. The comma-delimited
encoding is a stringly-typed seam rather than real YAML, chosen deliberately
over widening the shared parser. And consumer-side detection is
presence-only: it can tell you a wiki *exists*, never that it is *healthy*
— content health belongs to `maintain-wiki lint`, which ADR-0015 §2
deliberately kept out of the audit so wiki content issues can never drive a
non-zero audit exit.

## Consequences

- `audit-conventions` gains a `### Practice Coverage` section that is
  purely informational: the T11 regression guard (mirroring
  `hygiene-wiring.test.mjs`) asserts a missing practice leaves
  `result.status === 0`.
- A future practice-layer component must remember to declare
  `metadata.pillar`; nothing enforces that beyond the exact-match test named
  above. Silence there is a silent coverage gap, not a build failure.
- The comma-delimited `metadata.pillar` scalar is now load-bearing
  precedent: the next multi-pillar component follows this encoding rather
  than reopening the sequence-vs-scalar question.
- #228 (the `--fix` half of the split #146) depends on this report shipping
  first, since it scaffolds practice adoption for repos this report
  identifies as `absent` or `partial`.
