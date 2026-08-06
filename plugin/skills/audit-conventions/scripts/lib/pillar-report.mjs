// Renders the "### Practice Coverage" section of the audit report: one row
// per pillar (Spec / Verify / Environment / Moldable), showing both sides —
// the plugin-side census (which components declare `metadata.pillar`, via
// `computePluginCoverage`) and the consumer-side adoption verdict for the
// pillars that have one.
//
// Pure rendering only — no findings, no severity is constructed here. That
// is what makes it structurally impossible for a missing practice to affect
// the audit's exit code. See `pillars.mjs`'s own doc comment for why two of
// the four pillars (`verify`, `moldable`) have no consumer-side artifact to
// detect at all; this module never invents that reasoning — it reads it
// straight off `PILLARS[*].naReason`.

import { PILLARS, computePluginCoverage } from './pillars.mjs';

// Adoption verdicts a caller may pass in (mirrors the shape a wiki-style
// detector like `detectWikiAdoption` returns: `verdict` is one of these
// three strings). A pillar with no naReason but no adoption entry either
// (nothing has been wired up to detect it yet) renders as 'not evaluated'
// rather than silently reading as 'not adopted'.
const VERDICT_TEXT = {
  adopted: 'adopted',
  partial: 'partial adoption',
  absent: 'not adopted',
};

function adoptionCellFor(pillar, adoption) {
  // The two n/a pillars always render their own naReason, regardless of
  // what (if anything) the caller passed for them — there is nothing a
  // detector could contribute here.
  if (pillar.naReason) {
    return `${pillar.detectability} (${pillar.naReason})`;
  }
  const verdict = adoption?.[pillar.id];
  return VERDICT_TEXT[verdict] ?? 'not evaluated';
}

function componentsCellFor(pillar, coverage) {
  const names = coverage[pillar.id] ?? [];
  return names.length > 0 ? names.join(', ') : '(none)';
}

export function formatPracticeCoverage(pluginCensus, adoption) {
  if (!PILLARS || PILLARS.length === 0) return '';

  const coverage = computePluginCoverage(pluginCensus);

  const lines = [];
  lines.push('### Practice Coverage');
  lines.push('');
  lines.push('| Pillar | Components | Adoption |');
  lines.push('| --- | --- | --- |');
  for (const pillar of PILLARS) {
    lines.push(
      `| ${pillar.label} | ${componentsCellFor(pillar, coverage)} | ${adoptionCellFor(pillar, adoption)} |`,
    );
  }

  const gaps = PILLARS.filter((p) => (coverage[p.id] ?? []).length === 0);
  if (gaps.length > 0) {
    lines.push('');
    lines.push(`> Pillar gap: ${gaps.map((p) => p.label).join(', ')} — no declaring components yet.`);
  }

  return lines.join('\n');
}
