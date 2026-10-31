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

import { buildFixture, snapshotTree, snapshotTexts } from '../fixtures.mjs';
import { gradeRun, VOICE_TELL_CLASSES } from '../grade.mjs';

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
// C-voice: a brief's voice must not reach the ADR; required wording must
// ---------------------------------------------------------------------------

const VOICE_REQUIRED_STRING = 'Retry budget: three attempts, then fail closed.';

// An alpha ADR #4 whose Decision/Consequences text is supplied by the test,
// so each test controls exactly which voice text the record carries.
function voiceRecord({ decision, extra = '' }) {
  return wikiRecordWithFrontmatter('0004', 'alpha', 'Retry failed alpha webhook deliveries')
    .replace('Test decision.', decision)
    .replace('Test consequences.', `Subscribers recover from transient errors.${extra}`);
}

function placeVoiceRecord(root, content) {
  write(root, 'wiki/decisions/alpha/0004-retry-webhooks.md', content);
  appendToIndex(root, 'wiki/decisions/alpha/index.md', '* [Retry failed alpha webhook deliveries](0004-retry-webhooks.md) - retry with a bounded budget\n');
}

test('gradeRun: C-voice passes when no brief voice leaks and the required string is verbatim', async () => {
  const { root, before, meta } = buildFixture('C-voice');
  try {
    placeVoiceRecord(root, voiceRecord({ decision: `Retry each failed delivery with backoff. ${VOICE_REQUIRED_STRING}` }));

    const result = await gradeRun({ variant: 'C-voice', root, before, meta });
    assert.equal(result.allDeterministicPass, true, JSON.stringify(result.reasons));
    assert.equal(result.assertions.voice, true);
  } finally {
    cleanup(root);
  }
});

test('gradeRun: C-voice fails when a brief voice tell leaks into the ADR', async () => {
  // One run per tell, each with the required string present, so only the
  // leak rule can reject the record (D1-D7 hold throughout).
  const leaks = [
    ['Record the retry rationale:', 'lead-in'],
    ['(keep this short, writer)', 'parenthetical'],
    ['verified this run', 'verified this run'],
    ['once T3 lands', 'T3'],
  ];
  for (const [leak, label] of leaks) {
    const { root, before, meta } = buildFixture('C-voice');
    try {
      placeVoiceRecord(root, voiceRecord({
        decision: `Retry each failed delivery with backoff. ${VOICE_REQUIRED_STRING}`,
        extra: ` ${leak}`,
      }));

      const result = await gradeRun({ variant: 'C-voice', root, before, meta });
      assert.equal(result.assertions.d1, true, `${label}: ${JSON.stringify(result.reasons)}`);
      assert.equal(result.assertions.voice, false, label);
      assert.equal(result.allDeterministicPass, false, label);
      assert.ok(result.reasons.some((r) => r.startsWith('Voice:') && r.includes('leaked')), label);
    } finally {
      cleanup(root);
    }
  }
});

test('gradeRun: C-voice fails when the required string is missing (brief voice)', async () => {
  const { root, before, meta } = buildFixture('C-voice');
  try {
    // Clean of every tell, but the required wording was paraphrased.
    placeVoiceRecord(root, voiceRecord({ decision: 'Retry each failed delivery up to three times, then stop.' }));

    const result = await gradeRun({ variant: 'C-voice', root, before, meta });
    assert.equal(result.assertions.d1, true, JSON.stringify(result.reasons));
    assert.equal(result.assertions.voice, false);
    assert.equal(result.allDeterministicPass, false);
    assert.ok(result.reasons.some((r) => r.startsWith('Voice:') && r.includes('required string missing')));
  } finally {
    cleanup(root);
  }
});

test('gradeRun: variant C applies no voice check (brief voice)', async () => {
  const { root, before, meta } = buildFixture('C');
  try {
    write(root, 'wiki/decisions/alpha/0004-test-decision.md', wikiRecordWithFrontmatter('0004', 'alpha', 'Test decision'));
    appendToIndex(root, 'wiki/decisions/alpha/index.md', '* [Test decision](0004-test-decision.md) - a test decision\n');

    const result = await gradeRun({ variant: 'C', root, before, meta });
    assert.equal(result.allDeterministicPass, true, JSON.stringify(result.reasons));
    assert.equal('voice' in result.assertions, false);
  } finally {
    cleanup(root);
  }
});

