// Integration test for the validate-mode conventions-drift finding
// (evaluateConventionsDrift in audit.mjs).
//
// Test A is INTENTIONALLY RED right now: evaluateConventionsDrift is defined
// but not yet called from main() (a later task wires it in). It's kept here
// as a deliberate TDD red step, not a bug to fix by wiring the function.
//
// Test B is green now and stays green after wiring: an absent repo-root
// CONVENTIONS.md must never be flagged (this repo itself has no root
// CONVENTIONS.md — only plugin/CONVENTIONS.md — and flagging absence would
// make this repo's own dogfood `commands.validate` permanently noisy).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
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

test('audit: migrated repo with drifted CONVENTIONS.md reports a resync warning [INTENTIONALLY RED until wired]', async () => {
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
