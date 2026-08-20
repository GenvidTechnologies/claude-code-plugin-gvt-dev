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
