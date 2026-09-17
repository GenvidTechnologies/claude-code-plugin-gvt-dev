import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

import { wikiPageCandidates, wikiIndexPaths } from '../lib/wiki-pages.mjs';

async function withTempRepo(setup) {
  const dir = await mkdtemp(join(tmpdir(), 'wiki-pages-test-'));
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

// A bundle with a bundle-root index/log, a subdirectory index, and concept
// pages at both levels — shared by several tests below.
async function makeBundle() {
  return withTempRepo(async (d) => {
    await writeRepoFile(d, 'wiki/index.md', '# Index\n');
    await writeRepoFile(d, 'wiki/log.md', '# Log\n');
    await writeRepoFile(d, 'wiki/top-concept.md', '# Top concept\n');
    await writeRepoFile(d, 'wiki/sub/index.md', '# Sub index\n');
    await writeRepoFile(d, 'wiki/sub/log.md', '# A reserved-named file, nested\n');
    await writeRepoFile(d, 'wiki/sub/sub-concept.md', '# Sub concept\n');
  });
}

// ---------------------------------------------------------------------------
// Candidate set = <wikiDir>/**/*.md minus index.md and log.md AT ANY LEVEL —
// this is the exact case the naive (root-index-only) approach gets wrong:
// wiki/sub/log.md is a reserved file, not an orphan candidate.
// ---------------------------------------------------------------------------

test('wikiPageCandidates: excludes index.md and log.md at every level, not just the bundle root', async () => {
  const dir = await makeBundle();
  try {
    const candidates = await wikiPageCandidates(dir, 'wiki');
    assert.deepEqual(candidates, ['wiki/sub/sub-concept.md', 'wiki/top-concept.md']);
    // The naive approach's exact false positive: a nested log.md must NOT
    // appear as a candidate.
    assert.ok(!candidates.includes('wiki/sub/log.md'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('wikiPageCandidates: an empty bundle (only reserved files) yields zero candidates', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'wiki/index.md', '# Index\n');
    await writeRepoFile(d, 'wiki/log.md', '# Log\n');
  });
  try {
    const candidates = await wikiPageCandidates(dir, 'wiki');
    assert.deepEqual(candidates, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC31 — degenerate wikiDir values must never walk the repo, each with the
// required non-vacuous control.
// ---------------------------------------------------------------------------

test('AC31: degenerate wikiDir values yield zero candidates, never a repo-root walk', async () => {
  const dir = await makeBundle();
  try {
    // Control, same temp repo: a real wikiDir yields > 0 candidates. Without
    // this, "returns zero" would be satisfied by a module that always
    // returns nothing.
    const control = await wikiPageCandidates(dir, 'wiki');
    assert.ok(control.length > 0, 'control must be non-vacuous');

    for (const degenerate of [undefined, '', '.', '/', join(dir, 'wiki')]) {
      const result = await wikiPageCandidates(dir, degenerate);
      assert.deepEqual(
        result,
        [],
        `wikiDir=${JSON.stringify(degenerate)} must yield zero candidates`,
      );
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('AC31 (index-paths side): the same degenerate wikiDir values yield {} from wikiIndexPaths too', async () => {
  const dir = await makeBundle();
  try {
    const control = await wikiIndexPaths(dir, 'wiki');
    assert.ok(Object.keys(control).length > 0, 'control must be non-vacuous');

    for (const degenerate of [undefined, '', '.', '/', join(dir, 'wiki')]) {
      const result = await wikiIndexPaths(dir, degenerate);
      assert.deepEqual(result, {}, `wikiDir=${JSON.stringify(degenerate)} must yield {}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a wikiDir naming a directory that does not exist on disk yields [], not a throw', async () => {
  const dir = await withTempRepo(async () => {});
  try {
    const candidates = await wikiPageCandidates(dir, 'no-such-wiki');
    assert.deepEqual(candidates, []);
    const indexes = await wikiIndexPaths(dir, 'no-such-wiki');
    assert.deepEqual(indexes, {});
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a wikiDir escaping repoRoot via .. yields [], not a walk above the repo', async () => {
  const dir = await makeBundle();
  try {
    const candidates = await wikiPageCandidates(dir, '../wiki');
    assert.deepEqual(candidates, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// wikiIndexPaths: bundle-root and subdirectory indexes, keyed by their own
// directory.
// ---------------------------------------------------------------------------

test('wikiIndexPaths: maps each index.md to its own directory, root and subdirectory alike', async () => {
  const dir = await makeBundle();
  try {
    const indexes = await wikiIndexPaths(dir, 'wiki');
    assert.deepEqual(indexes, {
      wiki: 'wiki/index.md',
      'wiki/sub': 'wiki/sub/index.md',
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('wikiIndexPaths: a bundle with no index.md anywhere yields {}', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'wiki/log.md', '# Log\n');
    await writeRepoFile(d, 'wiki/only-concept.md', '# Only concept\n');
  });
  try {
    const indexes = await wikiIndexPaths(dir, 'wiki');
    assert.deepEqual(indexes, {});
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Path shape: repo-relative, forward-slash, matching md-links.mjs's shape.
// ---------------------------------------------------------------------------

test('returned paths are repo-relative and forward-slash regardless of platform separators', async () => {
  const dir = await makeBundle();
  try {
    const candidates = await wikiPageCandidates(dir, 'wiki');
    for (const c of candidates) {
      assert.ok(!c.includes('\\'), `${c} must not contain a backslash`);
      assert.ok(!c.startsWith('/'), `${c} must be repo-relative, not absolute`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
