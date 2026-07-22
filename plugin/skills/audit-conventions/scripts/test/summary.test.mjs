import { test } from 'node:test';
import assert from 'node:assert/strict';

import { summarizeExpectations } from '../lib/summary.mjs';

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
