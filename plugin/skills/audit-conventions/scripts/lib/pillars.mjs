// The four-pillar practice layer (epic #142): Spec / Verify / Environment /
// Moldable. This module is data-only — it supplies the pillar table, the
// `metadata.pillar` scalar reader, and the coverage grouper. Rendering the
// coverage report is a different module's job.
//
// `PILLARS` is deliberately self-describing (`detectability` + `naReason`)
// rather than a bare id/label pair, because two of the four pillars have no
// consumer-side artifact for the audit to detect at all:
//   - `verify` — #160: `write-eval` never shipped, so there is nothing to look
//     for; a component can't yet declare this pillar in a way the audit could
//     confirm against a real artifact.
//   - `moldable` — ADR-0018: `build-probe` deliberately ships no config
//     block, doc, template, agent, or repo artifact — the absence is the
//     design, not a gap.
// Carrying `naReason` alongside those two keeps the "why can't this be
// detected" context next to the data, instead of only in prose a renderer
// would have to duplicate.
export const PILLARS = [
  {
    id: 'spec',
    label: 'Spec',
    detectability: 'has a consumer-side signal',
  },
  {
    id: 'verify',
    label: 'Verify',
    detectability: 'not detectable',
    naReason: '#160 — write-eval never shipped, so there is no consumer-side artifact to detect',
  },
  {
    id: 'environment',
    label: 'Environment',
    detectability: 'fully detectable (the wiki)',
  },
  {
    id: 'moldable',
    label: 'Moldable',
    detectability: 'n/a by design',
    naReason: 'ADR-0018 — build-probe deliberately ships no config block, doc, template, agent or repo artifact',
  },
];

// Reads the `metadata.pillar` frontmatter scalar into a list of pillar ids.
// `lib/frontmatter.mjs` is a deliberately minimal parser that cannot parse
// YAML scalar sequences (`pillars:\n  - Spec` silently yields `[{}, {}]`), so
// multi-pillar declarations use a comma-delimited single scalar instead
// (`pillar: spec, verify`). This is the reader for that encoding.
export function parsePillars(raw) {
  if (raw == null) return [];
  return String(raw).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

// Groups component names by declared pillar id. `components` is an array of
// `{ name, pillar }` entries, where `pillar` is the already-parsed raw value
// (a comma-delimited scalar, or an array of ids — parsePillars is applied to
// each entry's pillar field via this function's own parsing so callers can
// pass the raw frontmatter value straight through).
//
// Every pillar in PILLARS is always a key in the result, even with zero
// declarers — that empty-array condition is the seam a "pillar gap" report
// fires on, so it must be representable rather than omitted.
export function computePluginCoverage(components) {
  const coverage = {};
  for (const { id } of PILLARS) coverage[id] = [];

  for (const component of components ?? []) {
    const ids = parsePillars(component.pillar);
    for (const id of ids) {
      if (coverage[id]) coverage[id].push(component.name);
    }
  }

  return coverage;
}
