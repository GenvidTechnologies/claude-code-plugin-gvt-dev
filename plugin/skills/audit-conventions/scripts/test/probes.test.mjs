import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fileExists, dirExists, commandExists } from '../lib/probes.mjs';

async function withTempRepo(setup) {
  const dir = await mkdtemp(join(tmpdir(), 'probes-test-'));
  try {
    await setup(dir);
    return dir;
  } catch (err) {
    await rm(dir, { recursive: true, force: true });
    throw err;
  }
}

test('fileExists: true for a real file', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeFile(join(d, 'a.txt'), 'a\n');
  });
  try {
    assert.equal(await fileExists(join(dir, 'a.txt')), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('fileExists: false for a path that does not exist', async () => {
  const dir = await withTempRepo(async () => {});
  try {
    assert.equal(await fileExists(join(dir, 'nope.txt')), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('fileExists: false for a directory (isFile()-strict)', async () => {
  const dir = await withTempRepo(async (d) => {
    await mkdir(join(d, 'sub'));
  });
  try {
    assert.equal(await fileExists(join(dir, 'sub')), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('dirExists: true for a real directory', async () => {
  const dir = await withTempRepo(async (d) => {
    await mkdir(join(d, 'sub'));
  });
  try {
    assert.equal(await dirExists(join(dir, 'sub')), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('dirExists: false for a path that does not exist', async () => {
  const dir = await withTempRepo(async () => {});
  try {
    assert.equal(await dirExists(join(dir, 'nope')), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('dirExists: false for a file (isDirectory()-strict)', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeFile(join(d, 'a.txt'), 'a\n');
  });
  try {
    assert.equal(await dirExists(join(dir, 'a.txt')), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('commandExists: true for a command that must exist (node), false for an implausible name', () => {
  assert.equal(commandExists('node'), true);
  assert.equal(commandExists('definitely-not-a-real-command-xyz'), false);
});
