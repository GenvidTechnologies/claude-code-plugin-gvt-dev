import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractFrontmatter } from '../lib/frontmatter.mjs';
import { parsePillars, computePluginCoverage } from '../lib/pillars.mjs';

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
