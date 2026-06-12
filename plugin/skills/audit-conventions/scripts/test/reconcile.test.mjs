import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  previewPlanPath,
  savePreviewedPlan,
  loadPreviewedPlan,
  clearPreviewedPlan,
  diffPlans,
  formatReconciliation,
} from '../lib/reconcile.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Create an isolated temp dir to use as a fake repoRoot. Using distinct
// mkdtemp dirs per test ensures previewPlanPath() hashes to a unique key,
// preventing cross-test plan-file leakage even if a test forgets to clear.
async function withTempRoot(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'reconcile-test-'));
  try {
    await fn(dir);
  } finally {
    // Clean up the plan file in tmpdir (keyed by this repoRoot) and the temp dir.
    clearPreviewedPlan(dir);
    await rm(dir, { recursive: true, force: true });
  }
}

function makePlan(state, actions) {
  return { state, actions };
}

function makeAction(type, summary) {
  return { type, summary };
}

// ---------------------------------------------------------------------------
// diffPlans — basic cases
// ---------------------------------------------------------------------------

test('diffPlans: identical plans -> no dropped, no added', () => {
  const actions = [
    makeAction('write-file', 'Write CONVENTIONS.md'),
    makeAction('write-file', 'Write CLAUDE.md'),
  ];
  const plan = makePlan('greenfield', actions);
  const diff = diffPlans(plan, plan);
  assert.deepEqual(diff.dropped, []);
  assert.deepEqual(diff.added, []);
});

test('diffPlans: action in previewed missing from current -> dropped', () => {
  const previewed = makePlan('greenfield', [
    makeAction('write-file', 'Write CONVENTIONS.md'),
    makeAction('write-file', 'Write CLAUDE.md'),
  ]);
  const current = makePlan('greenfield', [
    makeAction('write-file', 'Write CONVENTIONS.md'),
  ]);
  const diff = diffPlans(previewed, current);
  assert.deepEqual(diff.dropped, ['Write CLAUDE.md']);
  assert.deepEqual(diff.added, []);
});

test('diffPlans: action in current missing from previewed -> added', () => {
  const previewed = makePlan('greenfield', [
    makeAction('write-file', 'Write CONVENTIONS.md'),
  ]);
  const current = makePlan('greenfield', [
    makeAction('write-file', 'Write CONVENTIONS.md'),
    makeAction('write-file', 'Write CLAUDE.md'),
  ]);
  const diff = diffPlans(previewed, current);
  assert.deepEqual(diff.dropped, []);
  assert.deepEqual(diff.added, ['Write CLAUDE.md']);
});

test('diffPlans: dropped and added simultaneously', () => {
  const previewed = makePlan('legacy', [
    makeAction('write-file', 'Write CONVENTIONS.md'),
    makeAction('delete-file', 'Delete legacy config'),
  ]);
  const current = makePlan('legacy', [
    makeAction('write-file', 'Write CONVENTIONS.md'),
    makeAction('note', 'New note action'),
  ]);
  const diff = diffPlans(previewed, current);
  assert.deepEqual(diff.dropped, ['Delete legacy config']);
  assert.deepEqual(diff.added, ['New note action']);
});

// ---------------------------------------------------------------------------
// diffPlans — multiset semantics (the key correctness requirement)
// ---------------------------------------------------------------------------

test('diffPlans: multiset — action appears twice in previewed, once in current -> exactly one dropped', () => {
  // If plain Sets were used, zero would be dropped (the key exists in both).
  // Correct multiset semantics: previewed count(2) - current count(1) = 1 dropped.
  const previewed = makePlan('greenfield', [
    makeAction('note', 'SKIPPED foo — target already exists'),
    makeAction('note', 'SKIPPED foo — target already exists'),
  ]);
  const current = makePlan('greenfield', [
    makeAction('note', 'SKIPPED foo — target already exists'),
  ]);
  const diff = diffPlans(previewed, current);
  assert.equal(diff.dropped.length, 1, 'exactly one instance should be dropped');
  assert.equal(diff.dropped[0], 'SKIPPED foo — target already exists');
  assert.deepEqual(diff.added, []);
});

