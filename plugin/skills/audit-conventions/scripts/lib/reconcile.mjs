// Reconciliation helpers for audit-conventions --apply guard (issue #74).
//
// Flow:
//   --fix   (dry-run):  saves the previewed plan with savePreviewedPlan()
//   --apply:            loads it with loadPreviewedPlan(), re-computes the plan,
//                       calls diffPlans() to detect drift, then reports via
//                       formatReconciliation() before clearing with clearPreviewedPlan().
//
// The plan file is keyed by the resolved absolute repo root so that multiple
// concurrent audits on different repos don't collide in the shared tmpdir.

import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// -----------------------------------------------------------------------------
// previewPlanPath — pure; returns the tmp file path for a given repo root
// -----------------------------------------------------------------------------

export function previewPlanPath(repoRoot) {
  const hash = createHash('sha1').update(resolve(repoRoot)).digest('hex').slice(0, 16);
  return join(tmpdir(), `genvid-audit-plan-${hash}.json`);
}

// -----------------------------------------------------------------------------
// savePreviewedPlan — persist a stripped plan snapshot to the tmp file
// -----------------------------------------------------------------------------

export function savePreviewedPlan(repoRoot, plan) {
  const payload = {
    savedAt: new Date().toISOString(),
    state: plan.state,
    // Only persist the fields the reconciler needs — type + summary.
    // The full content / path fields are omitted deliberately to keep the
    // snapshot small and stable across re-runs that may vary file content.
    actions: plan.actions.map((a) => ({ type: a.type, summary: a.summary })),
  };
  writeFileSync(previewPlanPath(repoRoot), JSON.stringify(payload, null, 2));
}

// -----------------------------------------------------------------------------
// loadPreviewedPlan — read + parse the plan snapshot; returns null on miss/error
// -----------------------------------------------------------------------------

export function loadPreviewedPlan(repoRoot) {
  const path = previewPlanPath(repoRoot);
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    // Other read errors (permissions, etc.) — treat as cache miss.
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    // Corrupt JSON — treat as cache miss.
    return null;
  }
}

// -----------------------------------------------------------------------------
// clearPreviewedPlan — delete the plan snapshot; ignores ENOENT
// -----------------------------------------------------------------------------

export function clearPreviewedPlan(repoRoot) {
  try {
    unlinkSync(previewPlanPath(repoRoot));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

// -----------------------------------------------------------------------------
// diffPlans — PURE; detects dropped and added actions between two plan snapshots
//
// Identity key: `${type} ${summary}` (composite to guard against two action
// types sharing the same summary text).
//
// Multiset semantics: if the previewed plan has the same action twice and the
// current plan has it once, exactly one instance is counted as dropped (not
// both, not zero). Implemented with count maps rather than plain Sets.
//
// Each returned element is the action's summary string — convenient for
// printing; the type is encoded in the identity key but excluded from the
// returned array because the summary alone is what the user sees in dry-run
// output and is sufficient for the reconciliation report.
// -----------------------------------------------------------------------------

export function diffPlans(previewed, current) {
  // Defensive: if previewed is null/undefined treat it as having no actions.
  // The audit.mjs caller guards for null and skips the reconciliation message
  // entirely, so this branch is belt-and-suspenders.
  const previewedActions = previewed?.actions ?? [];
  const currentActions = current?.actions ?? [];

  // Build count maps keyed by `${type} ${summary}`.
  const previewedCounts = new Map();
  for (const a of previewedActions) {
    const key = `${a.type} ${a.summary}`;
    previewedCounts.set(key, (previewedCounts.get(key) ?? 0) + 1);
  }

  const currentCounts = new Map();
  for (const a of currentActions) {
    const key = `${a.type} ${a.summary}`;
    currentCounts.set(key, (currentCounts.get(key) ?? 0) + 1);
  }

  // Dropped: keys whose count in previewed exceeds count in current.
  const dropped = [];
  for (const [key, previewCount] of previewedCounts) {
    const currentCount = currentCounts.get(key) ?? 0;
    const delta = previewCount - currentCount;
    // Find any action in previewedActions matching this key to get its summary.
    // (We only need one — they share the same summary by construction.)
    if (delta > 0) {
      const sample = previewedActions.find((a) => `${a.type} ${a.summary}` === key);
      for (let i = 0; i < delta; i++) dropped.push(sample.summary);
    }
  }

  // Added: keys whose count in current exceeds count in previewed.
  const added = [];
  for (const [key, curCount] of currentCounts) {
    const previewCount = previewedCounts.get(key) ?? 0;
    const delta = curCount - previewCount;
    if (delta > 0) {
      const sample = currentActions.find((a) => `${a.type} ${a.summary}` === key);
      for (let i = 0; i < delta; i++) added.push(sample.summary);
    }
  }

  return { dropped, added };
}

// -----------------------------------------------------------------------------
// formatReconciliation — PURE; builds the human-readable reconciliation report
//
// Returns '' when there are no diffs (clean case — caller prints nothing extra).
// Otherwise returns a non-empty string (possibly multi-line, no trailing newline).
//
// Canonical single-drop example from issue #74:
//   "Applied 53 of 54 previewed actions — 1 previewed action no longer applies
//    (re-run --fix to see the current plan)."
// -----------------------------------------------------------------------------

export function formatReconciliation(diff, previewedCount, currentCount) {
  const n = diff.dropped.length;
  const m = diff.added.length;

  if (n === 0 && m === 0) return '';

  const lines = [];

  if (n > 0) {
    const actionWord = n === 1 ? 'action' : 'actions';
    const verbSuffix = n === 1 ? 'ies' : 'y';
    lines.push(
      `Applied ${currentCount} of ${previewedCount} previewed actions — `
      + `${n} previewed ${actionWord} no longer appl${verbSuffix} `
      + `(re-run --fix to see the current plan).`,
    );
  }

  if (m > 0) {
    const actionWord = m === 1 ? 'action' : 'actions';
    lines.push(
      `${m} new ${actionWord} appeared since the preview (re-run --fix to review).`,
    );
  }

  return lines.join('\n');
}