// Paraphrases and variants of the planted tells: none of these equals a
// planted string, so only the tell-CLASS patterns can reject them.
test('gradeRun: C-voice fails on paraphrased tells in the ADR (brief voice classes)', async () => {
  const leaks = [
    ['\n\nRecord the decision: keep it short.', 'lead-in at line start', 'lead-in "Record the"'],
    ['\n\n## Record the outcome', 'lead-in as a heading', 'lead-in "Record the"'],
    ['\n\n- **Record the** reason', 'lead-in after bullet and bold', 'lead-in "Record the"'],
    [' This was verified in this run.', 'verified in this run', '"verified this run"'],
    [' VERIFIED THIS RUN.', 'verified this run, upper case', '"verified this run"'],
    [' (writer: be brief)', 'parenthetical with other wording', 'writer-addressed parenthetical'],
    [' Ship it after T30 is done.', 'T30 as its own token', 'plan task id'],
    [' Rollout happens once T12 lands.', 'once T<n> lands', 'plan task id'],
  ];
  for (const [leak, title, label] of leaks) {
    const { root, before, meta } = buildFixture('C-voice');
    try {
      placeVoiceRecord(root, voiceRecord({
        decision: `Retry each failed delivery with backoff. ${VOICE_REQUIRED_STRING}`,
        extra: leak,
      }));

      const result = await gradeRun({ variant: 'C-voice', root, before, meta });
      assert.equal(result.assertions.d1, true, `${title}: ${JSON.stringify(result.reasons)}`);
      assert.equal(result.assertions.voice, false, title);
      assert.ok(result.reasons.some((r) => r.startsWith('Voice:') && r.includes(label)), `${title}: ${JSON.stringify(result.reasons)}`);
    } finally {
      cleanup(root);
    }
  }
});

test('gradeRun: C-voice task-id class is whole-token only and does not fire on ST3, T3x or "Record the" mid-line (brief voice)', async () => {
  const { root, before, meta } = buildFixture('C-voice');
  try {
    placeVoiceRecord(root, voiceRecord({
      decision: `Retry each failed delivery with backoff. ${VOICE_REQUIRED_STRING}`,
      extra: ' The ST3 queue and the T3x header are unrelated. We will record the budget in config. A (writing) aid.',
    }));

    const result = await gradeRun({ variant: 'C-voice', root, before, meta });
    assert.equal(result.assertions.voice, true, JSON.stringify(result.reasons));
    assert.equal(result.allDeterministicPass, true, JSON.stringify(result.reasons));
  } finally {
    cleanup(root);
  }
});

// Clean prose that an over-wide class would reject: each case sits where only
// the narrowed rule (not another class) decides the outcome.
test('gradeRun: C-voice passes clean prose near the writer and "Record the" classes (brief voice negative controls)', async () => {
  const clean = [
    ['hyphenated tech-writer in a parenthetical list', ' Dispatch (ts-implementer, tech-writer, or a domain implementer) per task.'],
    ['lone (tech-writer)', ' Handled by the (tech-writer) agent.'],
    ['hard-wrapped continuation line', ' The retry budget is fixed at three.\nRecord the outcome in the index.'],
  ];
  for (const [title, extra] of clean) {
    const { root, before, meta } = buildFixture('C-voice');
    try {
      placeVoiceRecord(root, voiceRecord({
        decision: `Retry each failed delivery with backoff. ${VOICE_REQUIRED_STRING}`,
        extra,
      }));
      appendToIndex(root, 'wiki/decisions/alpha/index.md', `* [Retry failed alpha webhook deliveries](0004-retry-webhooks.md) - ${title.includes('wrapped') ? 'bounded' : '(tech-writer) bounded'}\n`);

      const result = await gradeRun({ variant: 'C-voice', root, before, meta });
      assert.equal(result.assertions.voice, true, `${title}: ${JSON.stringify(result.reasons)}`);
      assert.equal(result.allDeterministicPass, true, `${title}: ${JSON.stringify(result.reasons)}`);
    } finally {
      cleanup(root);
    }
  }
});

