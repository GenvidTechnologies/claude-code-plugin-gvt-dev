import { test } from 'node:test';
import assert from 'node:assert/strict';

import { summarizeExpectations, formatScanSummary, renderSummary, hygieneScanSummary } from '../lib/summary.mjs';

test('renderSummary: unmet lines count expectations, not severity buckets', () => {
  // Severity buckets here: 4 errors, 1 warning, 9 infos. Expectation counts:
  // required 3 of 5 (2 unmet), optional 1 of 4 (3 unmet).
  const findings = [
    { required: true, ok: true, severity: 'info' },
    { required: true, ok: true, severity: 'info' },
    { required: true, ok: true, severity: 'info' },
    { required: true, ok: false, severity: 'error' },
    { required: true, ok: false, severity: 'error' },
    { required: false, ok: true, severity: 'info' },
    { required: false, ok: false, severity: 'info' },
    { required: false, ok: false, severity: 'info' },
    { required: false, ok: false, severity: 'info' },
    { kind: 'pointer-anchor', ok: false, severity: 'error' },
    { kind: 'component-malformed', ok: false, severity: 'error' },
    { kind: 'link-check-skipped', severity: 'info' },
    { kind: 'orphan-check-skipped', severity: 'info' },
    { kind: 'something', severity: 'warning' },
  ];
  assert.deepEqual(
    renderSummary({
      findings,
      scanSummary: { root: 'docs/', unrepresentable: false, fileCount: 7 },
    }),
    [
      '### Summary',
      '- required: 3 of 5 satisfied.',
      '- optional: 1 of 4 satisfied.',
      '- scanned 7 file(s) under docs/',
      '- 2 required expectations unmet.',
      '- 1 plugin component could not be loaded.',
      '- 1 other error finding.',
      '- 1 warning (non-fatal).',
      '- 3 optional expectations unmet.',
      '- 2 advisory findings.',
    ],
  );
});

test('renderSummary: only satisfied expectations render the heading and the two ratio lines', () => {
  const findings = [
    { required: true, ok: true, severity: 'info' },
    { required: false, ok: true, severity: 'info' },
  ];
  assert.deepEqual(renderSummary({ findings }), [
    '### Summary',
    '- required: 1 of 1 satisfied.',
    '- optional: 1 of 1 satisfied.',
  ]);
  assert.deepEqual(
    renderSummary({ findings, scanSummary: { root: 'docs/', unrepresentable: false, fileCount: 3 } }),
    [
      '### Summary',
      '- required: 1 of 1 satisfied.',
      '- optional: 1 of 1 satisfied.',
      '- scanned 3 file(s) under docs/',
    ],
  );
});

test('renderSummary: non-expectation lines never use the word expectation', () => {
  const lines = renderSummary({
    findings: [
      { kind: 'pointer-anchor', ok: false, severity: 'error' },
      { kind: 'component-unreadable', ok: false, severity: 'error' },
      { kind: 'retired-token', severity: 'info' },
    ],
  });
  assert.deepEqual(lines, [
    '### Summary',
    '- required: 0 of 0 satisfied.',
    '- optional: 0 of 0 satisfied.',
    '- 1 plugin component could not be loaded.',
    '- 1 other error finding.',
    '- 1 advisory finding.',
  ]);
  assert.equal(lines.some((l) => /expectation/.test(l)), false);
});

test('summarizeExpectations: empty input yields all zeros', () => {
  assert.deepEqual(summarizeExpectations([]), {
    requiredMet: 0,
    requiredTotal: 0,
    optionalMet: 0,
    optionalTotal: 0,
  });
});

test('summarizeExpectations: a satisfied optional finding does NOT count toward required', () => {
  // This is the core regression the bug is about: an `ok: true, required: false`
  // finding must land in the optional bucket only, never inflate requiredMet/Total.
  const findings = [{ required: false, ok: true }];
  assert.deepEqual(summarizeExpectations(findings), {
    requiredMet: 0,
    requiredTotal: 0,
    optionalMet: 1,
    optionalTotal: 1,
  });
});

test('summarizeExpectations: an unmet required finding increments requiredTotal but not requiredMet', () => {
  const findings = [{ required: true, ok: false }];
  assert.deepEqual(summarizeExpectations(findings), {
    requiredMet: 0,
    requiredTotal: 1,
    optionalMet: 0,
    optionalTotal: 0,
  });
});

test('summarizeExpectations: a satisfied required finding increments both requiredMet and requiredTotal', () => {
  const findings = [{ required: true, ok: true }];
  assert.deepEqual(summarizeExpectations(findings), {
    requiredMet: 1,
    requiredTotal: 1,
    optionalMet: 0,
    optionalTotal: 0,
  });
});

test('summarizeExpectations: an unmet optional finding increments optionalTotal but not optionalMet', () => {
  const findings = [{ required: false, ok: false }];
  assert.deepEqual(summarizeExpectations(findings), {
    requiredMet: 0,
    requiredTotal: 0,
    optionalMet: 0,
    optionalTotal: 1,
  });
});

test('summarizeExpectations: a mixed fixture produces the correct four totals', () => {
  const findings = [
    { required: true, ok: true },
    { required: true, ok: true },
    { required: true, ok: false },
    { required: false, ok: true },
    { required: false, ok: false },
    { required: false, ok: false },
  ];
  assert.deepEqual(summarizeExpectations(findings), {
    requiredMet: 2,
    requiredTotal: 3,
    optionalMet: 1,
    optionalTotal: 3,
  });
});

