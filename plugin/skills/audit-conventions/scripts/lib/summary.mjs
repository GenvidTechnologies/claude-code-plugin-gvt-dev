import { LOAD_FAILURE_KINDS } from './load-diagnostics.mjs';

// Tallies expectation findings into required/optional met-vs-total counts.
//
// Findings carry a boolean `required` (set for every finding) and a boolean-ish
// `ok` (`ok === true` when satisfied; unsatisfied findings have `ok` absent or
// falsy plus a `severity`). The two buckets are strictly disjoint on `required`
// — a satisfied optional finding (`required: false, ok: true`) must land only
// in the optional bucket, never inflate the required counts. Findings whose
// `required` is neither strictly `true` nor `false` (shouldn't happen, but be
// defensive) are ignored by both buckets.
export function summarizeExpectations(findings) {
  const summary = { requiredMet: 0, requiredTotal: 0, optionalMet: 0, optionalTotal: 0 };

  for (const finding of findings) {
    if (finding.required === true) {
      summary.requiredTotal += 1;
      if (finding.ok === true) summary.requiredMet += 1;
    } else if (finding.required === false) {
      summary.optionalTotal += 1;
      if (finding.ok === true) summary.optionalMet += 1;
    }
  }

  return summary;
}

// Renders the report's Summary section as lines, starting with `### Summary`.
//
// The "unmet" lines derive from the same tally as the ratio lines
// (`requiredTotal - requiredMet`, `optionalTotal - optionalMet`), so the two can
// never disagree. Findings that carry no boolean `required` (scan findings,
// scan notes, load failures) are not expectations: they get their own lines
// and those lines never say "expectation". Warnings never claim to be
// expectations, so they are counted by severity.
export function renderSummary({ findings, scanSummary = null }) {
  const { requiredMet, requiredTotal, optionalMet, optionalTotal } = summarizeExpectations(findings);
  const isNonExpectation = (f) => f.required !== true && f.required !== false;
  const loadFailures = findings.filter((f) => LOAD_FAILURE_KINDS.includes(f.kind)).length;
  const otherErrors = findings.filter(
    (f) => f.severity === 'error' && isNonExpectation(f) && !LOAD_FAILURE_KINDS.includes(f.kind),
  ).length;
  const advisories = findings.filter((f) => f.severity === 'info' && isNonExpectation(f)).length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  const requiredUnmet = requiredTotal - requiredMet;
  const optionalUnmet = optionalTotal - optionalMet;

  const lines = ['### Summary'];
  lines.push(`- required: ${requiredMet} of ${requiredTotal} satisfied.`);
  lines.push(`- optional: ${optionalMet} of ${optionalTotal} satisfied.`);
  if (scanSummary) {
    lines.push(`- ${formatScanSummary(scanSummary)}`);
  }
  if (requiredUnmet > 0) {
    lines.push(`- ${requiredUnmet} required expectation${requiredUnmet === 1 ? '' : 's'} unmet.`);
  }
  if (loadFailures > 0) {
    lines.push(`- ${loadFailures} plugin component${loadFailures === 1 ? '' : 's'} could not be loaded.`);
  }
  if (otherErrors > 0) {
    lines.push(`- ${otherErrors} other error finding${otherErrors === 1 ? '' : 's'}.`);
  }
  if (warnings > 0) {
    lines.push(`- ${warnings} warning${warnings === 1 ? '' : 's'} (non-fatal).`);
  }
  if (optionalUnmet > 0) {
    lines.push(`- ${optionalUnmet} optional expectation${optionalUnmet === 1 ? '' : 's'} unmet.`);
  }
  if (advisories > 0) {
    lines.push(`- ${advisories} advisory finding${advisories === 1 ? '' : 's'}.`);
  }
  return lines;
}

// Renders the scan-coverage line shown in the report's Summary section,
// distinguishing "scanned N files and found nothing" from "found nothing
// because there was nothing to scan." A configured root that could not be
// used falls back to the default root — `unrepresentable: true` — and that
// fallback must be stated explicitly rather than silently producing a line
// that looks identical to a normal, honored scan.
//
// Pure function: no I/O, no side effects. `root` may be a single path string
// or an array of path strings (the scan can cover more than one root, e.g.
// `docs/` + `CLAUDE.md`).
export function formatScanSummary({ root, unrepresentable, fileCount }) {
  const roots = Array.isArray(root) ? root : [root];
  const rootList = roots.filter(Boolean).join(', ');

  const fallbackNote = unrepresentable
    ? ' (configured root could not be represented; fell back to the default root)'
    : '';

  return `scanned ${fileCount} file(s) under ${rootList}${fallbackNote}`;
}
