// Tests for the baseline generator — the ONE writer of the ratchet file.
//
// Every test here spawns the real script as a subprocess rather than importing
// it. That is deliberate: the whole contract under test is a CLI contract —
// which invocation writes, which refuses, what the exit code is — and an
// imported function could satisfy all of it while the entry point still wrote
// on a bare run.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BASELINE_FILE, scanPointerAnchors } from '../lib/pointer-anchors.mjs';

const SCRIPT = fileURLToPath(new URL('../pointer-baseline.mjs', import.meta.url));

// ---- fixture plumbing --------------------------------------------------------

async function withTempRepo(setup) {
  const dir = await mkdtemp(join(tmpdir(), 'pointer-baseline-test-'));
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

// Every fixture pointer is ASSEMBLED at runtime rather than spelled out — this
// file lives under plugin/ with a .mjs extension, so it is itself part of the
// citing corpus the scanner walks. A literal pointer written here would be a
// real citation in this repo, minting findings against paths that exist only
// inside a temp directory. Concatenating around the colon avoids that.
const COLON = ':';
const ptr = (path, spec) => path + COLON + spec;
const cite = (path, spec) => '`' + ptr(path, spec) + '`';

const linesOf = (...lines) => lines.join('\n') + '\n';
const numberedLines = (n) =>
  Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n') + '\n';

function run(dir, ...flags) {
  const result = spawnSync(process.execPath, [SCRIPT, dir, ...flags], { encoding: 'utf8' });
  if (result.error) throw result.error;
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    output: result.stdout + result.stderr,
  };
}

const baselinePath = (dir) => join(dir, BASELINE_FILE);

async function readBaseline(dir) {
  return JSON.parse(await readFile(baselinePath(dir), 'utf8'));
}

async function readRaw(dir) {
  try {
    return await readFile(baselinePath(dir), 'utf8');
  } catch {
    return null;
  }
}

async function mtimeOf(dir) {
  return (await stat(baselinePath(dir))).mtimeMs;
}

const identify = (entries) =>
  entries.map((e) => [e.file, e.pointer, e.occurrence, e.kind, e.digest === null]);

// ---- fixtures ----------------------------------------------------------------

// A pointer with no content anchor: acceptable debt, and the only kind of
// finding these fixtures ever ask the generator to add.
const ANCHORLESS = `See ${cite('designer.md', '83')} for the rule.\n`;

// A pointer whose anchor really sits on line 3 of its target. Citing line 1
// makes it a pointer-anchor-drift; citing line 3 makes it conform.
const ANCHOR_PHRASE = 'the nearest occurrence to the cited range';
const DRIFT_TARGET = linesOf('An opening paragraph.', 'A second sentence.', ANCHOR_PHRASE);
const driftingCitation = (line) => `Also ${cite('analyst.md', line)} ("${ANCHOR_PHRASE}").\n`;

// One anchorless citation plus one drifting citation, in separate paragraphs.
async function driftFixture() {
  return withTempRepo(async (d) => {
    await writeRepoFile(d, 'plugin/agents/designer.md', numberedLines(120));
    await writeRepoFile(d, 'plugin/agents/analyst.md', DRIFT_TARGET);
    await writeRepoFile(d, 'docs/notes.md', ANCHORLESS + '\n' + driftingCitation('1'));
  });
}

// The same repo with the drift repaired — the pointer now cites the line its
// anchor is really on, exactly as the drift finding instructs.
const repairDrift = (dir) =>
  writeRepoFile(dir, 'docs/notes.md', ANCHORLESS + '\n' + driftingCitation('3'));

// No drift, no broken anchor: one anchorless pointer, nothing provably wrong.
async function cleanFixture() {
  return withTempRepo(async (d) => {
    await writeRepoFile(d, 'plugin/agents/designer.md', numberedLines(120));
    await writeRepoFile(d, 'docs/notes.md', ANCHORLESS);
  });
}