test('summarizeExpectations: findings with a non-boolean required are ignored by both buckets', () => {
  const findings = [
    { required: undefined, ok: true },
    { ok: true },
    { required: 'true', ok: true },
    { required: true, ok: true },
  ];
  assert.deepEqual(summarizeExpectations(findings), {
    requiredMet: 1,
    requiredTotal: 1,
    optionalMet: 0,
    optionalTotal: 0,
  });
});

test('formatScanSummary: plain root case names the root(s) and file count', () => {
  const line = formatScanSummary({ root: 'docs/', unrepresentable: false, fileCount: 27 });
  assert.match(line, /\bscanned\b/);
  assert.match(line, /27/);
  assert.match(line, /docs\//);
});

test('formatScanSummary: multiple roots are all named in the line', () => {
  const line = formatScanSummary({
    root: ['docs/', 'CLAUDE.md'],
    unrepresentable: false,
    fileCount: 27,
  });
  assert.match(line, /\bscanned\b/);
  assert.match(line, /27/);
  assert.match(line, /docs\//);
  assert.match(line, /CLAUDE\.md/);
});

test('formatScanSummary: unrepresentable root states the fallback explicitly', () => {
  const line = formatScanSummary({ root: 'docs/', unrepresentable: true, fileCount: 27 });
  assert.match(line, /\bscanned\b/);
  assert.match(line, /27/);
  // The whole point of the flag: a silent fallback must not read identically
  // to a normal, honored scan.
  assert.match(line, /fell back|fallback|could not/i);
});

test('formatScanSummary: fileCount 0 is surfaced, not hidden', () => {
  const line = formatScanSummary({ root: 'docs/', unrepresentable: false, fileCount: 0 });
  assert.match(line, /\bscanned\b/);
  assert.match(line, /\b0\b/);
});

// ---- one scanned line per hygiene scanner (#401) ---------------------------

const FINDING_NEEDLES = ['orphan', 'broken link', 'contains retired token'];

function corporaFor({ docsRoot = 'docs', wikiDir = 'wiki', claude = true, equal = false, noIndex = false, tokenFiles = [] } = {}) {
  const docs = equal ? 'wiki' : docsRoot;
  const link = claude ? ['CLAUDE.md'] : [];
  return {
    retiredToken: {
      files: [...(claude ? [{ path: 'CLAUDE.md', via: 'docs' }] : []), ...tokenFiles],
      roots: [{ via: 'docs', root: docs }, { via: 'wiki', root: wikiDir }],
    },
    linkCheck: {
      files: equal ? link : [`${docs}/a.md`, ...link],
      declined: equal ? ['wiki/a.md', 'wiki/b.md'] : [],
      bundleRoot: wikiDir,
      roots: [`${docs}/`, 'CLAUDE.md'],
    },
    indexCheck: {
      skipped: equal ? 'bundle' : noIndex ? 'no-index' : null,
      index: `${docs}/TOC.md`,
      files: [],
      roots: [`${docs}/`],
    },
  };
}

test('renderSummary: one scanned line per hygiene scanner (#401)', () => {
  const scanSummary = hygieneScanSummary(
    corporaFor({ tokenFiles: [{ path: '.gvt-agent.json', via: 'config' }] }),
    { unrepresentable: true },
  );
  assert.equal(scanSummary.length, 3);
  const lines = renderSummary({ findings: [], scanSummary });
  const scanned = lines.filter((l) => l.startsWith('- scanned '));
  assert.equal(scanned.length, 3);
  assert.match(scanned[0], /^- scanned 2 file\(s\) for retired tokens under docs\/, wiki\/, CLAUDE\.md, \.gvt-agent\.json/);
  assert.match(scanned[1], /^- scanned 2 file\(s\) for links under docs\/, CLAUDE\.md$/);
  assert.match(scanned[2], /^- scanned 0 file\(s\) for index coverage under docs\/ \(index docs\/TOC\.md\)$/);
  // The fallback note states the unrepresentable root once, on the first line.
  assert.equal(lines.filter((l) => /fell back/.test(l)).length, 1);
  assert.match(scanned[0], /fell back/);
  // A single-object scanSummary still renders exactly one line.
  assert.deepEqual(
    renderSummary({ findings: [], scanSummary: { root: 'docs/', unrepresentable: false, fileCount: 7 } }).slice(-1),
    ['- scanned 7 file(s) under docs/'],
  );
  // Equal layout: nested roots collapse, declines are stated.
  const equal = renderSummary({ findings: [], scanSummary: hygieneScanSummary(corporaFor({ equal: true }), {}) })
    .filter((l) => l.startsWith('- scanned '));
  assert.deepEqual(equal, [
    '- scanned 1 file(s) for retired tokens under wiki/, CLAUDE.md',
    '- scanned 1 file(s) for links under CLAUDE.md (2 under wiki/ declined, see Info)',
    '- scanned 0 file(s) for index coverage (docs root wiki/ is inside the wiki bundle wiki/; declined, see Info)',
  ]);
});

test('renderSummary: scanned lines never contain a finding needle a downstream digest counts (#401)', () => {
  const scenarios = [
    corporaFor({}),
    corporaFor({ equal: true }),
    corporaFor({ noIndex: true }),
    corporaFor({ claude: false }),
    corporaFor({ tokenFiles: [{ path: 'package.json', via: 'config' }] }),
  ];
  for (const unrepresentable of [false, true]) {
    for (const corpora of scenarios) {
      const lines = renderSummary({
        findings: [],
        scanSummary: hygieneScanSummary(corpora, { unrepresentable }),
      }).filter((l) => l.startsWith('- scanned '));
      assert.equal(lines.length, 3);
      for (const line of lines) {
        for (const needle of FINDING_NEEDLES) {
          assert.ok(!line.toLowerCase().includes(needle), `"${needle}" in: ${line}`);
        }
      }
    }
  }
});
