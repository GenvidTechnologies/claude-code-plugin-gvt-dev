// Picks which candidate location answers a metadata.expects files entry and
// what kind it must be (ADR-0070, ADR-0077). One rule for every consumer:
// resolveFile in audit-main.mjs and practice-detect's schema signal.
// - The kind comes from the DECLARED path's trailing slash, never the candidate's.
// - Trailing / and \ are stripped from a candidate before it is joined and probed,
//   so the same path is examined on every platform.
// - Candidates are walked in order. A candidate holding the expected kind satisfies
//   the entry. A candidate that cannot be examined stops the chain and is reported
//   in its own state. A candidate holding the wrong kind, or something that is
//   neither a file nor a directory, is passed over. The last candidate is always
//   the answer when nothing earlier stopped the chain.
// Presence only (ADR-0015 §2): probePath runs stat, then lstat to confirm absence.
// It never lists a directory or reads a file.
import { join } from 'node:path';
import { probePath } from '#audit-core';

export const expectedKind = (declaredPath) => (/[\\/]$/.test(declaredPath) ? 'directory' : 'file');
export const probeRelPath = (candidate) => candidate.replace(/[\\/]+$/, '');

export async function resolveCandidate(repoRoot, declaredPath, candidates, { probe = probePath } = {}) {
  const want = expectedKind(declaredPath);
  const skipped = [];
  for (const [i, candidate] of candidates.entries()) {
    const path = join(repoRoot, probeRelPath(candidate));
    const found = await probe(path);
    const last = i === candidates.length - 1;
    if (last || found.kind === want || found.kind === 'error') {
      return { candidate, path, probe: want, found, satisfied: found.kind === want, skipped };
    }
    if (found.kind !== 'absent') skipped.push({ candidate, kind: found.kind });
  }
}

const PASSED_OVER = {
  directory: 'found a directory',
  file: 'found a file',
  other: 'found neither a file nor a directory',
};

// Renders the "expects …" target for a multi-candidate finding: the text after
// "expects ". `f` carries `candidates`, `detail` (evaluateFile's detail string,
// which has no trailing period), `described` (the candidate the detail is
// about), `describedKind` (its found.kind) and `skipped` ([{ candidate, kind }]).
// The result has no trailing period and no Reason: formatFinding in
// audit-main.mjs appends `.` and ` Reason: …` after it, so a note ending in `)`
// composes as "… (found a directory). Reason: …".
export function formatCandidateTarget(f) {
  const shown = f.candidates.map((c) => `\`${c}\``).join(' or ');
  const allAbsent =
    f.skipped.length === 0 && f.described === f.candidates[f.candidates.length - 1] && f.describedKind === 'absent';
  if (allAbsent) return `${shown} — ${f.detail}`;
  const notes = f.skipped.map((s) => `; \`${s.candidate}\` was passed over (${PASSED_OVER[s.kind]})`).join('');
  return `${shown} — \`${f.described}\`: ${f.detail}${notes}`;
}

// Renders the target of a finding whose expectation a `paths` override may have
// relocated: the declared path, then (when an override moved it) the path it resolved to.
// `viaPaths` is undefined when no override applies; an empty string renders as
// empty backticks, verbatim.
export const formatOverrideTarget = (target, viaPaths) =>
  viaPaths === undefined ? `\`${target}\`` : `\`${target}\` (→ \`${viaPaths}\` via paths)`;