const writeBaselineFile = (dir, entries) =>
  writeFile(baselinePath(dir), JSON.stringify({ version: 1, entries }, null, 2) + '\n');

// An entry that no scan of these fixtures can ever match, so it must be pruned.
const BOGUS_ENTRY = {
  file: 'docs/gone.md',
  pointer: ptr('vanished.md', '7'),
  occurrence: 0,
  kind: 'pointer-anchor-missing',
  digest: 'deadbeefcafe',
};

// ---- help text ---------------------------------------------------------------

test('--help names the gap the refusal does not cover', () => {
  const result = run('.', '--help');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /does NOT cover pointer-anchor-missing/);
  assert.match(result.stdout, /prune-only is the default/i);
});

// ---- R11: the refusal, as a two-direction transition -------------------------

// One command, run in two configurations that differ only in whether a
// pointer-anchor-drift finding exists. Asserting the refusal alone would not
// distinguish a real gate from a script that never writes.
test('R11: --accept-new --write refuses while a drift exists, and succeeds once it is repaired', async () => {
  const dir = await driftFixture();
  try {
    // A pre-existing baseline whose single entry matches nothing. Prune-only
    // would remove it on any successful run, so its SURVIVAL is what proves the
    // refusal wrote nothing at all — not merely that it added nothing.
    await writeBaselineFile(dir, [BOGUS_ENTRY]);
    const before = await readRaw(dir);
    const mtimeBefore = await mtimeOf(dir);

    // DIRECTION 1 — a drift exists.
    const refused = run(dir, '--accept-new', '--write');
    assert.notEqual(refused.status, 0);
    assert.match(refused.output, /REFUSED/);
    assert.match(refused.output, /pointer-anchor-drift/);
    assert.match(refused.output, /Nothing was written/);
    assert.equal(await readRaw(dir), before);
    assert.equal(await mtimeOf(dir), mtimeBefore);

    // MUTATION: the drift — and only the drift — is repaired.
    await repairDrift(dir);

    // DIRECTION 2 — the same command, same fixture, no drift.
    const accepted = run(dir, '--accept-new', '--write');
    assert.equal(accepted.status, 0);
    assert.doesNotMatch(accepted.output, /REFUSED/);

    const written = await readBaseline(dir);
    assert.deepEqual(identify(written.entries), [
      ['docs/notes.md', ptr('designer.md', '83'), 0, 'pointer-anchor-missing', false],
    ]);
    assert.notEqual(await readRaw(dir), before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('R11: the refusal fires the same way with no baseline file, leaving none behind', async () => {
  const dir = await driftFixture();
  try {
    const refused = run(dir, '--accept-new', '--write');
    assert.notEqual(refused.status, 0);
    assert.equal(await readRaw(dir), null);

    await repairDrift(dir);
    const accepted = run(dir, '--accept-new', '--write');
    assert.equal(accepted.status, 0);
    assert.equal((await readBaseline(dir)).entries.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('R11: --accept-new refuses without --write too — the gate is not the write flag', async () => {
  const dir = await driftFixture();
  try {
    const refused = run(dir, '--accept-new');
    assert.notEqual(refused.status, 0);
    assert.match(refused.output, /REFUSED/);
    assert.equal(await readRaw(dir), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---- the bare invocation writes nothing --------------------------------------

test('bare: --accept-new without --write reports the adds and creates no file', async () => {
  const dir = await cleanFixture();
  try {
    const result = run(dir, '--accept-new');
    assert.equal(result.status, 0);
    assert.match(result.stdout, /### Accept — 1 new entry/);
    assert.match(result.stdout, /Dry run — nothing written/);
    assert.equal(await readRaw(dir), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('bare: a pending prune leaves the existing file byte- and mtime-unchanged', async () => {
  const dir = await cleanFixture();
  try {
    await writeBaselineFile(dir, [BOGUS_ENTRY]);
    const before = await readRaw(dir);
    const mtimeBefore = await mtimeOf(dir);

    const result = run(dir);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /### Prune — 1 entry/);
    assert.match(result.stdout, /Dry run — nothing written/);

    assert.equal(await readRaw(dir), before);
    assert.equal(await mtimeOf(dir), mtimeBefore);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---- prune -------------------------------------------------------------------

test('prune: --write removes an entry matching nothing in the current scan', async () => {
  const dir = await cleanFixture();
  try {
    // Accept the real finding first, so the pruned entry is removed from a
    // baseline that also has something to keep — a prune that emptied the file
    // could not distinguish "pruned the stale one" from "rewrote from scratch".
    assert.equal(run(dir, '--accept-new', '--write').status, 0);
    const accepted = (await readBaseline(dir)).entries;
    assert.equal(accepted.length, 1);

    await writeBaselineFile(dir, [BOGUS_ENTRY, ...accepted]);

    const result = run(dir, '--write');
    assert.equal(result.status, 0);
    assert.match(result.stdout, /1 pruned/);
    assert.deepEqual((await readBaseline(dir)).entries, accepted);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('prune: prune-only does not add, even with --write', async () => {
  const dir = await cleanFixture();
  try {
    await writeBaselineFile(dir, [BOGUS_ENTRY]);

    const result = run(dir, '--write');
    assert.equal(result.status, 0);
    // The scan finds one anchorless pointer. Prune-only must leave it out.
    assert.match(result.stdout, /NOT added \(prune-only\)/);
    assert.deepEqual((await readBaseline(dir)).entries, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('prune: a baseline with nothing to prune and nothing to add is not touched', async () => {
  const dir = await cleanFixture();
  try {
    assert.equal(run(dir, '--accept-new', '--write').status, 0);
    const before = await readRaw(dir);
    const mtimeBefore = await mtimeOf(dir);

    const result = run(dir, '--write');
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Nothing to change/);
    assert.equal(await readRaw(dir), before);
    assert.equal(await mtimeOf(dir), mtimeBefore);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---- accept ------------------------------------------------------------------

test('accept: --accept-new --write on a clean fixture writes the entry a finding carries', async () => {
  const dir = await cleanFixture();
  try {
    const result = run(dir, '--accept-new', '--write');
    assert.equal(result.status, 0);
    assert.match(result.stdout, new RegExp(`Wrote ${BASELINE_FILE.replace('.', '\\.')}`));

    const written = await readBaseline(dir);
    assert.equal(written.version, 1);
    assert.equal(written.entries.length, 1);
    const [entry] = written.entries;
    assert.equal(entry.file, 'docs/notes.md');
    assert.equal(entry.pointer, ptr('designer.md', '83'));
    assert.equal(entry.occurrence, 0);
    assert.equal(entry.kind, 'pointer-anchor-missing');
    // A resolved target with a real cited range digests to a string; the
    // null-digest case is the separate test below.
    assert.equal(typeof entry.digest, 'string');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---- the null-digest (no single target) case ---------------------------------

test('accept: an ambiguous, null-digest entry round-trips through generation', async () => {
  const dir = await withTempRepo(async (d) => {
    // Two files sharing a basename make the citation below ambiguous: no single
    // target, hence no cited range, hence no digest.
    await writeRepoFile(d, 'plugin/skills/one/shared.md', linesOf('alpha', 'beta'));
    await writeRepoFile(d, 'plugin/skills/two/shared.md', linesOf('gamma', 'delta'));
    await writeRepoFile(d, 'docs/notes.md', `See ${cite('shared.md', '2')} for the rule.\n`);
  });
  try {
    assert.equal(run(dir, '--accept-new', '--write').status, 0);

    const written = await readBaseline(dir);
    assert.deepEqual(identify(written.entries), [
      ['docs/notes.md', ptr('shared.md', '2'), 0, 'pointer-ambiguous', true],
    ]);

    // The round trip: the file just written loads back, matches the same
    // finding, and so proposes no further change. A null digest must read as
    // "nothing to compare", never as a mismatch that re-adds the entry.
    const second = run(dir, '--accept-new', '--write');
    assert.equal(second.status, 0);
    assert.match(second.stdout, /Nothing to change/);
    assert.deepEqual(await readBaseline(dir), written);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---- usage -------------------------------------------------------------------

test('an unknown option is a usage error, not a silent no-op', () => {
  const result = run('.', '--regenerate-everything');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown option/);
});

// ---- --rename ------------------------------------------------------------

// A citing file with two accepted pointers of its own — one anchorless
// (digest-bearing), one ambiguous (null-digest) — plus a second, UNRELATED
// citing file whose own pointer names the first file's BASENAME as its
// target. Moving the first file must still let the second file's pointer
// resolve, since matchCandidates matches by basename suffix, not full path.
async function buildRenameFixture(d) {
  await writeRepoFile(d, 'plugin/agents/designer.md', numberedLines(120));
  await writeRepoFile(d, 'plugin/skills/one/shared.md', linesOf('alpha', 'beta'));
  await writeRepoFile(d, 'plugin/skills/two/shared.md', linesOf('gamma', 'delta'));
  await writeRepoFile(
    d,
    'docs/decisions/0001-a.md',
    linesOf(
      `See ${cite('designer.md', '83')} for the rule.`,
      '',
      `See ${cite('shared.md', '2')} for the rule.`,
      '',
      'line 5',
      'line 6',
      'line 7',
      'line 8',
    ),
  );
  await writeRepoFile(d, 'docs/notes.md', `See ${cite('0001-a.md', '7')} for background.\n`);
}

test('rename: pure move re-keys entries verbatim and clears the pointer findings', async () => {
  const dir = await withTempRepo(buildRenameFixture);
  try {
    assert.equal(run(dir, '--accept-new', '--write').status, 0);
    const before = (await readBaseline(dir)).entries;
    assert.equal(before.length, 3);

    // The physical move --rename re-keys the baseline for: the citing file's
    // own content travels with it, byte for byte.
    const content = await readFile(join(dir, 'docs/decisions/0001-a.md'), 'utf8');
    await writeRepoFile(dir, 'wiki/decisions/t/0001-a.md', content);
    await rm(join(dir, 'docs/decisions/0001-a.md'));

    const result = run(
      dir,
      '--rename',
      'docs/decisions/0001-a.md=wiki/decisions/t/0001-a.md',
      '--write',
    );
    assert.equal(result.status, 0);

    const after = (await readBaseline(dir)).entries;
    const moved = before.filter((e) => e.file === 'docs/decisions/0001-a.md');
    assert.equal(moved.length, 2);
    for (const entry of moved) {
      const match = after.find(
        (e) =>
          e.file === 'wiki/decisions/t/0001-a.md' &&
          e.pointer === entry.pointer &&
          e.occurrence === entry.occurrence,
      );
      assert.deepEqual(match, { ...entry, file: 'wiki/decisions/t/0001-a.md' });
    }
    // The notes entry never named 0001-a.md as its OWN `file` — it is
    // untouched by this pair, byte-equal apart from nothing at all.
    const notesBefore = before.find((e) => e.file === 'docs/notes.md');
    assert.deepEqual(
      after.find((e) => e.file === 'docs/notes.md'),
      notesBefore,
    );

    assert.deepEqual(await scanPointerAnchors(dir), []);

    const again = run(dir);
    assert.equal(again.status, 0);
    assert.match(again.stdout, /Nothing to change/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rename: dry run leaves the baseline untouched, --write is the one that changes it', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'plugin/agents/designer.md', numberedLines(120));
    await writeRepoFile(d, 'docs/a.md', ANCHORLESS);
  });
  try {
    assert.equal(run(dir, '--accept-new', '--write').status, 0);
    await rm(join(dir, 'docs/a.md'));
    await writeRepoFile(dir, 'docs/b.md', ANCHORLESS);

    const before = await readRaw(dir);
    const mtimeBefore = await mtimeOf(dir);

    const dryRun = run(dir, '--rename', 'docs/a.md=docs/b.md');
    assert.equal(dryRun.status, 0);
    assert.equal(await readRaw(dir), before);
    assert.equal(await mtimeOf(dir), mtimeBefore);

    // Positive control: the same command with --write does change it.
    const written = run(dir, '--rename', 'docs/a.md=docs/b.md', '--write');
    assert.equal(written.status, 0);
    assert.notEqual(await readRaw(dir), before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rename: drift is refused with both digests and nothing written', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'plugin/agents/designer.md', numberedLines(120));
    await writeRepoFile(d, 'docs/a.md', ANCHORLESS);
  });
  try {
    assert.equal(run(dir, '--accept-new', '--write').status, 0);
    const storedEntry = (await readBaseline(dir)).entries[0];

    await rm(join(dir, 'docs/a.md'));
    await writeRepoFile(dir, 'docs/b.md', ANCHORLESS);
    // Launder: the CITED line itself is rewritten, not merely moved.
    const lines = numberedLines(120).split('\n');
    lines[82] = 'line 83 (edited)';
    await writeRepoFile(dir, 'plugin/agents/designer.md', lines.join('\n'));

    const currentFindings = await scanPointerAnchors(dir, { useBaseline: false });
    const currentEntry = currentFindings.find((f) => f.file === 'docs/b.md');
    assert.ok(currentEntry);
    assert.notEqual(currentEntry.digest, storedEntry.digest);

    const before = await readRaw(dir);
    const mtimeBefore = await mtimeOf(dir);

    const result = run(dir, '--rename', 'docs/a.md=docs/b.md');
    assert.equal(result.status, 1);
    assert.match(result.output, /REFUSED/);
    assert.match(result.output, new RegExp(storedEntry.digest));
    assert.match(result.output, new RegExp(currentEntry.digest));
    assert.match(result.output, /Nothing was written/);
    assert.equal(await readRaw(dir), before);
    assert.equal(await mtimeOf(dir), mtimeBefore);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rename: a rename with no current finding at the new key is refused', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'plugin/agents/designer.md', numberedLines(120));
    await writeRepoFile(d, 'docs/a.md', ANCHORLESS);
  });
  try {
    assert.equal(run(dir, '--accept-new', '--write').status, 0);
    const before = await readRaw(dir);

    const result = run(dir, '--rename', 'docs/a.md=outside/0001-a.md');
    assert.equal(result.status, 1);
    assert.match(result.output, /REFUSED/);
    assert.match(result.output, /outside\/0001-a\.md/);
    assert.match(result.output, /Nothing was written/);
    assert.equal(await readRaw(dir), before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rename: renaming onto a file that already holds entries is refused', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'plugin/agents/designer.md', numberedLines(120));
    await writeRepoFile(d, 'docs/a.md', `See ${cite('designer.md', '83')} for the rule.\n`);
    await writeRepoFile(d, 'docs/c.md', `See ${cite('designer.md', '84')} for the rule.\n`);
  });
  try {
    assert.equal(run(dir, '--accept-new', '--write').status, 0);
    const before = await readRaw(dir);

    const result = run(dir, '--rename', 'docs/a.md=docs/c.md');
    assert.equal(result.status, 1);
    assert.match(result.output, /REFUSED/);
    assert.match(result.output, /docs\/c\.md/);
    assert.match(result.output, /Nothing was written/);
    assert.equal(await readRaw(dir), before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rename: a zero-entry pair alongside a real pair is listed and the run succeeds', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'plugin/agents/designer.md', numberedLines(120));
    await writeRepoFile(d, 'docs/a.md', ANCHORLESS);
  });
  try {
    assert.equal(run(dir, '--accept-new', '--write').status, 0);

    const content = await readFile(join(dir, 'docs/a.md'), 'utf8');
    await writeRepoFile(dir, 'docs/b.md', content);
    await rm(join(dir, 'docs/a.md'));

    const result = run(
      dir,
      '--rename',
      'docs/a.md=docs/b.md',
      '--rename',
      'docs/zzz.md=docs/www.md',
    );
    assert.equal(result.status, 0);
    assert.match(result.stdout, /docs\/zzz\.md=docs\/www\.md/);
    assert.match(result.stdout, /no baseline entries — nothing to re-key/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rename: all pairs zero-entry refuses with nothing to re-key', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'plugin/agents/designer.md', numberedLines(120));
    await writeRepoFile(d, 'docs/a.md', ANCHORLESS);
  });
  try {
    assert.equal(run(dir, '--accept-new', '--write').status, 0);
    const before = await readRaw(dir);

    const result = run(dir, '--rename', 'docs/zzz.md=docs/www.md');
    assert.equal(result.status, 1);
    assert.match(result.output, /REFUSED/);
    assert.match(result.output, /nothing to re-key/);
    assert.match(result.output, /Nothing was written/);
    assert.equal(await readRaw(dir), before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rename: an absent baseline refuses with nothing to re-key and creates no file', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'plugin/agents/designer.md', numberedLines(120));
    await writeRepoFile(d, 'docs/a.md', ANCHORLESS);
  });
  try {
    const result = run(dir, '--rename', 'docs/a.md=docs/b.md');
    assert.equal(result.status, 1);
    assert.match(result.output, /REFUSED/);
    assert.match(result.output, /nothing to re-key/);
    assert.equal(await readRaw(dir), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rename: a simultaneous chain re-keys every hop correctly', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'plugin/agents/designer.md', numberedLines(120));
    await writeRepoFile(d, 'docs/a.md', `See ${cite('designer.md', '83')} for the rule.\n`);
    await writeRepoFile(d, 'docs/b.md', `See ${cite('designer.md', '84')} for the rule.\n`);
  });
  try {
    assert.equal(run(dir, '--accept-new', '--write').status, 0);
    const before = (await readBaseline(dir)).entries;
    assert.equal(before.length, 2);

    // a's content moves onto b; b's own (pre-move) content moves onto c.
    const bContent = await readFile(join(dir, 'docs/b.md'), 'utf8');
    const aContent = await readFile(join(dir, 'docs/a.md'), 'utf8');
    await writeRepoFile(dir, 'docs/c.md', bContent);
    await writeRepoFile(dir, 'docs/b.md', aContent);
    await rm(join(dir, 'docs/a.md'));

    const result = run(
      dir,
      '--rename',
      'docs/a.md=docs/b.md',
      '--rename',
      'docs/b.md=docs/c.md',
      '--write',
    );
    assert.equal(result.status, 0);

    const after = (await readBaseline(dir)).entries;
    assert.equal(after.find((e) => e.pointer === ptr('designer.md', '83')).file, 'docs/b.md');
    assert.equal(after.find((e) => e.pointer === ptr('designer.md', '84')).file, 'docs/c.md');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rename: a stored digest with no current digest passes through verbatim', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'plugin/agents/designer.md', numberedLines(120));
    await writeRepoFile(d, 'docs/a.md', ANCHORLESS);
  });
  try {
    assert.equal(run(dir, '--accept-new', '--write').status, 0);
    const before = (await readBaseline(dir)).entries;
    assert.equal(before.length, 1);
    assert.equal(typeof before[0].digest, 'string');

    await rm(join(dir, 'docs/a.md'));
    await writeRepoFile(dir, 'docs/b.md', ANCHORLESS);
    // A second designer.md makes the target ambiguous, so the current
    // finding at the new key carries a null digest.
    await writeRepoFile(dir, 'plugin/skills/other/designer.md', numberedLines(120));

    const result = run(dir, '--rename', 'docs/a.md=docs/b.md', '--write');
    assert.equal(result.status, 0);

    const after = (await readBaseline(dir)).entries;
    assert.deepEqual(after, [{ ...before[0], file: 'docs/b.md' }]);
    assert.deepEqual(await scanPointerAnchors(dir), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rename: entries left behind by an unrenamed move are warned about but left untouched', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'plugin/agents/designer.md', numberedLines(120));
    await writeRepoFile(d, 'docs/a.md', `See ${cite('designer.md', '83')} for the rule.\n`);
    await writeRepoFile(d, 'docs/x.md', `See ${cite('designer.md', '84')} for the rule.\n`);
  });
  try {
    assert.equal(run(dir, '--accept-new', '--write').status, 0);
    const before = (await readBaseline(dir)).entries;
    const xEntry = before.find((e) => e.file === 'docs/x.md');
    assert.ok(xEntry);

    const aContent = await readFile(join(dir, 'docs/a.md'), 'utf8');
    await writeRepoFile(dir, 'docs/b.md', aContent);
    await rm(join(dir, 'docs/a.md'));
    // docs/x.md moves too, but is NOT named in the --rename below — the
    // operator forgot it.
    const xContent = await readFile(join(dir, 'docs/x.md'), 'utf8');
    await writeRepoFile(dir, 'docs/y.md', xContent);
    await rm(join(dir, 'docs/x.md'));

    const result = run(dir, '--rename', 'docs/a.md=docs/b.md', '--write');
    assert.equal(result.status, 0);
    assert.match(result.stdout, /left behind/);
    assert.match(result.stdout, /docs\/x\.md/);

    const after = (await readBaseline(dir)).entries;
    assert.deepEqual(
      after.find((e) => e.file === 'docs/x.md'),
      xEntry,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rename: usage errors are rejected before any write', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'plugin/agents/designer.md', numberedLines(120));
    await writeRepoFile(d, 'docs/a.md', ANCHORLESS);
  });
  try {
    assert.equal(run(dir, '--accept-new', '--write').status, 0);
    const before = await readRaw(dir);

    const cases = [
      ['--rename'], // missing value
      ['--rename', 'a'], // no '='
      ['--rename', '=b'], // empty <old>
      ['--rename', 'a='], // empty <new>
      ['--rename', 'a=a'], // identical after normalization
      ['--rename', 'a=b', '--rename', 'a=c'], // duplicate <old>
      ['--rename', 'a=c', '--rename', 'b=c'], // duplicate <new>
      ['--rename', 'docs/a.md=docs/c.md', '--accept-new'], // mutually exclusive
    ];
    for (const flags of cases) {
      const result = run(dir, ...flags);
      assert.equal(result.status, 2, `expected usage error for ${JSON.stringify(flags)}`);
      assert.equal(await readRaw(dir), before, `bytes changed for ${JSON.stringify(flags)}`);
    }

    // A lone positional shaped like a --rename pair — no dir argument at
    // all, so this deliberately does not go through run(dir, ...).
    const positionalCase = spawnSync(process.execPath, [SCRIPT, 'a=b'], { encoding: 'utf8' });
    assert.equal(positionalCase.status, 2);
    assert.match(positionalCase.stdout + positionalCase.stderr, /--rename/);
    assert.equal(await readRaw(dir), before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rename: backslash-separated pairs are normalized before re-keying', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'plugin/agents/designer.md', numberedLines(120));
    await writeRepoFile(d, 'docs/decisions/0001-a.md', ANCHORLESS);
  });
  try {
    assert.equal(run(dir, '--accept-new', '--write').status, 0);

    const content = await readFile(join(dir, 'docs/decisions/0001-a.md'), 'utf8');
    await writeRepoFile(dir, 'docs/decisions/0002-a.md', content);
    await rm(join(dir, 'docs/decisions/0001-a.md'));

    const BS = String.fromCharCode(92);
    const token =
      ['docs', 'decisions', '0001-a.md'].join(BS) + '=' + ['docs', 'decisions', '0002-a.md'].join(BS);
    const result = run(dir, '--rename', token, '--write');
    assert.equal(result.status, 0);

    const after = (await readBaseline(dir)).entries;
    assert.equal(after.length, 1);
    assert.equal(after[0].file, 'docs/decisions/0002-a.md');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
