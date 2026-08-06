import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PILLARS } from '../lib/pillars.mjs';
import { formatPracticeCoverage } from '../lib/pillar-report.mjs';

// A realistic census matching the real curated declarations pinned by
// pillars.test.mjs's "real tree" assertion (ADR-0027).
const REALISTIC_CENSUS = [
  { name: 'plan-task', pillar: 'spec' },
  { name: 'analyst', pillar: 'spec' },
  { name: 'designer', pillar: 'spec' },
  { name: 'planner', pillar: 'spec' },
  { name: 'audit-conventions', pillar: 'verify' },
  { name: 'validate-changes', pillar: 'verify' },
  { name: 'validator', pillar: 'verify' },
  { name: 'code-reviewer', pillar: 'verify' },
  { name: 'maintain-wiki', pillar: 'environment' },
  { name: 'wiki-librarian', pillar: 'environment' },
  { name: 'build-probe', pillar: 'moldable' },
];

// T13 — the two deliberately-not-detectable pillars render their PILLARS
// naReason, and the assertions actually depend on that data (not a
// hardcoded string in the renderer).
test('formatPracticeCoverage: Verify renders "not detectable" citing #160', () => {
  const output = formatPracticeCoverage(REALISTIC_CENSUS, { environment: 'adopted' });
  assert.match(output, /Verify \|.*\| not detectable.*#160/);
});

test('formatPracticeCoverage: Moldable renders "n/a by design" citing ADR-0018', () => {
  const output = formatPracticeCoverage(REALISTIC_CENSUS, { environment: 'adopted' });
  assert.match(output, /Moldable \|.*\| n\/a by design.*ADR-0018/);
});

// Positive control (required by repo convention, issue #218): flip the two
// n/a pillars' detectability/naReason on the *live* PILLARS objects (the
// renderer imports the same singleton, so this mutation is visible to it)
// and confirm both rows change. This proves the assertions above are
// sensitive to PILLARS' data, not matching a string the renderer invented.
test('formatPracticeCoverage: n/a rows are sensitive to PILLARS data (positive control)', () => {
  const verifyPillar = PILLARS.find((p) => p.id === 'verify');
  const moldablePillar = PILLARS.find((p) => p.id === 'moldable');
  const savedVerify = { ...verifyPillar };
  const savedMoldable = { ...moldablePillar };

  const before = formatPracticeCoverage(REALISTIC_CENSUS, { environment: 'adopted', verify: 'adopted' });
  assert.match(before, /Verify \|.*\| not detectable.*#160/);
  assert.match(before, /Moldable \|.*\| n\/a by design.*ADR-0018/);

  try {
    // Once naReason is gone, these become normal adoption-verdict pillars —
    // dropping into the same branch Spec/Environment use.
    verifyPillar.detectability = 'fully detectable';
    delete verifyPillar.naReason;
    moldablePillar.detectability = 'fully detectable';
    delete moldablePillar.naReason;

    const after = formatPracticeCoverage(REALISTIC_CENSUS, { environment: 'adopted', verify: 'adopted' });

    // The naReason-citing text is gone (Verify picks up its adoption verdict
    // instead; Moldable had none passed, so it reads 'not evaluated').
    assert.doesNotMatch(after, /Verify \|.*\| not detectable.*#160/);
    assert.doesNotMatch(after, /Moldable \|.*\| n\/a by design.*ADR-0018/);
    assert.match(after, /Verify \|.*\| adopted/);
    assert.match(after, /Moldable \|.*\| not evaluated/);
    assert.notEqual(after, before);
  } finally {
    Object.assign(verifyPillar, savedVerify);
    Object.assign(moldablePillar, savedMoldable);
  }
});

// Adoption rendering: adopted / not adopted / partial each render
// distinguishably, and the two `Environment` regexes the integration task
// depends on both work off the same renderer.
test('formatPracticeCoverage: Environment renders "adopted" for an adopted verdict', () => {
  const output = formatPracticeCoverage(REALISTIC_CENSUS, { environment: 'adopted' });
  assert.match(output, /Environment \|.*\| adopted/);
});

test('formatPracticeCoverage: Environment renders "not adopted" for an absent verdict', () => {
  const output = formatPracticeCoverage(REALISTIC_CENSUS, { environment: 'absent' });
  assert.match(output, /Environment \|.*\| not adopted/);
  // Guard against the adopted-regex false-positiving on "not adopted".
  assert.doesNotMatch(output, /Environment \|.*\| adopted/);
});

test('formatPracticeCoverage: Environment renders a distinguishable partial verdict', () => {
  const adopted = formatPracticeCoverage(REALISTIC_CENSUS, { environment: 'adopted' });
  const absent = formatPracticeCoverage(REALISTIC_CENSUS, { environment: 'absent' });
  const partial = formatPracticeCoverage(REALISTIC_CENSUS, { environment: 'partial' });

  assert.match(partial, /Environment \|.*\| partial adoption/);
  assert.notEqual(partial, adopted);
  assert.notEqual(partial, absent);
});

test('formatPracticeCoverage: a pillar with no adoption data renders "not evaluated"', () => {
  const output = formatPracticeCoverage(REALISTIC_CENSUS, {});
  assert.match(output, /Spec \|.*\| not evaluated/);
});

// Pillar gap line: emitted only when a pillar has zero declaring
// components, absent when all four are covered.
test('formatPracticeCoverage: "> Pillar gap:" appears when a pillar has zero declarers', () => {
  const censusMissingModable = REALISTIC_CENSUS.filter((c) => c.pillar !== 'moldable');
  const output = formatPracticeCoverage(censusMissingModable, { environment: 'adopted' });
  assert.match(output, /> Pillar gap: Moldable/);
});

test('formatPracticeCoverage: "> Pillar gap:" is absent when all four pillars have declarers (positive control)', () => {
  const output = formatPracticeCoverage(REALISTIC_CENSUS, { environment: 'adopted' });
  assert.doesNotMatch(output, /> Pillar gap:/);
});

// The components census cell itself renders the plugin-side declarers.
test('formatPracticeCoverage: Environment components cell lists the declaring components', () => {
  const output = formatPracticeCoverage(REALISTIC_CENSUS, { environment: 'adopted' });
  assert.match(output, /Environment \| maintain-wiki, wiki-librarian \|/);
});

test('formatPracticeCoverage: an empty census renders "(none)" for every pillar (positive control)', () => {
  const output = formatPracticeCoverage([], {});
  assert.match(output, /Spec \| \(none\) \|/);
  assert.match(output, /Verify \| \(none\) \|/);
  assert.match(output, /Environment \| \(none\) \|/);
  assert.match(output, /Moldable \| \(none\) \|/);
  assert.match(output, /> Pillar gap: Spec, Verify, Environment, Moldable/);
});
