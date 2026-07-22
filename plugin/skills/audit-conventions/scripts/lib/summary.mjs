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