test('diffPlans: multiset — action appears once in previewed, twice in current -> exactly one added', () => {
  const previewed = makePlan('greenfield', [
    makeAction('note', 'SKIPPED bar — target already exists'),
  ]);
  const current = makePlan('greenfield', [
    makeAction('note', 'SKIPPED bar — target already exists'),
    makeAction('note', 'SKIPPED bar — target already exists'),
  ]);
  const diff = diffPlans(previewed, current);
  assert.deepEqual(diff.dropped, []);
  assert.equal(diff.added.length, 1);
  assert.equal(diff.added[0], 'SKIPPED bar — target already exists');
});

test('diffPlans: same summary but different types are treated as distinct keys', () => {
  // type is part of the identity key, so same summary + different type != same action.
  const previewed = makePlan('legacy', [
    makeAction('write-file', 'Handle foo'),
  ]);
  const current = makePlan('legacy', [
    makeAction('delete-file', 'Handle foo'),
  ]);
  const diff = diffPlans(previewed, current);
  assert.equal(diff.dropped.length, 1);
  assert.equal(diff.added.length, 1);
});

// ---------------------------------------------------------------------------
// diffPlans — null previewed (defensive guard)
// ---------------------------------------------------------------------------

test('diffPlans: null previewed -> all current actions are added', () => {
  const current = makePlan('greenfield', [
    makeAction('write-file', 'Write CONVENTIONS.md'),
  ]);
  const diff = diffPlans(null, current);
  assert.deepEqual(diff.dropped, []);
  assert.equal(diff.added.length, 1);
});

// ---------------------------------------------------------------------------
// save → load roundtrip
// ---------------------------------------------------------------------------

test('savePreviewedPlan / loadPreviewedPlan: roundtrip preserves state and actions', async () => {
  await withTempRoot(async (root) => {
    const plan = makePlan('greenfield', [
      makeAction('write-file', 'Write CONVENTIONS.md'),
      makeAction('note', 'SKIPPED CLAUDE.md — target already exists'),
    ]);

    savePreviewedPlan(root, plan);
    const loaded = loadPreviewedPlan(root);

    assert.ok(loaded !== null, 'should load a saved plan');
    assert.equal(loaded.state, 'greenfield');
    assert.equal(loaded.actions.length, 2);
    assert.deepEqual(loaded.actions[0], { type: 'write-file', summary: 'Write CONVENTIONS.md' });
    assert.deepEqual(loaded.actions[1], { type: 'note', summary: 'SKIPPED CLAUDE.md — target already exists' });
    // savedAt must be present and look like an ISO string
    assert.ok(typeof loaded.savedAt === 'string', 'savedAt should be a string');
    assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(loaded.savedAt), 'savedAt should look like an ISO date');
  });
});

test('savePreviewedPlan: strips extra action fields (only type + summary persisted)', async () => {
  await withTempRoot(async (root) => {
    // Simulate a real action with extra fields like path / content.
    const plan = {
      state: 'legacy',
      actions: [
        { type: 'write-file', path: '/repo/CONVENTIONS.md', content: '...lots of content...', summary: 'Write CONVENTIONS.md' },
      ],
    };

    savePreviewedPlan(root, plan);
    const loaded = loadPreviewedPlan(root);

    assert.ok(loaded !== null);
    assert.deepEqual(loaded.actions[0], { type: 'write-file', summary: 'Write CONVENTIONS.md' });
    assert.equal('path' in loaded.actions[0], false, 'path field should not be persisted');
    assert.equal('content' in loaded.actions[0], false, 'content field should not be persisted');
  });
});

// ---------------------------------------------------------------------------
// clearPreviewedPlan
// ---------------------------------------------------------------------------

