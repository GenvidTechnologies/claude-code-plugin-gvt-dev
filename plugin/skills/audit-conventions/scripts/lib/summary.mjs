import { LOAD_FAILURE_KINDS } from './load-diagnostics.mjs';
import { bareDir, insideDir } from './dir-path.mjs';

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
  // One line per entry: a single object (one scan) or an array (one per scanner).
  // The fallback note rides on the first line only, so it is stated once.
  if (scanSummary) {
    const entries = Array.isArray(scanSummary) ? scanSummary : [scanSummary];
    entries.forEach((entry, i) => {
      lines.push(`- ${formatScanSummary(i === 0 ? entry : { ...entry, unrepresentable: false })}`);
    });
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
//
// Optional `purpose` names what the scan was for ("scanned N file(s) for
// <purpose> under ..."); with a purpose and no roots the "under" clause is
// dropped. Optional `note` is a parenthesised remark placed after the roots.
// With neither, the output is the original one-scan line, unchanged.
export function formatScanSummary({ root, unrepresentable, fileCount, purpose, note, off }) {
  const roots = Array.isArray(root) ? root : [root];
  const rootList = roots.filter(Boolean).join(', ');

  const fallbackNote = unrepresentable
    ? ' (configured root could not be represented; fell back to the default root)'
    : '';

  // A scan that is switched off examined nothing: say so, not "scanned N".
  if (off) return `${off}${fallbackNote}`;

  const forPart = purpose ? ` for ${purpose}` : '';
  const underPart = rootList || !purpose ? ` under ${rootList}` : '';
  const notePart = note ? ` ${note}` : '';
  return `scanned ${fileCount} file(s)${forPart}${underPart}${notePart}${fallbackNote}`;
}

// ---- per-scanner scan summary (#401) ----------------------------------------

// Directory roots to name, in the order given, dropping any root nested inside
// another listed root (an equal pair keeps the first).
function outermostRoots(dirs) {
  const bare = dirs.map(bareDir);
  return bare
    .filter((d, i) => !bare.some((o, j) => j !== i && insideDir(d, o) && (d !== o || j < i)))
    .map((d) => `${d}/`);
}

// One entry per hygiene scanner, for renderSummary's array form: what each
// scanner actually examined, from the corpora in lib/hygiene.mjs's
// hygieneCorpora (never re-derived here). Wording avoids the substrings a
// downstream digest counts as findings (the orphan, broken-link and
// retired-token finding phrases). `unrepresentable` marks the first entry;
// renderSummary states the fallback once.
export function hygieneScanSummary({ retiredToken, linkCheck, indexCheck }, { unrepresentable = false, retiredTokens } = {}) {
  // An effective deny-list that is empty (hygiene.retiredTokens: []) can match
  // nothing, so the retired-token scan is reported off, not as files scanned.
  const tokenScanOff = Array.isArray(retiredTokens) && retiredTokens.length === 0;
  const tokenPaths = retiredToken.files.map((f) => f.path);
  const tokenRoots = [
    ...outermostRoots(retiredToken.roots.map((r) => r.root)),
    ...(tokenPaths.includes('CLAUDE.md') ? ['CLAUDE.md'] : []),
    ...retiredToken.files.filter((f) => f.via === 'config').map((f) => f.path),
  ];

  const bundle = linkCheck.bundleRoot ? bareDir(linkCheck.bundleRoot) : null;
  const linkPaths = [...linkCheck.files, ...linkCheck.declined];
  const linkRoots = [
    ...linkCheck.roots.filter((r) => r.endsWith('/')).map(bareDir)
      .filter((d) => !(bundle && insideDir(d, bundle)))
      .map((d) => `${d}/`),
    ...(linkPaths.includes('CLAUDE.md') ? ['CLAUDE.md'] : []),
  ];
  const linkNote = linkCheck.declined.length > 0
    ? `(${linkCheck.declined.length} under ${bundle}/ declined, see Info)`
    : undefined;

  const indexRoots = indexCheck.roots.map((r) => `${bareDir(r)}/`);
  let indexNote;
  let indexNamed = indexRoots;
  if (indexCheck.skipped === 'bundle') {
    indexNote = `(docs root ${indexRoots[0]} is inside the wiki bundle ${bundle}/; declined, see Info)`;
    indexNamed = [];
  } else if (indexCheck.skipped === 'no-index') {
    indexNote = `(no index at ${indexCheck.index}; skipped, see Info)`;
  } else {
    indexNote = `(index ${indexCheck.index})`;
  }

  return [
    {
      root: tokenRoots,
      unrepresentable,
      fileCount: retiredToken.files.length,
      purpose: 'retired tokens',
      off: tokenScanOff ? 'retired-token scan off (hygiene.retiredTokens is empty); 0 file(s) checked' : undefined,
    },
    { root: linkRoots, unrepresentable: false, fileCount: linkCheck.files.length, purpose: 'links', note: linkNote },
    { root: indexNamed, unrepresentable: false, fileCount: indexCheck.files.length, purpose: 'index coverage', note: indexNote },
  ];
}
