import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, readFileSync } from 'node:fs';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  detectWikiAdoption,
  SCHEMA_EXPECTATION,
  VERDICT_ABSENT,
  VERDICT_PARTIAL,
  VERDICT_ADOPTED,
} from '../lib/practice-detect.mjs';
import { extractFrontmatter } from '../lib/frontmatter.mjs';

async function withTempRepo(setup) {
  const dir = await mkdtemp(join(tmpdir(), 'practice-detect-test-'));
  try {
    await setup(dir);
    return dir;
  } catch (err) {
    await rm(dir, { recursive: true, force: true });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// T9 — three verdicts
// ---------------------------------------------------------------------------

test('detectWikiAdoption: all six signals present -> adopted', async () => {
  const dir = await withTempRepo(async (d) => {
    await mkdir(join(d, 'wiki'), { recursive: true });
    await fs.writeFile(join(d, 'wiki', 'index.md'), '# Index\n');
    await fs.writeFile(join(d, 'wiki', 'log.md'), '# Log\n');
    await mkdir(join(d, 'raw'), { recursive: true });
    await mkdir(join(d, 'docs'), { recursive: true });
    await fs.writeFile(join(d, 'docs', 'wiki-schema.md'), '# Schema\n');
  });
  try {
    const { signals, verdict } = await detectWikiAdoption(dir, { wiki: {} });
    assert.equal(verdict, VERDICT_ADOPTED);
    assert.deepEqual(signals, {
      wikiDir: true,
      index: true,
      log: true,
      rawDir: true,
      schemaDoc: true,
      configBlock: true,
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('detectWikiAdoption: nothing present, no config -> absent', async () => {
  const dir = await withTempRepo(async () => {});
  try {
    const { signals, verdict } = await detectWikiAdoption(dir, undefined);
    assert.equal(verdict, VERDICT_ABSENT);
    assert.deepEqual(signals, {
      wikiDir: false,
      index: false,
      log: false,
      rawDir: false,
      schemaDoc: false,
      configBlock: false,
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// The important case: wiki/ and raw/ present, but no schema doc — a state
// maintain-wiki explicitly calls "normal, supported" (not every wiki adopter
// needs the schema doc scaffolded). This exists only as a fixture — no real
// repo in this project is in this state.
test('detectWikiAdoption: wiki/ + raw/ present, schema doc absent -> partial', async () => {
  const dir = await withTempRepo(async (d) => {
    await mkdir(join(d, 'wiki'), { recursive: true });
    await fs.writeFile(join(d, 'wiki', 'index.md'), '# Index\n');
    await fs.writeFile(join(d, 'wiki', 'log.md'), '# Log\n');
    await mkdir(join(d, 'raw'), { recursive: true });
    // No docs/wiki-schema.md, no config.wiki block.
  });
  try {
    const { signals, verdict } = await detectWikiAdoption(dir, undefined);
    assert.equal(verdict, VERDICT_PARTIAL);
    assert.deepEqual(signals, {
      wikiDir: true,
      index: true,
      log: true,
      rawDir: true,
      schemaDoc: false,
      configBlock: false,
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// custom wikiDir/rawDir + default probing
// ---------------------------------------------------------------------------

test('detectWikiAdoption: custom wikiDir/rawDir from config are honored', async () => {
  const dir = await withTempRepo(async (d) => {
    await mkdir(join(d, 'notes'), { recursive: true });
    await fs.writeFile(join(d, 'notes', 'index.md'), '# Index\n');
    await fs.writeFile(join(d, 'notes', 'log.md'), '# Log\n');
    await mkdir(join(d, 'source'), { recursive: true });
    await mkdir(join(d, 'docs'), { recursive: true });
    await fs.writeFile(join(d, 'docs', 'wiki-schema.md'), '# Schema\n');
    // Also create default-named dirs that should NOT be probed, to prove
    // the custom names take precedence over the defaults.
    await mkdir(join(d, 'wiki'), { recursive: true });
  });
  try {
    const config = { wiki: { wikiDir: 'notes', rawDir: 'source' } };
    const { signals, verdict } = await detectWikiAdoption(dir, config);
    assert.equal(verdict, VERDICT_ADOPTED);
    assert.deepEqual(signals, {
      wikiDir: true,
      index: true,
      log: true,
      rawDir: true,
      schemaDoc: true,
      configBlock: true,
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('detectWikiAdoption: no wiki config block -> defaults wiki/ and raw/ are still probed', async () => {
  const dir = await withTempRepo(async (d) => {
    await mkdir(join(d, 'wiki'), { recursive: true });
    await mkdir(join(d, 'raw'), { recursive: true });
  });
  try {
    const { signals, verdict } = await detectWikiAdoption(dir, undefined);
    assert.equal(verdict, VERDICT_PARTIAL);
    assert.equal(signals.wikiDir, true);
    assert.equal(signals.rawDir, true);
    assert.equal(signals.configBlock, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// #385 / ADR-0070 — the schema signal follows maintain-wiki's resolution:
// paths['docs/wiki-schema.md'], else <wikiDir>/schema.md, else docs/wiki-schema.md.
// ---------------------------------------------------------------------------

async function wikiTiers(d, wikiDir = 'wiki') {
  await mkdir(join(d, wikiDir), { recursive: true });
  await fs.writeFile(join(d, wikiDir, 'index.md'), '# Index\n');
  await fs.writeFile(join(d, wikiDir, 'log.md'), '# Log\n');
  await mkdir(join(d, 'raw'), { recursive: true });
}

async function schemaSignal(setup, config) {
  const dir = await withTempRepo(setup);
  try {
    return await detectWikiAdoption(dir, config);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('detectWikiAdoption: schema only at <wikiDir>/schema.md -> schemaDoc true, adopted', async () => {
  const { signals, verdict } = await schemaSignal(async (d) => {
    await wikiTiers(d);
    await fs.writeFile(join(d, 'wiki', 'schema.md'), '# Schema\n');
  }, { wiki: {} });
  assert.equal(signals.schemaDoc, true);
  assert.equal(verdict, VERDICT_ADOPTED);
});

test('detectWikiAdoption: schema at both locations -> schemaDoc true', async () => {
  const { signals } = await schemaSignal(async (d) => {
    await wikiTiers(d);
    await fs.writeFile(join(d, 'wiki', 'schema.md'), '# Schema\n');
    await mkdir(join(d, 'docs'), { recursive: true });
    await fs.writeFile(join(d, 'docs', 'wiki-schema.md'), '# Schema\n');
  }, { wiki: {} });
  assert.equal(signals.schemaDoc, true);
});

test('detectWikiAdoption: custom wikiDir -> <wikiDir>/schema.md is probed, the default wiki/schema.md is not', async () => {
  const hit = await schemaSignal(async (d) => {
    await wikiTiers(d, 'kb');
    await fs.writeFile(join(d, 'kb', 'schema.md'), '# Schema\n');
  }, { wiki: { wikiDir: 'kb' } });
  assert.equal(hit.signals.schemaDoc, true);
  const miss = await schemaSignal(async (d) => {
    await wikiTiers(d, 'kb');
    await mkdir(join(d, 'wiki'), { recursive: true });
    await fs.writeFile(join(d, 'wiki', 'schema.md'), '# Schema\n');
  }, { wiki: { wikiDir: 'kb' } });
  assert.equal(miss.signals.schemaDoc, false);
});

test('detectWikiAdoption: a paths override naming an existing file -> schemaDoc true', async () => {
  const { signals } = await schemaSignal(async (d) => {
    await wikiTiers(d);
    await mkdir(join(d, 'notes'), { recursive: true });
    await fs.writeFile(join(d, 'notes', 'rules.md'), '# Schema\n');
  }, { wiki: {}, paths: { 'docs/wiki-schema.md': 'notes/rules.md' } });
  assert.equal(signals.schemaDoc, true);
});

test('detectWikiAdoption: a dangling override does not fall through to <wikiDir>/schema.md', async () => {
  const { signals } = await schemaSignal(async (d) => {
    await wikiTiers(d);
    await fs.writeFile(join(d, 'wiki', 'schema.md'), '# Schema\n');
  }, { wiki: {}, paths: { 'docs/wiki-schema.md': 'notes/missing.md' } });
  assert.equal(signals.schemaDoc, false);
});

test('SCHEMA_EXPECTATION matches the docs/wiki-schema.md entry maintain-wiki declares', () => {
  const skill = fileURLToPath(new URL('../../../maintain-wiki/SKILL.md', import.meta.url));
  const entry = extractFrontmatter(readFileSync(skill, 'utf8')).metadata.expects.files.find((e) => e.path === 'docs/wiki-schema.md');
  assert.deepEqual({ path: entry.path, prefer: entry.prefer }, { ...SCHEMA_EXPECTATION });
});

test('practice-detect.mjs imports only node:fs, node:path and ./expect-prefer.mjs (no maintain-wiki import)', () => {
  const src = readFileSync(fileURLToPath(new URL('../lib/practice-detect.mjs', import.meta.url)), 'utf8');
  const specs = src.split('\n').filter((l) => l.startsWith('import ')).map((l) => l.slice(l.lastIndexOf(' from ') + 7, -2));
  assert.deepEqual(specs, ['node:fs', 'node:path', './expect-prefer.mjs']);
});
