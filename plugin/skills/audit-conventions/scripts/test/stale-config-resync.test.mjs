// Integration test for the stale-config --fix "Manual follow-up" retired-token
// report (staleFollowup / STALE_REPORT_TOKENS in audit.mjs).
//
// Deliberately report-only: this scan never rewrites anything in the repo, it
// only surfaces CLAUDE.md / docs/ lines still mentioning the retired
// genvid:/genvid-dev:/.genvid-agent.json tokens after the .genvid-agent.json ->
// .gvt-agent.json rename, so a maintainer can clean them up by hand.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
// scripts/test/stale-config-resync.test.mjs -> scripts -> audit-conventions -> skills -> plugin
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

async function withTempStaleConfigRepo(setup) {
  const dir = await mkdtemp(join(tmpdir(), 'audit-stale-config-resync-test-'));
  try {
    // STATE_STALE_CONFIG is detected by the presence of .genvid-agent.json
    // (and the ABSENCE of .gvt-agent.json). No C3 markers (features.c3 /
    // paths.c3project) so planStaleConfig takes the auto-rename path, not the
    // port-and-keep note.
    await writeFile(
      join(dir, '.genvid-agent.json'),
      JSON.stringify({ project: { name: 'foo' } }, null, 2),
    );
    await setup(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function initCleanGitRepo(dir) {
  git(dir, ['init', '-q', '.']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'initial']);
}

test('audit --fix (dry-run) on stale-config with retired tokens under docs/: reports Manual follow-up with the tokens', async () => {
  await withTempStaleConfigRepo(async (tmpDir) => {
    await mkdir(join(tmpDir, 'docs'), { recursive: true });
    await writeFile(
      join(tmpDir, 'docs', 'foo.md'),
      'This still uses genvid: as a namespace prefix.\n' +
        'It also still references .genvid-agent.json directly.\n',
    );

    const dryRun = spawnAudit(['--fix'], tmpDir);
    assert.equal(dryRun.status, 0, `--fix failed:\n${dryRun.stderr}`);
    assert.match(dryRun.stdout, /### Manual follow-up/, 'dry-run should include the Manual follow-up section');
    assert.match(
      dryRun.stdout,
      /`docs\/foo\.md` — line 1 uses retired token 'genvid:'/,
      'report should name docs/foo.md and the genvid: token on line 1',
    );
    assert.match(
      dryRun.stdout,
      /`docs\/foo\.md` — line 2 uses retired token '\.genvid-agent\.json'/,
      'report should name docs/foo.md and the .genvid-agent.json token on line 2',
    );
  });
});

test('audit --fix --apply on stale-config with retired tokens + clean git tree: also prints Manual follow-up', async () => {
  await withTempStaleConfigRepo(async (tmpDir) => {
    await mkdir(join(tmpDir, 'docs'), { recursive: true });
    await writeFile(
      join(tmpDir, 'docs', 'foo.md'),
      'This still uses genvid: as a namespace prefix.\n' +
        'It also still references .genvid-agent.json directly.\n',
    );

    initCleanGitRepo(tmpDir);

    const apply = spawnAudit(['--fix', '--apply'], tmpDir);
    assert.equal(apply.status, 0, `--fix --apply failed:\n${apply.stderr}`);
    assert.match(apply.stdout, /### Manual follow-up/, 'apply output should include the Manual follow-up section');
    assert.match(
      apply.stdout,
      /`docs\/foo\.md` — line 1 uses retired token 'genvid:'/,
      'apply output should name docs/foo.md and the genvid: token on line 1',
    );
  });
});

test('audit --fix (dry-run) on stale-config with no retired tokens: reports nothing to clean up', async () => {
  await withTempStaleConfigRepo(async (tmpDir) => {
    await mkdir(join(tmpDir, 'docs'), { recursive: true });
    await writeFile(join(tmpDir, 'docs', 'foo.md'), 'Nothing retired to see here.\n');

    const dryRun = spawnAudit(['--fix'], tmpDir);
    assert.equal(dryRun.status, 0, `--fix failed:\n${dryRun.stderr}`);
    assert.match(dryRun.stdout, /### Manual follow-up/, 'dry-run should include the Manual follow-up section');
    assert.match(
      dryRun.stdout,
      /No dangling references detected/,
      'clean fixture should report nothing left to clean up by hand',
    );
  });
});

test('audit --fix (dry-run) on stale-config: a line containing http is not flagged even if it also mentions .genvid-agent.json', async () => {
  await withTempStaleConfigRepo(async (tmpDir) => {
    await mkdir(join(tmpDir, 'docs'), { recursive: true });
    await writeFile(
      join(tmpDir, 'docs', 'bar.md'),
      'See https://github.com/example/example/issues/1 for the .genvid-agent.json history.\n',
    );

    const dryRun = spawnAudit(['--fix'], tmpDir);
    assert.equal(dryRun.status, 0, `--fix failed:\n${dryRun.stderr}`);
    assert.doesNotMatch(
      dryRun.stdout,
      /`docs\/bar\.md` — line \d+ uses retired token/,
      'a line containing http must be skipped by the retired-token scan',
    );
    assert.match(
      dryRun.stdout,
      /No dangling references detected/,
      'with the only candidate line skipped, the report should be empty',
    );
  });
});

test('audit --fix --apply on stale-config with a dirty git tree: refuses with the dirty-tree message (regression guard)', async () => {
  await withTempStaleConfigRepo(async (tmpDir) => {
    initCleanGitRepo(tmpDir);
    // Leave an uncommitted change so the tree is dirty.
    await writeFile(join(tmpDir, 'uncommitted.txt'), 'dirty\n');

    const apply = spawnAudit(['--fix', '--apply'], tmpDir);
    assert.notEqual(apply.status, 0, '--fix --apply should refuse on a dirty tree');
    assert.match(
      apply.stderr,
      /Refusing to apply with a dirty working tree/,
      'should print the dirty-tree refusal message',
    );

    assert.ok(existsSync(join(tmpDir, '.genvid-agent.json')), '.genvid-agent.json should still exist, untouched by apply');
  });
});

// Sanity check that the plugin root resolved from this test's vantage point is
// real, so planStaleConfig's scaffolding steps (CLAUDE.md/TOC.md skeleton
// reads) have somewhere real to read from.
test('sanity: plugin root resolves to a real directory with skeleton files', () => {
  assert.ok(existsSync(join(PLUGIN_ROOT, 'skeleton', 'CLAUDE.md')), 'plugin/skeleton/CLAUDE.md should exist');
});
