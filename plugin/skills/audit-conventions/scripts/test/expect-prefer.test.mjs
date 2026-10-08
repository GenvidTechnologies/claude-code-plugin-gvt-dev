// ADR-0070: a files entry's optional `prefer` location, probed before the
// declared path when no paths override is set.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { expectationCandidates, expandPrefer } from '../lib/expect-prefer.mjs';

const SCHEMA = { path: 'docs/wiki-schema.md', prefer: '<wikiDir>/schema.md' };

test('expectationCandidates: no override -> prefer (default wikiDir) then declared path', () => {
  assert.deepEqual(expectationCandidates(SCHEMA, {}), { overridden: false, candidates: ['wiki/schema.md', 'docs/wiki-schema.md'] });
});

test('expectationCandidates: a configured wikiDir replaces the <wikiDir> placeholder', () => {
  assert.deepEqual(expectationCandidates(SCHEMA, { wikiDir: 'kb' }).candidates, ['kb/schema.md', 'docs/wiki-schema.md']);
});

test('expectationCandidates: a paths override wins outright, with no fallthrough to prefer or the declared path', () => {
  assert.deepEqual(
    expectationCandidates(SCHEMA, { paths: { 'docs/wiki-schema.md': 'notes/rules.md' } }),
    { overridden: true, candidates: ['notes/rules.md'] },
  );
});

test('expectationCandidates: an entry without prefer is the declared path alone (byte-identical to before)', () => {
  assert.deepEqual(expectationCandidates({ path: 'docs/TOC.md' }, {}).candidates, ['docs/TOC.md']);
});

test('expectationCandidates: a reserved paths key is never an override', () => {
  assert.deepEqual(expectationCandidates({ path: 'plugin_root' }, { paths: { plugin_root: 'plugin' } }).candidates, ['plugin_root']);
});

test('expandPrefer: blank or non-string prefer is ignored, and an empty wikiDir falls back to the default', () => {
  assert.equal(expandPrefer('', 'wiki'), null);
  assert.equal(expandPrefer(undefined, 'wiki'), null);
  assert.equal(expandPrefer('<wikiDir>/schema.md', ''), 'wiki/schema.md');
});
