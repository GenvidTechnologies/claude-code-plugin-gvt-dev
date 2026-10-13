import { test } from 'node:test';
import assert from 'node:assert/strict';

import { summarizeExpectations, formatScanSummary, renderSummary } from '../lib/summary.mjs';

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
