import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { gitRemoteUrl, gitDefaultBranch } from '../lib/git-info.mjs';

async function withTempRepo(setup) {
  const dir = await mkdtemp(join(tmpdir(), 'git-info-test-'));
  try {
    await setup(dir);
    return dir;
  } catch (err) {
    await rm(dir, { recursive: true, force: true });
    throw err;
  }
}

function git(dir, args) {
  const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

test('gitRemoteUrl: not a git repo degrades to null (no throw)', async () => {
  const dir = await withTempRepo(async () => {});
  try {
    assert.equal(gitRemoteUrl(dir), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('gitRemoteUrl: git repo with no remote degrades to null (no throw)', async () => {
  const dir = await withTempRepo(async (d) => {
    git(d, ['init', '-q', '.']);
  });
  try {
    assert.equal(gitRemoteUrl(dir), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('gitRemoteUrl: git repo with an origin remote returns the URL', async () => {
  const dir = await withTempRepo(async (d) => {
    git(d, ['init', '-q', '.']);
    git(d, ['remote', 'add', 'origin', 'https://example.com/org/repo.git']);
  });
  try {
    assert.equal(gitRemoteUrl(dir), 'https://example.com/org/repo.git');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('gitDefaultBranch: not a git repo degrades to null (no throw)', async () => {
  const dir = await withTempRepo(async () => {});
  try {
    assert.equal(gitDefaultBranch(dir), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('gitDefaultBranch: git repo with no origin/HEAD symbolic ref degrades to null', async () => {
  const dir = await withTempRepo(async (d) => {
    git(d, ['init', '-q', '.']);
    git(d, ['remote', 'add', 'origin', 'https://example.com/org/repo.git']);
  });
  try {
    assert.equal(gitDefaultBranch(dir), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('gitDefaultBranch: resolves refs/remotes/origin/HEAD and strips the "origin/" prefix', async () => {
  const dir = await withTempRepo(async (d) => {
    git(d, ['init', '-q', '.']);
    git(d, ['remote', 'add', 'origin', 'https://example.com/org/repo.git']);
    git(d, ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main']);
  });
  try {
    assert.equal(gitDefaultBranch(dir), 'main');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
