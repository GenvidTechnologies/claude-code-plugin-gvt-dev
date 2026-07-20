import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

import { listFiles, listMarkdown } from '../lib/fs-walk.mjs';

async function withTempRepo(setup) {
  const dir = await mkdtemp(join(tmpdir(), 'fs-walk-test-'));
  try {
    await setup(dir);
    return dir;
  } catch (err) {
    await rm(dir, { recursive: true, force: true });
    throw err;
  }
}

async function writeRepoFile(dir, rel, content) {
  const path = join(dir, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

test('listFiles: enumerates files matching the predicate, recursively, as repo-relative posix paths', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'docs/a.md', 'a\n');
    await writeRepoFile(d, 'docs/sub/b.md', 'b\n');
    await writeRepoFile(d, 'docs/c.txt', 'c\n');
  });
  try {
    const files = await listFiles(dir, 'docs', (name) => name.endsWith('.md'));
    assert.deepEqual(files.sort(), ['docs/a.md', 'docs/sub/b.md'].sort());
    assert.ok(files.every((f) => !f.includes('\\')), 'paths must use forward slashes');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('listFiles: missing subdirectory -> []', async () => {
  const dir = await withTempRepo(async () => {});
  try {
    const files = await listFiles(dir, 'nope', () => true);
    assert.deepEqual(files, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('listMarkdown: recursively lists *.md files under <repoRoot>/<sub>', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'docs/a.md', 'a\n');
    await writeRepoFile(d, 'docs/nested/deep/b.md', 'b\n');
    await writeRepoFile(d, 'docs/c.json', '{}\n');
  });
  try {
    const files = await listMarkdown(dir, 'docs');
    assert.deepEqual(files.sort(), ['docs/a.md', 'docs/nested/deep/b.md'].sort());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('listMarkdown: missing docs/ dir -> []', async () => {
  const dir = await withTempRepo(async () => {});
  try {
    const files = await listMarkdown(dir, 'docs');
    assert.deepEqual(files, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
