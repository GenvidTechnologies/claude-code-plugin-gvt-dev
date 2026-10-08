// create-adr-evals/test/grade.test.mjs
//
// Unit tests for grade.mjs's deterministic grader — no model calls. Each
// test starts from a real fixture (fixtures.buildFixture), then hand-writes
// the filesystem changes a model run would have produced (correct or
// defective), and asserts gradeRun()'s verdict. This is what #582 T2's row
// 13 ("D4: grader discriminates") and the harness README's "D1-D7 are
// deterministic" claim rest on — a correct tree must grade PASS and each
// named defect must grade FAIL, including one that proves lintWiki is
// actually wired in rather than a hand-rolled, narrower proxy for it (see
// CLAUDE.md's "check earns trust from the pair of inputs it can tell apart"
// rule — the orphan case below is that pair's negative half).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, mkdirSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

import { buildFixture } from '../fixtures.mjs';
import { gradeRun } from '../grade.mjs';

function write(root, relPath, content) {
  const abs = join(root, ...relPath.split('/'));
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf8');
}

function appendToIndex(root, relPath, entry) {
  appendFileSync(join(root, relPath), entry, 'utf8');
}

function cleanup(root) {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

const WIKI_RECORD_BODY = (num, title) => `# ${num}. ${title}

- **Status:** accepted
- **Date:** 2026-03-01
- **Issue:** none

## Context

Test context.

## Decision

Test decision.

## Compromise

Test compromise.

## Consequences

Test consequences.
`;

function wikiRecordWithFrontmatter(num, theme, title) {
  return `---
type: decision-record
title: '${title}'
description: 'A test decision for the create-adr-evals grader'
tags: [decisions, ${theme}]
status: stable
---

${WIKI_RECORD_BODY(num, title)}`;
}

// ---------------------------------------------------------------------------
// Wiki variants (A / A-infer / C share gradeWikiRun)
// ---------------------------------------------------------------------------

test('gradeRun: a correctly authored wiki-themed ADR passes every assertion', async () => {
  const { root, before, meta } = buildFixture('A');
  try {
    write(root, 'wiki/decisions/beta/0004-test-decision.md', wikiRecordWithFrontmatter('0004', 'beta', 'Test decision'));
    appendToIndex(root, 'wiki/decisions/beta/index.md', '* [Test decision](0004-test-decision.md) - a test decision\n');

    const result = await gradeRun({ variant: 'A', root, before, meta });
    assert.equal(result.allDeterministicPass, true, JSON.stringify(result.reasons));
    assert.equal(result.assertions.d1, true);
    assert.equal(result.assertions.d2, true);
    assert.equal(result.assertions.d3, true);
    assert.equal(result.assertions.d4, true);
    assert.equal(result.assertions.d5, true);
    assert.equal(result.assertions.d6, true);
    assert.equal(result.assertions.d7, true);
    assert.equal(result.theme, 'beta');
    assert.equal(result.newNumber, 4);
    assert.equal(result.newThemeCreated, false);
  } finally {
    cleanup(root);
  }
});

test('gradeRun: FAILs when the new record lands in docs/decisions/ instead of the wiki override', async () => {
  const { root, before, meta } = buildFixture('A');
  try {
    write(root, 'docs/decisions/0004-test-decision.md', `# 0004. Test decision\n`);

    const result = await gradeRun({ variant: 'A', root, before, meta });
    assert.equal(result.allDeterministicPass, false);
    assert.equal(result.assertions.d1, false);
    assert.equal(result.assertions.d2, false);
  } finally {
    cleanup(root);
  }
});

test('gradeRun: FAILs when the new record carries no frontmatter', async () => {
  const { root, before, meta } = buildFixture('A');
  try {
    write(root, 'wiki/decisions/beta/0004-test-decision.md', WIKI_RECORD_BODY('0004', 'Test decision'));
    appendToIndex(root, 'wiki/decisions/beta/index.md', '* [Test decision](0004-test-decision.md) - a test decision\n');

    const result = await gradeRun({ variant: 'A', root, before, meta });
    assert.equal(result.allDeterministicPass, false);
    assert.equal(result.assertions.d3, false);
  } finally {
    cleanup(root);
  }
});

test('gradeRun: FAILs when the new record is never registered in its theme index', async () => {
  const { root, before, meta } = buildFixture('A');
  try {
    write(root, 'wiki/decisions/beta/0004-test-decision.md', wikiRecordWithFrontmatter('0004', 'beta', 'Test decision'));
    // Deliberately do NOT append to wiki/decisions/beta/index.md.

    const result = await gradeRun({ variant: 'A', root, before, meta });
    assert.equal(result.allDeterministicPass, false);
    assert.equal(result.assertions.d4, false);
  } finally {
    cleanup(root);
  }
});

test('gradeRun: FAILs on a real, unrelated wiki orphan — proves lintWiki is actually wired in', async () => {
  const { root, before, meta } = buildFixture('A');
  try {
    // The new record itself is placed and registered correctly...
    write(root, 'wiki/decisions/beta/0004-test-decision.md', wikiRecordWithFrontmatter('0004', 'beta', 'Test decision'));
    appendToIndex(root, 'wiki/decisions/beta/index.md', '* [Test decision](0004-test-decision.md) - a test decision\n');
    // ...but an unrelated page elsewhere in the wiki bundle is orphaned. A
    // grader that only checked "is the NEW file linked" would still pass
    // this; one that runs the real lintWiki must not.
    write(root, 'wiki/unrelated-orphan.md', '---\ntype: practice-note\ntitle: \'Orphan\'\n---\n\n# Orphan\n\nNo index links here.\n');

    const result = await gradeRun({ variant: 'A', root, before, meta });
    assert.equal(result.allDeterministicPass, false);
    assert.equal(result.assertions.d4, false);
    assert.ok(result.reasons.some((r) => r.startsWith('D4:') && r.includes('orphan')));
  } finally {
    cleanup(root);
  }
});

test('gradeRun: FAILs when the new record uses the wrong number', async () => {
  const { root, before, meta } = buildFixture('A');
  try {
    write(root, 'wiki/decisions/beta/0005-test-decision.md', wikiRecordWithFrontmatter('0005', 'beta', 'Test decision'));
    appendToIndex(root, 'wiki/decisions/beta/index.md', '* [Test decision](0005-test-decision.md) - a test decision\n');

    const result = await gradeRun({ variant: 'A', root, before, meta });
    assert.equal(result.allDeterministicPass, false);
    assert.equal(result.assertions.d1, false);
  } finally {
    cleanup(root);
  }
});

test('gradeRun: A-infer accepts either pre-existing theme and flags a genuinely new one', async () => {
  const { root, before, meta } = buildFixture('A-infer');
  try {
    write(root, 'wiki/decisions/alpha/0004-test-decision.md', wikiRecordWithFrontmatter('0004', 'alpha', 'Test decision'));
    appendToIndex(root, 'wiki/decisions/alpha/index.md', '* [Test decision](0004-test-decision.md) - a test decision\n');

    const result = await gradeRun({ variant: 'A-infer', root, before, meta });
    assert.equal(result.allDeterministicPass, true, JSON.stringify(result.reasons));
    assert.equal(result.themeIsExisting, true);
    assert.equal(result.newThemeCreated, false);
  } finally {
    cleanup(root);
  }
});

test('gradeRun: A-infer flags a new theme directory as newThemeCreated and FAILs D1', async () => {
  const { root, before, meta } = buildFixture('A-infer');
  try {
    write(root, 'wiki/decisions/gamma/0004-test-decision.md', wikiRecordWithFrontmatter('0004', 'gamma', 'Test decision'));
    write(root, 'wiki/decisions/gamma/index.md', '# Gamma Decisions\n\n## Records\n\n* [Test decision](0004-test-decision.md) - a test decision\n');
    appendToIndex(root, 'wiki/decisions/index.md', '* [Gamma](gamma/index.md) - a new theme\n');

    const result = await gradeRun({ variant: 'A-infer', root, before, meta });
    assert.equal(result.newThemeCreated, true);
    assert.equal(result.assertions.d1, false);
    assert.equal(result.allDeterministicPass, false);
  } finally {
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// Negative control: B
// ---------------------------------------------------------------------------

test('gradeRun: a correct default-location (B) ADR passes every assertion', async () => {
  const { root, before, meta } = buildFixture('B');
  try {
    write(root, 'docs/decisions/0001-test-decision.md', `# 0001. Test decision\n\nStatus: accepted\n`);
    write(root, 'docs/decisions/README.md', `# Decision Records\n\nSee [docs/TOC.md](../TOC.md) for the index.\n`);
    write(root, 'docs/TOC.md', readFileSync(join(root, 'docs/TOC.md'), 'utf8')
      + '\n- [`docs/decisions/0001-test-decision.md`](decisions/0001-test-decision.md) — test decision\n');

    const result = await gradeRun({ variant: 'B', root, before, meta });
    assert.equal(result.allDeterministicPass, true, JSON.stringify(result.reasons));
    assert.equal(result.assertions.d1, true);
    assert.equal(result.assertions.d2, true);
    assert.equal(result.assertions.d3, true);
    assert.equal(result.assertions.d4, true);
    assert.equal(result.assertions.d6, true);
    assert.equal(result.assertions.d7, true);
    assert.equal(result.newNumber, 1);
  } finally {
    cleanup(root);
  }
});

test('gradeRun: B FAILs when the default-location record carries frontmatter', async () => {
  const { root, before, meta } = buildFixture('B');
  try {
    write(root, 'docs/decisions/0001-test-decision.md', `---\ntype: decision-record\ntitle: 'Test decision'\n---\n\n# 0001. Test decision\n`);
    write(root, 'docs/decisions/README.md', `# Decision Records\n\nSee [docs/TOC.md](../TOC.md) for the index.\n`);
    write(root, 'docs/TOC.md', readFileSync(join(root, 'docs/TOC.md'), 'utf8')
      + '\n- [`docs/decisions/0001-test-decision.md`](decisions/0001-test-decision.md) — test decision\n');

    const result = await gradeRun({ variant: 'B', root, before, meta });
    assert.equal(result.allDeterministicPass, false);
    assert.equal(result.assertions.d3, false);
  } finally {
    cleanup(root);
  }
});

test('gradeRun: B FAILs when wiki/ (the decoy bundle) was touched', async () => {
  const { root, before, meta } = buildFixture('B');
  try {
    write(root, 'docs/decisions/0001-test-decision.md', `# 0001. Test decision\n`);
    write(root, 'docs/decisions/README.md', `# Decision Records\n\nSee [docs/TOC.md](../TOC.md) for the index.\n`);
    write(root, 'docs/TOC.md', readFileSync(join(root, 'docs/TOC.md'), 'utf8')
      + '\n- [`docs/decisions/0001-test-decision.md`](decisions/0001-test-decision.md) — test decision\n');
    // Touch the decoy bundle — this must never happen in a real run.
    appendToIndex(root, 'wiki/decisions/0007-decoy.md', '\nedited\n');

    const result = await gradeRun({ variant: 'B', root, before, meta });
    assert.equal(result.allDeterministicPass, false);
    assert.equal(result.assertions.d2, false);
  } finally {
    cleanup(root);
  }
});
