// Integration test: --fix persists a previewed plan, and --fix --apply
// reconciles against it, reporting dropped actions when repo state changed
// between the dry-run and the apply.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { previewPlanPath } from '../lib/reconcile.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
// scripts/test/audit-apply-reconcile.test.mjs -> scripts -> audit-conventions -> skills -> plugin
const AUDIT_PATH = resolve(__dirname, '..', 'audit.mjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function spawnAudit(args, cwd) {
  return spawnSync(process.execPath, [AUDIT_PATH, ...args], { cwd, encoding: 'utf8' });
}

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'audit-reconcile-test-'));
  try {
    await fn(dir);
  } finally {
    // Clean up the plan snapshot (keyed by the temp dir) and the temp dir itself.
    const planFile = previewPlanPath(dir);
    try {
      const { unlinkSync } = await import('node:fs');
      unlinkSync(planFile);
    } catch {
      // Ignore ENOENT — test may have already cleared it.
    }
    await rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Test: dry-run (--fix) saves a previewed plan; apply (--fix --apply) reconciles
// ---------------------------------------------------------------------------

test('audit --fix saves previewed plan; --fix --apply reports dropped action when CLAUDE.md pre-created', async () => {
  await withTempDir(async (tmpDir) => {
    // Step 1: Run --fix in an empty dir (GREENFIELD). Should exit 0 and list actions.
    const dryRun = spawnAudit(['--fix'], tmpDir);
    assert.equal(dryRun.status, 0, `--fix failed:\n${dryRun.stderr}`);
    assert.match(dryRun.stdout, /--fix dry-run/, '--fix should print the dry-run header');
    assert.match(dryRun.stdout, /action.*would be applied/i, '--fix should list actions');
    // Confirm the plan file was saved.
    const planFile = previewPlanPath(tmpDir);
    const { existsSync } = await import('node:fs');
    assert.ok(existsSync(planFile), 'plan snapshot file should exist after --fix');

    // Step 2: Pre-create CLAUDE.md so its write action drops on recompute.
    // planGreenfield skips pre-existing files with a SKIPPED note (issue #25).
    await writeFile(join(tmpDir, 'CLAUDE.md'), 'hand-written project context\n');

    // Step 3: Run --fix --apply. The temp dir is not a git repo so the
    // dirty-tree guard passes (git status fails → workingTreeClean returns true).
    const apply = spawnAudit(['--fix', '--apply'], tmpDir);
    assert.equal(apply.status, 0, `--fix --apply failed:\n${apply.stderr}`);

    // The reconciliation line must appear — at least one previewed action
    // (the CLAUDE.md write) no longer applies.
    assert.match(
      apply.stdout,
      /previewed action.*no longer appl/i,
      'reconciliation line should report dropped action',
    );

    // Step 4: After apply, the plan snapshot should be cleared.
    assert.ok(!existsSync(planFile), 'plan snapshot file should be cleared after --fix --apply');
  });
});

// ---------------------------------------------------------------------------
// Test: --fix --apply without a prior --fix emits the "no previewed plan" message
// ---------------------------------------------------------------------------

test('audit --fix --apply without prior --fix prints no-previewed-plan message', async () => {
  await withTempDir(async (tmpDir) => {
    // Don't run --fix first — no plan snapshot exists.
    // Confirm the plan file truly does not exist.
    const planFile = previewPlanPath(tmpDir);
    const { existsSync } = await import('node:fs');
    assert.ok(!existsSync(planFile), 'plan snapshot file should not exist before --fix');

    const apply = spawnAudit(['--fix', '--apply'], tmpDir);
    // Exit code 0 for a successful greenfield apply.
    assert.equal(apply.status, 0, `--fix --apply failed:\n${apply.stderr}`);

    assert.match(
      apply.stdout,
      /No previewed plan found to reconcile against/,
      'should warn that no previewed plan was found',
    );

    // Plan file should still be cleared (was never there — clearPreviewedPlan ignores ENOENT).
    assert.ok(!existsSync(planFile), 'plan file should remain absent after apply without prior --fix');
  });
});
