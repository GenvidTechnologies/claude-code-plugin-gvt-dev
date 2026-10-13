import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  expectedKind,
  probeRelPath,
  resolveCandidate,
  formatCandidateTarget,
} from '../lib/candidate-resolution.mjs';

const ROOT = join('repo', 'root');
const BS = String.fromCharCode(92);

// A stub probe answering from a map of probed path -> result, recording calls.
function stub(byRel) {
  const calls = [];
  const probe = async (path) => {
    calls.push(path);
    for (const [rel, result] of Object.entries(byRel)) if (path === join(ROOT, rel)) return result;
    return { kind: 'absent' };
  };
  return { probe, calls };
}

// ---- an error stops the chain ----------------------------------------

for (const [label, error] of [
  ['EACCES', { code: 'EACCES', message: 'denied' }],
  ['ELOOP', { code: 'ELOOP', message: 'loop' }],
  ['dangling link (ENOENT)', { code: 'ENOENT', message: 'dangling' }],
]) {
  test(`${label} on candidate 1 of 2 stops the chain, unsatisfied, probe called once`, async () => {
    const { probe, calls } = stub({ 'a.md': { kind: 'error', error }, 'b.md': { kind: 'file' } });
    const r = await resolveCandidate(ROOT, 'a.md', ['a.md', 'b.md'], { probe });
    assert.equal(r.candidate, 'a.md');
    assert.equal(r.satisfied, false);
    assert.equal(r.found.kind, 'error');
    assert.equal(calls.length, 1);
  });
}

test('an error on the last candidate, after an absent first one, is returned unsatisfied', async () => {
  const error = { code: 'EACCES', message: 'denied' };
  const { probe, calls } = stub({ 'b.md': { kind: 'error', error } });
  const r = await resolveCandidate(ROOT, 'a.md', ['a.md', 'b.md'], { probe });
  assert.equal(r.candidate, 'b.md');
  assert.equal(r.satisfied, false);
  assert.equal(r.found.kind, 'error');
  assert.equal(calls.length, 2);
});

test('a wrong kind is passed over, then an error on candidate 2 of 3 stops before candidate 3', async () => {
  const error = { code: 'EACCES', message: 'denied' };
  const { probe, calls } = stub({ c1: { kind: 'directory' }, c2: { kind: 'error', error }, c3: { kind: 'file' } });
  const r = await resolveCandidate(ROOT, 'x.md', ['c1', 'c2', 'c3'], { probe });
  assert.equal(r.candidate, 'c2');
  assert.equal(r.satisfied, false);
  assert.equal(r.found.kind, 'error');
  assert.equal(calls.length, 2);
  assert.deepEqual(r.skipped, [{ candidate: 'c1', kind: 'directory' }]);
});

// ---- wrong kinds are passed over --------------------------------------

test('a directory on candidate 1 is passed over; a file on candidate 2 satisfies', async () => {
  const { probe } = stub({ 'c1': { kind: 'directory' }, 'c2': { kind: 'file' } });
  const r = await resolveCandidate(ROOT, 'x.md', ['c1', 'c2'], { probe });
  assert.equal(r.candidate, 'c2');
  assert.equal(r.satisfied, true);
  assert.deepEqual(r.skipped, [{ candidate: 'c1', kind: 'directory' }]);
});

test('`other` on candidate 1 falls through to candidate 2', async () => {
  const { probe } = stub({ 'c1': { kind: 'other' }, 'c2': { kind: 'file' } });
  const r = await resolveCandidate(ROOT, 'x.md', ['c1', 'c2'], { probe });
  assert.equal(r.candidate, 'c2');
  assert.equal(r.satisfied, true);
  assert.deepEqual(r.skipped, [{ candidate: 'c1', kind: 'other' }]);
});

// ---- trailing separators are stripped before probing ------------------

test('the backslash fixture really is a backslash', () => {
  assert.equal(BS.length, 1);
  assert.equal(BS.charCodeAt(0), 92);
  assert.equal(readFileSync(fileURLToPath(import.meta.url), 'utf8').includes('String.fromCharCode(92)'), true);
});

for (const [label, candidate] of [
  ['x/', 'x/'],
  ['x//', 'x//'],
  ['x + backslash', 'x' + BS],
]) {
  test(`candidate ${label} is probed without a trailing separator`, async () => {
    const { probe, calls } = stub({});
    await resolveCandidate(ROOT, 'd/', [candidate], { probe });
    assert.equal(calls.length, 1);
    assert.match(calls[0], /^(?![^]*[\\/]$)/);
    assert.equal(calls[0], join(ROOT, 'x'));
  });
}

// ---- kind comes from the declared path --------------------------------

test('declared `d/` with candidate `c` expects a directory', async () => {
  const { probe } = stub({ c: { kind: 'directory' } });
  const r = await resolveCandidate(ROOT, 'd/', ['c'], { probe });
  assert.equal(r.probe, 'directory');
  assert.equal(r.satisfied, true);
});

test('declared `f.md` with candidate `g.md/` expects a file', async () => {
  const { probe } = stub({ 'g.md': { kind: 'file' } });
  const r = await resolveCandidate(ROOT, 'f.md', ['g.md/'], { probe });
  assert.equal(r.probe, 'file');
  assert.equal(r.satisfied, true);
});

test('expectedKind and probeRelPath', () => {
  assert.equal(expectedKind('d/'), 'directory');
  assert.equal(expectedKind('d' + BS), 'directory');
  assert.equal(expectedKind('f.md'), 'file');
  assert.equal(probeRelPath('a//'), 'a');
  assert.equal(probeRelPath('a/b'), 'a/b');
});

