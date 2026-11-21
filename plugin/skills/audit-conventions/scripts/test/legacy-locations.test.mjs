// legacyLocations / legacyLocationFindings: a document left at the 5.x `docs/`
// location the wiki default replaced is reported, once per declared path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { legacyLocations, legacyLocationFindings } from '../lib/legacy-locations.mjs';

async function withRepo(setup, run) {
  const dir = await mkdtemp(join(tmpdir(), 'legacy-locations-test-'));
  try {
    await setup(dir);
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const ENTRIES = [
  { path: 'docs/TOC.md' },
  { path: 'docs/decisions/' },
  { path: 'docs/absent.md' },
  { path: 'CLAUDE.md' },
];

test('wiki-default: legacyLocations lists a 5.x location while the derived one is absent', async () => {
  await withRepo(
    async (dir) => {
      await mkdir(join(dir, 'docs', 'decisions'), { recursive: true });
      await writeFile(join(dir, 'docs', 'TOC.md'), '# TOC\n');
      await writeFile(join(dir, 'CLAUDE.md'), '# Repo\n');
    },
    async (dir) => {
      // docs/absent.md is not on disk and CLAUDE.md is not under docs/, so
      // neither is listed. The same declared path from two components is one entry.
      const found = await legacyLocations(dir, {}, [...ENTRIES, { path: 'docs/decisions/' }]);
      assert.deepEqual(found, [
        { declared: 'docs/TOC.md', derived: 'wiki/index.md', derivedExists: false },
        { declared: 'docs/decisions/', derived: 'wiki/decisions/', derivedExists: false },
      ]);

      // Once the derived location also holds content it is recorded as such.
      await mkdir(join(dir, 'wiki', 'decisions'), { recursive: true });
      const both = await legacyLocations(dir, {}, ENTRIES);
      assert.deepEqual(
        both.map((l) => [l.declared, l.derivedExists]),
        [['docs/TOC.md', false], ['docs/decisions/', true]],
      );

      // A file where the directory belongs is the wrong kind: not listed.
      await rm(join(dir, 'docs', 'decisions'), { recursive: true });
      await writeFile(join(dir, 'docs', 'decisions'), 'not a directory\n');
      const wrongKind = await legacyLocations(dir, {}, ENTRIES);
      assert.deepEqual(wrongKind.map((l) => l.declared), ['docs/TOC.md']);
    },
  );
});

test('wiki-default: legacyLocations skips an overridden key and a prefer entry', async () => {
  await withRepo(
    async (dir) => {
      await mkdir(join(dir, 'docs', 'decisions'), { recursive: true });
      await writeFile(join(dir, 'docs', 'wiki-schema.md'), '# Schema\n');
      await writeFile(join(dir, 'docs', 'TOC.md'), '# TOC\n');
    },
    async (dir) => {
      const entries = [
        { path: 'docs/TOC.md' },
        { path: 'docs/decisions/' },
        { path: 'docs/wiki-schema.md', prefer: '<wikiDir>/schema.md' },
      ];
      // Every declared path holds content. Only the rule under test keeps
      // the overridden key (a self-pin keeps the 5.x location) and the prefer
      // entry out; the control run lists the same paths without the override.
      const config = { paths: { 'docs/decisions/': 'docs/decisions/' } };
      assert.deepEqual((await legacyLocations(dir, config, entries)).map((l) => l.declared), ['docs/TOC.md']);
      assert.deepEqual(
        (await legacyLocations(dir, {}, entries)).map((l) => l.declared),
        ['docs/TOC.md', 'docs/decisions/'],
      );
      // An override that points elsewhere is skipped too.
      const moved = { paths: { 'docs/TOC.md': 'notes/index.md', 'docs/decisions/': 'adr/' } };
      assert.deepEqual(await legacyLocations(dir, moved, entries), []);
    },
  );
});

test('wiki-default: legacyLocations skips a key whose derived path equals the declared path', async () => {
  await withRepo(
    async (dir) => {
      await mkdir(join(dir, 'docs', 'decisions'), { recursive: true });
    },
    async (dir) => {
      const entries = [{ path: 'docs/decisions/' }];
      // wiki.wikiDir 'docs' derives docs/decisions/ from docs/decisions/.
      assert.deepEqual(await legacyLocations(dir, { wiki: { wikiDir: 'docs' } }, entries), []);
      // Control: the same repo with the default wikiDir lists it.
      assert.deepEqual((await legacyLocations(dir, { wiki: {} }, entries)).map((l) => l.declared), ['docs/decisions/']);
    },
  );
});

test('wiki-default: legacyLocationFindings words each case and names both ways to resolve it', () => {
  const [only, both] = legacyLocationFindings([
    { declared: 'docs/decisions/', derived: 'wiki/decisions/', derivedExists: false },
    { declared: 'docs/decisions/', derived: 'wiki/decisions/', derivedExists: true },
  ]);
  for (const f of [only, both]) {
    assert.equal(f.kind, 'legacy-location');
    assert.equal(f.severity, 'warning');
    assert.match(f.detail, /Set paths\['docs\/decisions\/'\] to "docs\/decisions\/" in \.gvt-agent\.json to keep the 5\.x location/);
    assert.match(f.detail, /or move the content to `wiki\/decisions\/`/);
  }
  assert.match(only.detail, /holds content at the 5\.x location/);
  assert.doesNotMatch(only.detail, /no longer read/);
  assert.match(both.detail, /the wiki-derived location `wiki\/decisions\/` is used; `docs\/decisions\/` is no longer read/);
});
