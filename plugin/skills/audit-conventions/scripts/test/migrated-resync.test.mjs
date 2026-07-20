// Integration test for the migrated-repo conventions-drift finding
// (evaluateConventionsDrift) and its --fix resync planner (planMigratedResync),
// both wired into audit.mjs.
//
// Test A used to be INTENTIONALLY RED (evaluateConventionsDrift defined but not
// yet called from main()) — it is now wired in and passes.
//
// The "stays silent on drift" test is green and stays green: an absent
// repo-root CONVENTIONS.md must never be flagged (this repo itself has no root
// CONVENTIONS.md — only plugin/CONVENTIONS.md — and flagging absence would
// make this repo's own dogfood `commands.validate` permanently noisy).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
// scripts/test/migrated-resync.test.mjs -> scripts -> audit-conventions -> skills -> plugin
const AUDIT_PATH = resolve(__dirname, '..', 'audit.mjs');
const PLUGIN_ROOT = resolve(__dirname, '..', '..', '..', '..');

function spawnAudit(args, cwd) {
  return spawnSync(process.execPath, [AUDIT_PATH, ...args], { cwd, encoding: 'utf8' });
}

function git(dir, args) {
  const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

async function withTempMigratedRepo(setup) {
  const dir = await mkdtemp(join(tmpdir(), 'audit-migrated-resync-test-'));
  try {
    // STATE_MIGRATED is detected solely by the presence of .gvt-agent.json.
    await writeFile(join(dir, '.gvt-agent.json'), JSON.stringify({ project: { name: 'foo' } }, null, 2));
    await setup(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('audit: migrated repo with drifted CONVENTIONS.md reports a resync warning', async () => {
  await withTempMigratedRepo(async (tmpDir) => {
    // Deliberately different from the plugin's canonical CONVENTIONS.md.
    await writeFile(join(tmpDir, 'CONVENTIONS.md'), '# Drifted conventions\n\nThis is not the canonical copy.\n');

    const result = spawnAudit([], tmpDir);
    assert.match(result.stdout, /State: migrated/, 'report should show the migrated state');
    assert.match(
      result.stdout,
      /CONVENTIONS\.md has drifted.*--fix/s,
      'report should surface a drift warning mentioning --fix',
    );
  });
});

test('audit: migrated repo with no root CONVENTIONS.md stays silent on drift', async () => {
  await withTempMigratedRepo(async (tmpDir) => {
    // No CONVENTIONS.md written at all — confirm absence.
    await assert.rejects(fs.access(join(tmpDir, 'CONVENTIONS.md')), 'precondition: CONVENTIONS.md must not exist');

    const result = spawnAudit([], tmpDir);
    assert.match(result.stdout, /State: migrated/, 'report should show the migrated state');
    assert.doesNotMatch(
      result.stdout,
      /CONVENTIONS\.md has drifted/,
      'absent CONVENTIONS.md must not be flagged as drift',
    );
  });
});

// Sanity check that the plugin's own canonical CONVENTIONS.md is readable
// from this test's vantage point, so the drift fixture above is meaningful
// (i.e. genuinely differs from canonical, not accidentally identical).
test('sanity: plugin canonical CONVENTIONS.md exists and is non-empty', async () => {
  const canonical = await fs.readFile(join(PLUGIN_ROOT, 'CONVENTIONS.md'), 'utf8');
  assert.ok(canonical.length > 0);
});

// ---------------------------------------------------------------------------
// --fix dry-run on a migrated repo (planMigratedResync via runFix)
// ---------------------------------------------------------------------------

test('audit --fix (dry-run) on migrated + identical CONVENTIONS.md: reports up-to-date, writes nothing', async () => {
  await withTempMigratedRepo(async (tmpDir) => {
    const canonical = await fs.readFile(join(PLUGIN_ROOT, 'CONVENTIONS.md'), 'utf8');
    await writeFile(join(tmpDir, 'CONVENTIONS.md'), canonical);

    const dryRun = spawnAudit(['--fix'], tmpDir);
    assert.equal(dryRun.status, 0, `--fix failed:\n${dryRun.stderr}`);
    assert.match(dryRun.stdout, /State: migrated/, 'dry-run should show the migrated state');
    assert.match(
      dryRun.stdout,
      /up to date with the plugin's canonical copy — nothing to resync/,
      'dry-run should report the file as already up to date',
    );

    const afterContent = await fs.readFile(join(tmpDir, 'CONVENTIONS.md'), 'utf8');
    assert.equal(afterContent, canonical, 'dry-run must not modify the repo file');
  });
});

test('audit --fix (dry-run) on migrated + drifted CONVENTIONS.md: shows resync action with +N/-M hint, writes nothing', async () => {
  await withTempMigratedRepo(async (tmpDir) => {
    const drifted = '# Drifted conventions\n\nThis is not the canonical copy.\n';
    await writeFile(join(tmpDir, 'CONVENTIONS.md'), drifted);

    const dryRun = spawnAudit(['--fix'], tmpDir);
    assert.equal(dryRun.status, 0, `--fix failed:\n${dryRun.stderr}`);
    assert.match(dryRun.stdout, /State: migrated/, 'dry-run should show the migrated state');
    assert.match(
      dryRun.stdout,
      /Resync CONVENTIONS\.md.*\+\d+\/−\d+ lines/,
      'dry-run should show the resync write-file action with a +N/-M hint',
    );

    const afterContent = await fs.readFile(join(tmpDir, 'CONVENTIONS.md'), 'utf8');
    assert.equal(afterContent, drifted, 'dry-run must not modify the repo file');
  });
});

// ---------------------------------------------------------------------------
// --fix --apply on a migrated repo: clean tree resyncs, dirty tree refuses
// ---------------------------------------------------------------------------

test('audit --fix --apply on migrated + drifted + clean git tree: resyncs CONVENTIONS.md to canonical', async () => {
  await withTempMigratedRepo(async (tmpDir) => {
    const drifted = '# Drifted conventions\n\nThis is not the canonical copy.\n';
    await writeFile(join(tmpDir, 'CONVENTIONS.md'), drifted);

    // Set up a real git repo with a clean working tree so the apply gate passes.
    git(tmpDir, ['init', '-q', '.']);
    git(tmpDir, ['config', 'user.email', 'test@example.com']);
    git(tmpDir, ['config', 'user.name', 'Test']);
    git(tmpDir, ['add', '-A']);
    git(tmpDir, ['commit', '-q', '-m', 'initial']);

    const apply = spawnAudit(['--fix', '--apply'], tmpDir);
    assert.equal(apply.status, 0, `--fix --apply failed:\n${apply.stderr}`);

    const canonical = await fs.readFile(join(PLUGIN_ROOT, 'CONVENTIONS.md'), 'utf8');
    const afterContent = await fs.readFile(join(tmpDir, 'CONVENTIONS.md'), 'utf8');
    assert.equal(afterContent, canonical, 'apply should overwrite the repo file with the canonical copy');
  });
});

test('audit --fix --apply on migrated + drifted + dirty git tree: refuses with the dirty-tree message', async () => {
  await withTempMigratedRepo(async (tmpDir) => {
    const drifted = '# Drifted conventions\n\nThis is not the canonical copy.\n';
    await writeFile(join(tmpDir, 'CONVENTIONS.md'), drifted);

    // Real git repo, but leave an uncommitted change so the tree is dirty.
    git(tmpDir, ['init', '-q', '.']);
    git(tmpDir, ['config', 'user.email', 'test@example.com']);
    git(tmpDir, ['config', 'user.name', 'Test']);
    git(tmpDir, ['add', '-A']);
    git(tmpDir, ['commit', '-q', '-m', 'initial']);
    await writeFile(join(tmpDir, 'CONVENTIONS.md'), drifted + '\nuncommitted change\n');

    const apply = spawnAudit(['--fix', '--apply'], tmpDir);
    assert.notEqual(apply.status, 0, '--fix --apply should refuse on a dirty tree');
    assert.match(
      apply.stderr,
      /Refusing to apply with a dirty working tree/,
      'should print the dirty-tree refusal message',
    );

    assert.ok(existsSync(join(tmpDir, 'CONVENTIONS.md')), 'file should still exist, untouched by apply');
  });
});
