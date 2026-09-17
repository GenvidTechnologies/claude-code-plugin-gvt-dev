import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

import { extractLinks, resolveLink, scanPageLinks } from '../lib/md-links.mjs';

async function withTempRepo(setup) {
  const dir = await mkdtemp(join(tmpdir(), 'md-links-test-'));
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

// ---------------------------------------------------------------------------
// AC29 — bundle-absolute (/other-page.md) resolves against <wikiDir>/, not
// repoRoot, with a positive control proving the resolver can still fail.
// ---------------------------------------------------------------------------

test('AC29: /other-page.md resolves against <wikiDir>/, not repoRoot; /nope.md is dead', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'wiki/other-page.md', '# Other page\n');
    await writeRepoFile(d, 'wiki/sub/deep.md', '[good](/other-page.md)\n[bad](/nope.md)\n');
  });
  try {
    const content = await readFile(join(dir, 'wiki/sub/deep.md'), 'utf8');
    const results = await scanPageLinks(dir, 'wiki', 'wiki/sub/deep.md', content);
    assert.equal(results.length, 2);

    const good = results.find((r) => r.target === '/other-page.md');
    assert.equal(good.resolvedRelPath, 'wiki/other-page.md');
    assert.equal(good.insideBundle, true);
    assert.equal(good.exists, true); // NOT dead

    // Positive control, same fixture: a bundle-absolute link to a page that
    // genuinely doesn't exist IS reported dead — proves the resolver isn't
    // vacuously reporting everything as fine.
    const bad = results.find((r) => r.target === '/nope.md');
    assert.equal(bad.resolvedRelPath, 'wiki/nope.md');
    assert.equal(bad.insideBundle, true);
    assert.equal(bad.exists, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC30 — fence + inline-code masking, with a control proving the same text
// outside a code construct IS scanned.
// ---------------------------------------------------------------------------

test('AC30: link-shaped text inside an inline code span and a fenced block -> 0 dead links', async () => {
  const dir = await withTempRepo(async (d) => {
    const content = [
      'See `[example](/nope.md)` for the format.',
      '',
      '```md',
      '[example](/nope.md)',
      '```',
      '',
    ].join('\n');
    await writeRepoFile(d, 'wiki/page.md', content);
  });
  try {
    const content = await readFile(join(dir, 'wiki/page.md'), 'utf8');
    const results = await scanPageLinks(dir, 'wiki', 'wiki/page.md', content);
    assert.equal(results.length, 0); // masked out entirely — nothing to resolve
    const dead = results.filter((r) => r.insideBundle && !r.exists);
    assert.equal(dead.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('AC30 control: the same link text outside any code construct -> 1 dead link', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'wiki/page.md', '[example](/nope.md)\n');
  });
  try {
    const content = await readFile(join(dir, 'wiki/page.md'), 'utf8');
    const results = await scanPageLinks(dir, 'wiki', 'wiki/page.md', content);
    assert.equal(results.length, 1);
    const dead = results.filter((r) => r.insideBundle && !r.exists);
    assert.equal(dead.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Ordinary relative resolution, from a subdirectory page
// ---------------------------------------------------------------------------

test('relative link resolves against the linking page\'s own directory, not the bundle root', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'wiki/sub/sibling.md', '# Sibling\n');
    await writeRepoFile(d, 'wiki/top.md', '# Top\n');
    await writeRepoFile(
      d,
      'wiki/sub/deep.md',
      '[sibling](./sibling.md)\n[bare](sibling.md)\n[up](../top.md)\n',
    );
  });
  try {
    const content = await readFile(join(dir, 'wiki/sub/deep.md'), 'utf8');
    const results = await scanPageLinks(dir, 'wiki', 'wiki/sub/deep.md', content);
    assert.equal(results.length, 3);

    const dotSlash = results.find((r) => r.target === './sibling.md');
    assert.equal(dotSlash.resolvedRelPath, 'wiki/sub/sibling.md');
    assert.equal(dotSlash.insideBundle, true);
    assert.equal(dotSlash.exists, true);

    const bare = results.find((r) => r.target === 'sibling.md');
    assert.equal(bare.resolvedRelPath, 'wiki/sub/sibling.md');
    assert.equal(bare.exists, true);

    const up = results.find((r) => r.target === '../top.md');
    assert.equal(up.resolvedRelPath, 'wiki/top.md');
    assert.equal(up.insideBundle, true);
    assert.equal(up.exists, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// A relative link that escapes the bundle is out-of-bundle, not dead
// ---------------------------------------------------------------------------

test('a relative link escaping <wikiDir>/ resolves outside the bundle, not as a dead link', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'docs/decisions/0001-x.md', '# ADR\n');
    await writeRepoFile(d, 'wiki/page.md', '[adr](../docs/decisions/0001-x.md)\n');
  });
  try {
    const content = await readFile(join(dir, 'wiki/page.md'), 'utf8');
    const results = await scanPageLinks(dir, 'wiki', 'wiki/page.md', content);
    assert.equal(results.length, 1);
    assert.equal(results[0].insideBundle, false);
    assert.equal(results[0].resolvedRelPath, 'docs/decisions/0001-x.md');
    // Out-of-bundle is its own category, independent of on-disk existence —
    // this module must not fold it into "dead" just because it happens to
    // exist here.
    assert.equal(results[0].exists, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Fragment stripping
// ---------------------------------------------------------------------------

test('a #section fragment is stripped before resolving', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'wiki/other-page.md', '# Other page\n');
    await writeRepoFile(d, 'wiki/page.md', '[jump](/other-page.md#some-heading)\n');
  });
  try {
    const content = await readFile(join(dir, 'wiki/page.md'), 'utf8');
    const results = await scanPageLinks(dir, 'wiki', 'wiki/page.md', content);
    assert.equal(results.length, 1);
    assert.equal(results[0].rawTarget, '/other-page.md#some-heading');
    assert.equal(results[0].target, '/other-page.md');
    assert.equal(results[0].resolvedRelPath, 'wiki/other-page.md');
    assert.equal(results[0].exists, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Skips: external URLs, mailto, and bare anchors
// ---------------------------------------------------------------------------

test('extractLinks skips external URLs, mailto links, and bare #anchor fragments', () => {
  const content = [
    '[site](https://example.com/page.md)',
    '[secure](http://example.com)',
    '[mail](mailto:someone@example.com)',
    '[section](#some-heading)',
    '[real](./real.md)',
  ].join('\n');
  const links = extractLinks(content);
  assert.equal(links.length, 1);
  assert.equal(links[0].target, './real.md');
});

// ---------------------------------------------------------------------------
// resolveLink used standalone (not every caller goes through scanPageLinks)
// ---------------------------------------------------------------------------

test('resolveLink: a bundle-absolute target from the bundle root page itself', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'wiki/index.md', '# Index\n');
  });
  try {
    const result = await resolveLink(dir, 'wiki', 'wiki/index.md', '/index.md');
    assert.equal(result.insideBundle, true);
    assert.equal(result.exists, true);
    assert.equal(result.resolvedRelPath, 'wiki/index.md');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
