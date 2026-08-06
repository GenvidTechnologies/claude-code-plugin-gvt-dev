import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { extractFrontmatter } from '../lib/frontmatter.mjs';
import { parsePillars, computePluginCoverage, PILLARS } from '../lib/pillars.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
// scripts/test/pillars.test.mjs -> scripts -> audit-conventions -> skills -> plugin
const PLUGIN_ROOT = resolve(__dirname, '..', '..', '..', '..');

// T5 — extractFrontmatter reads metadata.pillar as a plain scalar.
test('extractFrontmatter: reads metadata.pillar scalar', () => {
  const md = `---
name: maintain-wiki
description: A test description
metadata:
  pillar: environment
---

# Body
`;
  const fm = extractFrontmatter(md);
  assert.equal(fm.metadata.pillar, 'environment');
});

test('extractFrontmatter: metadata.pillar is undefined when the key is absent (positive control)', () => {
  const md = `---
name: maintain-wiki
description: A test description
metadata:
  type: feedback
---

# Body
`;
  const fm = extractFrontmatter(md);
  assert.equal(fm.metadata.pillar, undefined);
});

// T6 — parsePillars: the comma-delimited scalar reader.
test('parsePillars: comma-delimited scalar splits into a trimmed, lowercased list', () => {
  assert.deepEqual(parsePillars('spec, verify'), ['spec', 'verify']);
});

test('parsePillars: undefined yields an empty list', () => {
  assert.deepEqual(parsePillars(undefined), []);
});

test('parsePillars: a single value is lowercased', () => {
  assert.deepEqual(parsePillars('Environment'), ['environment']);
});

// T8 — computePluginCoverage: groups component names by declared pillar,
// including an empty list for a pillar with zero declarers.
test('computePluginCoverage: all four pillars covered yields a non-empty list for each', () => {
  const components = [
    { name: 'a-skill', pillar: 'spec' },
    { name: 'write-eval', pillar: 'verify' },
    { name: 'maintain-wiki', pillar: 'environment' },
    { name: 'build-probe', pillar: 'moldable' },
  ];
  const coverage = computePluginCoverage(components);
  assert.ok(coverage.spec.length > 0);
  assert.ok(coverage.verify.length > 0);
  assert.ok(coverage.environment.length > 0);
  assert.ok(coverage.moldable.length > 0);
});

test('computePluginCoverage: a pillar with zero declarers yields an empty list (positive control)', () => {
  const components = [
    { name: 'a-skill', pillar: 'spec' },
    { name: 'write-eval', pillar: 'verify' },
    { name: 'maintain-wiki', pillar: 'environment' },
    // no component declares 'moldable'
  ];
  const coverage = computePluginCoverage(components);
  assert.deepEqual(coverage.moldable, []);
  assert.ok(coverage.spec.length > 0);
  assert.ok(coverage.verify.length > 0);
  assert.ok(coverage.environment.length > 0);
});

test('computePluginCoverage: a component can declare multiple comma-delimited pillars', () => {
  const components = [{ name: 'both', pillar: 'spec, moldable' }];
  const coverage = computePluginCoverage(components);
  assert.deepEqual(coverage.spec, ['both']);
  assert.deepEqual(coverage.moldable, ['both']);
  assert.deepEqual(coverage.verify, []);
  assert.deepEqual(coverage.environment, []);
});

// T7 — real-tree assertion: walks the actual plugin/skills and plugin/agents
// trees and pins the curated set of components declaring metadata.pillar
// (landed in 4dffa87, curation decision recorded in ADR-0027). If this ever
// fails because someone added or removed a declaration, the test IS the
// specification — update it deliberately, don't just make it pass.
async function collectRealDeclaredComponents() {
  const components = [];

  const skillsDir = join(PLUGIN_ROOT, 'skills');
  const skillEntries = await fs.readdir(skillsDir, { withFileTypes: true });
  for (const entry of skillEntries) {
    if (!entry.isDirectory()) continue;
    const skillFile = join(skillsDir, entry.name, 'SKILL.md');
    let content;
    try {
      content = await fs.readFile(skillFile, 'utf8');
    } catch {
      continue;
    }
    const fm = extractFrontmatter(content);
    const pillar = fm?.metadata?.pillar;
    if (pillar != null) components.push({ name: entry.name, pillar });
  }

  const agentsDir = join(PLUGIN_ROOT, 'agents');
  const agentEntries = await fs.readdir(agentsDir, { withFileTypes: true });
  for (const entry of agentEntries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const content = await fs.readFile(join(agentsDir, entry.name), 'utf8');
    const fm = extractFrontmatter(content);
    const pillar = fm?.metadata?.pillar;
    if (pillar != null) components.push({ name: entry.name.replace(/\.md$/, ''), pillar });
  }

  return components;
}

test('real tree: exactly the intended 11 components declare metadata.pillar, and every value is a known pillar id', async () => {
  const declared = await collectRealDeclaredComponents();

  const expectedByPillar = {
    spec: ['plan-task', 'analyst', 'designer', 'planner'],
    verify: ['audit-conventions', 'validate-changes', 'validator', 'code-reviewer'],
    environment: ['maintain-wiki', 'wiki-librarian'],
    moldable: ['build-probe'],
  };
  const expectedNames = Object.values(expectedByPillar).flat().sort();

  const actualNames = declared.map((c) => c.name).sort();
  assert.deepEqual(
    actualNames,
    expectedNames,
    `declaring component set changed — expected exactly ${JSON.stringify(expectedNames)}, ` +
      `got ${JSON.stringify(actualNames)}`,
  );

  const knownIds = new Set(PILLARS.map((p) => p.id));
  for (const { name, pillar } of declared) {
    for (const id of parsePillars(pillar)) {
      assert.ok(knownIds.has(id), `${name} declares unknown pillar id '${id}'`);
    }
  }

  // Per-pillar membership: catches a component declaring the wrong pillar,
  // which set-of-names equality alone would not (e.g. build-probe declaring
  // 'spec' instead of 'moldable' would still pass the set check above).
  const coverage = computePluginCoverage(declared);
  for (const [pillar, names] of Object.entries(expectedByPillar)) {
    assert.deepEqual(
      [...coverage[pillar]].sort(),
      [...names].sort(),
      `pillar '${pillar}' declarers changed — expected ${JSON.stringify(names)}, ` +
        `got ${JSON.stringify(coverage[pillar])}`,
    );
  }
});