test('clearPreviewedPlan: subsequent load returns null', async () => {
  await withTempRoot(async (root) => {
    const plan = makePlan('greenfield', [makeAction('write-file', 'Write CONVENTIONS.md')]);
    savePreviewedPlan(root, plan);

    // Confirm it was saved.
    assert.ok(loadPreviewedPlan(root) !== null, 'plan should be saved before clear');

    clearPreviewedPlan(root);
    assert.equal(loadPreviewedPlan(root), null, 'load should return null after clear');
  });
});

test('clearPreviewedPlan: ignores ENOENT (no error on already-cleared plan)', async () => {
  await withTempRoot(async (root) => {
    // Never saved — should not throw.
    assert.doesNotThrow(() => clearPreviewedPlan(root));
    // Calling again is also fine.
    assert.doesNotThrow(() => clearPreviewedPlan(root));
  });
});

// ---------------------------------------------------------------------------
// loadPreviewedPlan — error cases
// ---------------------------------------------------------------------------

test('loadPreviewedPlan: never-written repoRoot -> null (no throw)', async () => {
  await withTempRoot(async (root) => {
    // Use a fresh root that has never had savePreviewedPlan called on it.
    const result = loadPreviewedPlan(root);
    assert.equal(result, null);
  });
});

test('loadPreviewedPlan: corrupt file (invalid JSON) -> null (no throw)', async () => {
  await withTempRoot(async (root) => {
    // Write garbage directly to the plan path to simulate corruption.
    const path = previewPlanPath(root);
    await writeFile(path, 'this is not valid JSON }{{{');

    const result = loadPreviewedPlan(root);
    assert.equal(result, null, 'corrupt file should return null, not throw');
  });
});

// ---------------------------------------------------------------------------
// formatReconciliation
// ---------------------------------------------------------------------------

test('formatReconciliation: clean case (no diffs) -> empty string', () => {
  const result = formatReconciliation({ dropped: [], added: [] }, 10, 10);
  assert.equal(result, '');
});

test('formatReconciliation: canonical single-drop string matches issue #74 example exactly', () => {
  const result = formatReconciliation({ dropped: ['some action summary'], added: [] }, 54, 53);
  assert.equal(
    result,
    'Applied 53 of 54 previewed actions — 1 previewed action no longer applies (re-run --fix to see the current plan).',
  );
});

test('formatReconciliation: plural drops uses correct grammar', () => {
  const dropped = ['action A', 'action B', 'action C'];
  const result = formatReconciliation({ dropped, added: [] }, 10, 7);
  assert.match(result, /^Applied 7 of 10 previewed actions/);
  assert.match(result, /3 previewed actions no longer apply/);
  assert.ok(!result.includes('no longer applies'), 'singular "applies" must not appear for plural');
});

test('formatReconciliation: single added action -> correct singular grammar', () => {
  const result = formatReconciliation({ dropped: [], added: ['New action'] }, 10, 11);
  assert.match(result, /^1 new action appeared since the preview/);
  assert.ok(!result.includes('actions appeared'), 'plural must not appear for single added action');
});

test('formatReconciliation: plural added actions -> correct plural grammar', () => {
  const result = formatReconciliation({ dropped: [], added: ['A', 'B'] }, 10, 12);
  assert.match(result, /^2 new actions appeared since the preview/);
});

test('formatReconciliation: both dropped and added -> two-line output', () => {
  const diff = { dropped: ['old action'], added: ['new action A', 'new action B'] };
  const result = formatReconciliation(diff, 20, 19);
  const lines = result.split('\n');
  assert.equal(lines.length, 2, 'should produce exactly two lines');
  assert.match(lines[0], /1 previewed action no longer applies/);
  assert.match(lines[1], /2 new actions appeared/);
});

test('formatReconciliation: no trailing newline', () => {
  const result = formatReconciliation({ dropped: ['x'], added: [] }, 5, 4);
  assert.ok(!result.endsWith('\n'), 'result must not end with a newline');
});