// ---- Boundaries ------------------------------------------------------------

for (const candidate of ['/', '//']) {
  test(`root-only candidate ${candidate} probes the repo root`, async () => {
    const { probe, calls } = stub({});
    await resolveCandidate(ROOT, 'd/', [candidate], { probe });
    assert.deepEqual(calls, [join(ROOT, '')]);
  });
}

test('a single candidate is returned whatever its kind', async () => {
  const { probe } = stub({ 'only.md': { kind: 'directory' } });
  const r = await resolveCandidate(ROOT, 'x.md', ['only.md'], { probe });
  assert.equal(r.candidate, 'only.md');
  assert.equal(r.satisfied, false);
  assert.deepEqual(r.skipped, []);
});

test('all candidates absent: the last, unsatisfied, nothing skipped', async () => {
  const { probe, calls } = stub({});
  const r = await resolveCandidate(ROOT, 'x.md', ['a.md', 'b.md'], { probe });
  assert.equal(r.candidate, 'b.md');
  assert.equal(r.satisfied, false);
  assert.equal(r.found.kind, 'absent');
  assert.deepEqual(r.skipped, []);
  assert.equal(calls.length, 2);
});

test('the first satisfying candidate wins and later ones are not probed', async () => {
  const { probe, calls } = stub({ 'a.md': { kind: 'file' }, 'b.md': { kind: 'file' } });
  const r = await resolveCandidate(ROOT, 'x.md', ['a.md', 'b.md'], { probe });
  assert.equal(r.candidate, 'a.md');
  assert.equal(calls.length, 1);
});

// ---- 3a: rendering ---------------------------------------------------------

const base = { candidates: ['wiki/schema.md', 'docs/wiki-schema.md'], skipped: [] };

test('rendering: every candidate absent keeps the unchanged form', () => {
  const f = { ...base, detail: 'file not found (optional)', described: 'docs/wiki-schema.md', describedKind: 'absent' };
  assert.equal(formatCandidateTarget(f), '`wiki/schema.md` or `docs/wiki-schema.md` — file not found (optional)');
});

test('rendering: stopped at an error on candidate 1 names that candidate', () => {
  const f = { ...base, detail: 'file unreadable (EACCES)', described: 'wiki/schema.md', describedKind: 'error' };
  assert.equal(formatCandidateTarget(f), '`wiki/schema.md` or `docs/wiki-schema.md` — `wiki/schema.md`: file unreadable (EACCES)');
});

test('rendering: a wrong kind passed over then absent last adds the passed-over note', () => {
  const f = {
    ...base,
    detail: 'file not found',
    described: 'docs/wiki-schema.md',
    describedKind: 'absent',
    skipped: [{ candidate: 'wiki/schema.md', kind: 'directory' }],
  };
  assert.equal(
    formatCandidateTarget(f),
    '`wiki/schema.md` or `docs/wiki-schema.md` — `docs/wiki-schema.md`: file not found; `wiki/schema.md` was passed over (found a directory)',
  );
});

test('rendering: an error on a later candidate after a passed-over one names the candidate and appends the note', () => {
  const f = {
    ...base,
    detail: 'file unreadable (EACCES)',
    described: 'docs/wiki-schema.md',
    describedKind: 'error',
    skipped: [{ candidate: 'wiki/schema.md', kind: 'directory' }],
  };
  assert.equal(
    formatCandidateTarget(f),
    '`wiki/schema.md` or `docs/wiki-schema.md` — `docs/wiki-schema.md`: file unreadable (EACCES); `wiki/schema.md` was passed over (found a directory)',
  );
});

test('rendering: skipped file and other nouns', () => {
  const f = {
    ...base,
    detail: 'directory not found',
    described: 'docs/wiki-schema.md',
    describedKind: 'absent',
    skipped: [
      { candidate: 'a', kind: 'file' },
      { candidate: 'b', kind: 'other' },
    ],
  };
  const out = formatCandidateTarget(f);
  assert.match(out, /; `a` was passed over \(found a file\)/);
  assert.match(out, /; `b` was passed over \(found neither a file nor a directory\)$/);
});

test('rendering: a described last candidate holding the wrong kind is not the all-absent form', () => {
  const f = { ...base, detail: 'expected a file, found a directory', described: 'docs/wiki-schema.md', describedKind: 'directory' };
  assert.equal(
    formatCandidateTarget(f),
    '`wiki/schema.md` or `docs/wiki-schema.md` — `docs/wiki-schema.md`: expected a file, found a directory',
  );
});

// ---- Import pin ------------------------------------------------------------

test('candidate-resolution.mjs imports only node:path and the audit-core probePath', () => {
  const src = readFileSync(fileURLToPath(new URL('../lib/candidate-resolution.mjs', import.meta.url)), 'utf8');
  const imports = src.split('\n').filter((l) => l.startsWith('import '));
  const specs = imports.map((l) => l.slice(l.lastIndexOf(' from ') + 7, -2));
  assert.deepEqual(specs, ['node:path', '#audit-core']);
  const core = imports.filter((l) => l.endsWith(" from '#audit-core';"));
  assert.equal(core.length, 1);
  const bindings = core[0].slice(core[0].indexOf('{') + 1, core[0].indexOf('}')).split(',').map((b) => b.trim()).sort();
  assert.deepEqual(bindings, ['probePath']);
});
