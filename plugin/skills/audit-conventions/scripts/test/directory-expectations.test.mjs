// Integration test: a `metadata.expects` file entry whose declared path ends in
// a slash (e.g. `docs/decisions/`, declared by create-adr, plan-task, and
// tech-writer) is a DIRECTORY expectation and must be satisfied by a directory
// on disk.
//
// The regression this pins: evaluateFile checked every declared path through
// fileExists(), which is isFile()-strict. A directory therefore ALWAYS reported
// "file not found" regardless of what was on disk — three permanently-false
// Info lines in this repo's own audit, a consuming repo that had scaffolded
// docs/decisions/ being told it hadn't, and a latent hard failure the moment
// any directory expectation is marked required.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
// scripts/test/directory-expectations.test.mjs -> scripts
const AUDIT_PATH = resolve(__dirname, '..', 'audit.mjs');

function spawnAudit(args, cwd) {
  return spawnSync(process.execPath, [AUDIT_PATH, ...args], { cwd, encoding: 'utf8' });
}

// Minimal STATE_MIGRATED repo (state is detected solely by .gvt-agent.json).
// CLAUDE.md and docs/TOC.md are written so the assertions below stay isolated
// to the directory-expectation finding rather than tripping on unrelated
// required-file errors from other components.
async function withTempRepo(setup) {
  const dir = await mkdtemp(join(tmpdir(), 'audit-dir-expect-test-'));
  try {
    await writeFile(
      join(dir, '.gvt-agent.json'),
      JSON.stringify({ project: { name: 'foo' }, commands: { validate: 'echo ok' } }, null, 2),
    );
    await writeFile(join(dir, 'CLAUDE.md'), '# Test repo\n');
    await mkdir(join(dir, 'docs'), { recursive: true });
    await writeFile(join(dir, 'docs', 'TOC.md'), '# TOC\n');
    if (setup) await setup(dir);
    return dir;
  } catch (err) {
    await rm(dir, { recursive: true, force: true });
    throw err;
  }
}

test('audit: an existing docs/decisions/ directory SATISFIES the directory expectation', async () => {
  const tmpDir = await withTempRepo(async (dir) => {
    await mkdir(join(dir, 'docs', 'decisions'), { recursive: true });
  });
  try {
    const result = spawnAudit([], tmpDir);

    // The whole point of the regression: this used to report "file not found"
    // for a directory that plainly exists.
    assert.doesNotMatch(
      result.stdout,
      /docs\/decisions\/.*not found/,
      'an existing docs/decisions/ directory must not be reported as missing',
    );
    assert.equal(result.status, 0, 'optional expectations never gate the exit code');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('audit: a MISSING docs/decisions/ is reported as a directory, not a file', async () => {
  const tmpDir = await withTempRepo();
  try {
    const result = spawnAudit([], tmpDir);

    assert.match(
      result.stdout,
      /docs\/decisions\/.*directory not found \(optional\)/,
      'a missing directory expectation should say "directory not found", not "file not found"',
    );
    assert.equal(result.status, 0, 'it is an optional expectation, so the exit code stays 0');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('audit: a plain (no trailing slash) file expectation is still checked as a file', async () => {
  // Guards the branch from over-reaching: CLAUDE.md is declared WITHOUT a
  // trailing slash, so creating a *directory* at that path must NOT satisfy it.
  const tmpDir = await mkdtemp(join(tmpdir(), 'audit-dir-expect-neg-'));
  try {
    await writeFile(
      join(tmpDir, '.gvt-agent.json'),
      JSON.stringify({ project: { name: 'foo' }, commands: { validate: 'echo ok' } }, null, 2),
    );
    await mkdir(join(tmpDir, 'CLAUDE.md'), { recursive: true }); // a DIRECTORY named CLAUDE.md

    const result = spawnAudit([], tmpDir);

    assert.match(
      result.stdout,
      /CLAUDE\.md.*file not found/,
      'a directory must not satisfy a file expectation',
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});
