import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { walkComponents, loadComponent } from '../lib/component-walk.mjs';
import { extractFrontmatter } from '../lib/frontmatter.mjs';
import { descriptionLength, descriptionLengthOf } from '../lib/description-length.mjs';
import { listFiles } from '../lib/fs-walk.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
// scripts/test -> scripts -> audit-conventions -> skills -> plugin
const PLUGIN_ROOT = join(SCRIPT_DIR, '..', '..', '..', '..');

async function withTempRepo(setup) {
  const dir = await mkdtemp(join(tmpdir(), 'component-walk-test-'));
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

test('walkComponents: a skills/<name>/SKILL.md fixture is discovered as {type: "skill"}', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'skills/my-skill/SKILL.md', '---\nname: my-skill\ndescription: x\n---\nbody\n');
  });
  try {
    const components = await walkComponents(dir);
    assert.deepEqual(
      components.map((c) => ({ type: c.type, name: c.name })),
      [{ type: 'skill', name: 'my-skill' }]
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('walkComponents: a skills/<name>/ directory without SKILL.md is skipped', async () => {
  const dir = await withTempRepo(async (d) => {
    await mkdir(join(d, 'skills', 'no-manifest'), { recursive: true });
    await writeRepoFile(d, 'skills/no-manifest/notes.md', 'not a manifest\n');
  });
  try {
    const components = await walkComponents(dir);
    assert.deepEqual(components, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('walkComponents: a non-.md file in agents/ is skipped', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'agents/notes.txt', 'not an agent\n');
  });
  try {
    const components = await walkComponents(dir);
    assert.deepEqual(components, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('walkComponents: a missing skills/ directory is tolerated (returns only agents)', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'agents/my-agent.md', '---\nname: my-agent\ndescription: x\n---\nbody\n');
  });
  try {
    const components = await walkComponents(dir);
    assert.deepEqual(
      components.map((c) => ({ type: c.type, name: c.name })),
      [{ type: 'agent', name: 'my-agent' }]
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('walkComponents: a missing agents/ directory is tolerated (returns only skills)', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'skills/my-skill/SKILL.md', '---\nname: my-skill\ndescription: x\n---\nbody\n');
  });
  try {
    const components = await walkComponents(dir);
    assert.deepEqual(
      components.map((c) => ({ type: c.type, name: c.name })),
      [{ type: 'skill', name: 'my-skill' }]
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadComponent: a file with no frontmatter yields {expects: null, frontmatter: null}', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'skills/plain/SKILL.md', 'no frontmatter here\n');
  });
  try {
    const component = await loadComponent('skill', 'plain', join(dir, 'skills', 'plain', 'SKILL.md'));
    assert.deepEqual(component, { type: 'skill', name: 'plain', expects: null, frontmatter: null });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('walkComponents: rejects with TypeError when pluginRoot is missing or not a string', async () => {
  await assert.rejects(() => walkComponents(undefined), TypeError);
  await assert.rejects(() => walkComponents(123), TypeError);
});

test('descriptionLengthOf/descriptionLength differential: agree on every real skill/agent component in this repo', async () => {
  const skillFiles = await listFiles(PLUGIN_ROOT, 'skills', (name) => name === 'SKILL.md');
  const agentFiles = await listFiles(PLUGIN_ROOT, 'agents', (name) => name.endsWith('.md'));
  const allFiles = [...skillFiles, ...agentFiles];

  assert.equal(allFiles.length, 32, 'expected 32 real skill/agent components in this repo');

  let agreementCount = 0;
  let nonEmptyCount = 0;

  for (const rel of allFiles) {
    const content = await readFile(join(PLUGIN_ROOT, rel), 'utf8');
    const viaContent = descriptionLength(content);
    const viaFrontmatter = descriptionLengthOf(extractFrontmatter(content));
    assert.equal(viaFrontmatter, viaContent, `descriptionLengthOf must equal descriptionLength for ${rel}`);
    agreementCount++;
    if (viaContent > 0) nonEmptyCount++;
  }

  assert.equal(agreementCount, 32);
  assert.ok(nonEmptyCount > 0, 'at least one component must have a non-empty description to make the differential meaningful');

  // Surfaced for the task report, not asserted against a hardcoded figure:
  // the differential's value is carried by its non-empty (positive) cases.
  console.log(`descriptionLength differential: ${agreementCount} agree, ${nonEmptyCount} non-empty`);
});