test('gradeRun: C-voice still fails the narrowed classes on true positives (brief voice)', async () => {
  const leaks = [
    [" (writer's note)", 'writer possessive parenthetical', 'writer-addressed parenthetical'],
    ['\n\nRecord the outcome: keep it short.', 'paragraph-start Record the', 'lead-in "Record the"'],
    ['\n\n## Record the alternatives', 'heading Record the', 'lead-in "Record the"'],
    ['\n- Record the reasons', 'bullet Record the', 'lead-in "Record the"'],
  ];
  for (const [leak, title, label] of leaks) {
    const { root, before, meta } = buildFixture('C-voice');
    try {
      placeVoiceRecord(root, voiceRecord({
        decision: `Retry each failed delivery with backoff. ${VOICE_REQUIRED_STRING}`,
        extra: leak,
      }));

      const result = await gradeRun({ variant: 'C-voice', root, before, meta });
      assert.equal(result.assertions.voice, false, title);
      assert.ok(result.reasons.some((r) => r.startsWith('Voice:') && r.includes(label)), `${title}: ${JSON.stringify(result.reasons)}`);
    } finally {
      cleanup(root);
    }
  }
});

test('gradeRun: C-voice tell classes keep the exact regex source (brief voice)', () => {
  assert.deepEqual(VOICE_TELL_CLASSES.map((c) => String(c.re)), [
    String.raw`/(?<![^])[ \t]*Record the\b|\n[ \t]*\r?\n[ \t]*Record the\b|^[ \t]*[#*-][ \t#*-]*Record the\b/im`,
    String.raw`/\bverified (?:in )?this run\b/i`,
    String.raw`/\([^()\r\n]*(?<![\w-])writer\b[^()\r\n]*\)/i`,
    String.raw`/\bT\d+\b|\bonce T\d+ lands\b/`,
  ]);
});

test('gradeRun: C-voice fails when a tell appears only in a row added to the index (brief voice)', async () => {
  const rows = [
    ['verified in this run', '* [Retry failed alpha webhook deliveries](0004-retry-webhooks.md) - verified in this run\n'],
    ['Record the lead-in', 'Record the decision: [Retry failed alpha webhook deliveries](0004-retry-webhooks.md)\n'],
    ['planted writer parenthetical', '* [Retry failed alpha webhook deliveries](0004-retry-webhooks.md) - bounded (keep this short, writer)\n'],
    ['task id', '* [Retry failed alpha webhook deliveries](0004-retry-webhooks.md) - after T30\n'],
  ];
  for (const [title, row] of rows) {
    const { root, before, meta } = buildFixture('C-voice');
    try {
      // The ADR itself is clean; only the index row carries the tell.
      write(root, 'wiki/decisions/alpha/0004-retry-webhooks.md', voiceRecord({
        decision: `Retry each failed delivery with backoff. ${VOICE_REQUIRED_STRING}`,
      }));
      appendToIndex(root, 'wiki/decisions/alpha/index.md', row);

      const result = await gradeRun({ variant: 'C-voice', root, before, meta });
      assert.equal(result.assertions.d1, true, `${title}: ${JSON.stringify(result.reasons)}`);
      assert.equal(result.assertions.d4, true, `${title}: ${JSON.stringify(result.reasons)}`);
      assert.equal(result.assertions.voice, false, title);
      assert.ok(result.reasons.some((r) => r.includes('lines added to wiki/decisions/alpha/index.md')), `${title}: ${JSON.stringify(result.reasons)}`);
    } finally {
      cleanup(root);
    }
  }
});

test('gradeRun: C-voice ignores a tell already present in the index before the run, and passes with a clean added row (brief voice)', async () => {
  const { root, before: _seedBefore, meta } = buildFixture('C-voice');
  try {
    // Pre-existing index content carries a tell. Re-take the snapshots so it
    // counts as "before" the run, exactly as buildFixture does for the seed.
    appendToIndex(root, 'wiki/decisions/alpha/index.md', 'Record the older decisions below, verified in this run (writer note), T7.\n');
    const before = snapshotTree(root);
    meta.voice.indexBefore = snapshotTexts(root, meta.decisionsDir);

    placeVoiceRecord(root, voiceRecord({
      decision: `Retry each failed delivery with backoff. ${VOICE_REQUIRED_STRING}`,
    }));

    const result = await gradeRun({ variant: 'C-voice', root, before, meta });
    assert.equal(result.assertions.voice, true, JSON.stringify(result.reasons));
    assert.equal(result.allDeterministicPass, true, JSON.stringify(result.reasons));
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
