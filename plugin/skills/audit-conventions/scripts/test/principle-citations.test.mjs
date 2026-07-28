import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

import {
  parsePrincipleNumbers,
  findCitations,
  scanPrincipleCitations,
} from '../lib/principle-citations.mjs';

async function withTempRepo(setup) {
  const dir = await mkdtemp(join(tmpdir(), 'principle-citations-test-'));
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

// Builds a synthetic development-principles.md body with a contiguous
// top-level `1.`..`N.` ordered list, matching the real doc's shape closely
// enough for parsePrincipleNumbers / scanPrincipleCitations fixtures.
function principlesDoc(n) {
  const lines = ['# Development Principles', ''];
  for (let i = 1; i <= n; i++) {
    lines.push(`${i}. **Principle ${i}.** Some descriptive text.`);
  }
  return lines.join('\n') + '\n';
}

// A citing file with the citation on a known line (line 5, 1-based).
function citingContent(n) {
  return ['# Some Skill', '', 'Intro text.', '', `See principle #${n} for details.`].join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// parsePrincipleNumbers
// ---------------------------------------------------------------------------

test('parsePrincipleNumbers: contiguous top-level 1..N list -> Set {1..N}', () => {
  const content = principlesDoc(4);
  const result = parsePrincipleNumbers(content);
  assert.deepEqual(result, new Set([1, 2, 3, 4]));
});

test('parsePrincipleNumbers: a fenced code block containing a numbered list does NOT inflate the set', () => {
  const content = [
    '# Heading',
    '',
    '```',
    '5. fenced item should not count',
    '6. neither should this',
    '```',
    '',
    '1. Real principle one.',
    '2. Real principle two.',
    '3. Real principle three.',
    '',
  ].join('\n');
  const result = parsePrincipleNumbers(content);
  assert.deepEqual(
    result,
    new Set([1, 2, 3]),
    'the fenced 5./6. entries must be skipped, not merged into the real list',
  );
});

test('parsePrincipleNumbers: indented/nested list items are rejected (only column-0 items count)', () => {
  const content = [
    '1. Top-level item.',
    '   5. Indented sub-item, must not count as its own entry.',
    '2. Another top-level item.',
  ].join('\n');
  const result = parsePrincipleNumbers(content);
  assert.deepEqual(
    result,
    new Set([1, 2]),
    'the indented "5." must not be picked up alongside the real top-level 1./2.',
  );
});

test('parsePrincipleNumbers: empty doc -> empty Set', () => {
  const result = parsePrincipleNumbers('');
  assert.deepEqual(result, new Set());
});

test('parsePrincipleNumbers: heading-only doc with no list -> empty Set', () => {
  const content = '# Development Principles\n\nJust prose, no list here.\n';
  const result = parsePrincipleNumbers(content);
  assert.deepEqual(result, new Set());
});

// ---------------------------------------------------------------------------
// findCitations
// ---------------------------------------------------------------------------

test('findCitations: matches "principle #N" form with correct 1-based line number', () => {
  const content = 'Intro.\nSee principle #7 for details.\n';
  const result = findCitations(content);
  assert.deepEqual(result, [{ line: 2, number: 7 }]);
});

test('findCitations: matches "principles #N" (plural) form', () => {
  const content = 'Intro.\nSee principles #8 for details.\n';
  const result = findCitations(content);
  assert.deepEqual(result, [{ line: 2, number: 8 }]);
});

test('findCitations: matches "development-principles.md` #N" form (backtick immediately before the space)', () => {
  const content = 'Intro.\nSee `development-principles.md` #10 for details.\n';
  const result = findCitations(content);
  assert.deepEqual(result, [{ line: 2, number: 10 }]);
});

test('findCitations: does NOT match "Distinct from #6" (no principle/principles keyword)', () => {
  const content = '(Distinct from #6: preview-then-apply guards an irreversible action.)\n';
  const result = findCitations(content);
  assert.deepEqual(result, []);
});

test('findCitations: does NOT match "construct3-chef #136" (an unrelated project reference, not a principle)', () => {
  const content = 'a reviewer trusting the enumerated count misses it too (construct3-chef #136: 3 sites listed).\n';
  const result = findCitations(content);
  assert.deepEqual(result, []);
});

test('findCitations: all three forms together, in order, with correct line numbers, and no false positives from keyword-less refs', () => {
  const content = [
    'See principle #7 for details.', // line 1
    'See principles #8 for details.', // line 2
    'See `development-principles.md` #10 for details.', // line 3
    'Distinct from #6 (should not match).', // line 4
    'construct3-chef #136 unrelated.', // line 5
  ].join('\n');
  const result = findCitations(content);
  assert.deepEqual(result, [
    { line: 1, number: 7 },
    { line: 2, number: 8 },
    { line: 3, number: 10 },
  ]);
});

// ---------------------------------------------------------------------------
// scanPrincipleCitations
// ---------------------------------------------------------------------------

test('scanPrincipleCitations: a citation within the parsed range produces no finding', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'plugin/docs/development-principles.md', principlesDoc(11));
    await writeRepoFile(d, 'plugin/skills/foo/SKILL.md', citingContent(7));
  });
  try {
    const findings = await scanPrincipleCitations(dir);
    assert.deepEqual(findings, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('scanPrincipleCitations: citation #99 against principles 1-11 produces exactly one finding naming file, line, and 99', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'plugin/docs/development-principles.md', principlesDoc(11));
    await writeRepoFile(d, 'plugin/skills/foo/SKILL.md', citingContent(99));
  });
  try {
    const findings = await scanPrincipleCitations(dir);
    assert.equal(findings.length, 1);
    const finding = findings[0];
    assert.equal(finding.kind, 'principle-citation');
    assert.equal(finding.ok, false);
    assert.equal(finding.severity, 'error');
    assert.equal(finding.file, 'plugin/skills/foo/SKILL.md');
    assert.equal(finding.line, 5);
    assert.match(finding.detail, /plugin\/skills\/foo\/SKILL\.md/);
    assert.match(finding.detail, /:5/);
    assert.match(finding.detail, /#?99\b/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('scanPrincipleCitations: renumber simulation — principles doc trimmed to 1-5, a citation to #7 produces a finding', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'plugin/docs/development-principles.md', principlesDoc(5));
    await writeRepoFile(d, 'plugin/skills/foo/SKILL.md', citingContent(7));
  });
  try {
    const findings = await scanPrincipleCitations(dir);
    assert.equal(findings.length, 1);
    const finding = findings[0];
    assert.equal(finding.kind, 'principle-citation');
    assert.equal(finding.severity, 'error');
    assert.equal(finding.file, 'plugin/skills/foo/SKILL.md');
    assert.equal(finding.line, 5);
    assert.match(finding.detail, /#?7\b/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('scanPrincipleCitations: an empty/unparseable principles doc produces EXACTLY ONE parse-failure finding, not one per citation', async () => {
  const dir = await withTempRepo(async (d) => {
    // No top-level ordered list at all -> parsePrincipleNumbers yields an
    // empty Set. Three separate citing files, several citations each, would
    // naively produce many "bad citation" findings — the scanner must
    // instead collapse this to a single parse-failure finding.
    await writeRepoFile(
      d,
      'plugin/docs/development-principles.md',
      '# Development Principles\n\nJust prose, no list here.\n',
    );
    await writeRepoFile(d, 'plugin/skills/foo/SKILL.md', citingContent(7));
    await writeRepoFile(d, 'plugin/skills/bar/SKILL.md', citingContent(3));
    await writeRepoFile(d, 'plugin/agents/baz.md', citingContent(10));
  });
  try {
    const findings = await scanPrincipleCitations(dir);
    assert.equal(
      findings.length,
      1,
      'an unparseable principles doc must yield exactly one finding, not one per citation',
    );
    const finding = findings[0];
    assert.equal(finding.kind, 'principle-citation');
    assert.equal(finding.ok, false);
    assert.equal(finding.severity, 'error');
    assert.equal(finding.file, 'plugin/docs/development-principles.md');
    assert.match(
      finding.detail,
      /could not be parsed|failed to parse|no principles (found|parsed)/i,
      'the detail must communicate a parse failure, not a bad citation number',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
