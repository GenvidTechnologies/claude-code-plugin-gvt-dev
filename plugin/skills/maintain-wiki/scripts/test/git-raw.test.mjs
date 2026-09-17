import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

import { checkRawImmutability } from '../lib/git-raw.mjs';

async function withTempRepo(setup) {
  const dir = await mkdtemp(join(tmpdir(), 'git-raw-test-'));
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

// Real git fixture helpers — a mocked `git` would prove nothing about
// `--diff-filter=M` actually being the right flag.
function git(dir, args) {
  const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

// Local repo config, not global — never depends on the machine's git
// identity, and `commit.gpgsign=false` here means this fixture never goes
// through this repo's own 1Password SSH-agent signing setup, regardless of
// what the ambient global config happens to carry.
function gitInit(dir) {
  git(dir, ['init', '-q', '.']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
}

function commit(dir, message) {
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', message]);
}

function findByKind(findings, kind) {
  return findings.filter((f) => f.kind === kind);
}

// ---------------------------------------------------------------------------
// The real check: a raw/ file, untouched vs. modified.
// ---------------------------------------------------------------------------

test('checkRawImmutability: an untouched raw/ file has no finding; modifying it in a second commit reports exactly it', async () => {
  const dir = await withTempRepo(async (d) => {
    gitInit(d);
    await writeRepoFile(d, 'raw/source.json', '{"v":1}\n');
    await writeRepoFile(d, 'raw/untouched.json', '{"v":1}\n');
    commit(d, 'add raw files');
  });
  try {
    const clean = checkRawImmutability(dir, 'raw');
    assert.deepEqual(clean, []);

    // Control, same fixture: modify one of the two files in a second commit.
    await writeRepoFile(dir, 'raw/source.json', '{"v":2}\n');
    commit(dir, 'modify raw/source.json');

    const findings = checkRawImmutability(dir, 'raw');
    assert.equal(findings.length, 1);
    assert.equal(findings[0].kind, 'raw-modified');
    assert.equal(findings[0].ok, false);
    assert.equal(findings[0].severity, 'warning');
    assert.equal(findings[0].page, 'raw/source.json');
    // The sibling file, never touched again, must not be swept in.
    assert.ok(!findings.some((f) => f.page === 'raw/untouched.json'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('checkRawImmutability: two modified files both report, sorted; a third untouched file does not', async () => {
  const dir = await withTempRepo(async (d) => {
    gitInit(d);
    await writeRepoFile(d, 'raw/z-file.json', '{"v":1}\n');
    await writeRepoFile(d, 'raw/a-file.json', '{"v":1}\n');
    await writeRepoFile(d, 'raw/never-touched.json', '{"v":1}\n');
    commit(d, 'add raw files');
    await writeRepoFile(d, 'raw/z-file.json', '{"v":2}\n');
    await writeRepoFile(d, 'raw/a-file.json', '{"v":2}\n');
    commit(d, 'modify two raw files');
  });
  try {
    const findings = checkRawImmutability(dir, 'raw');
    const pages = findByKind(findings, 'raw-modified').map((f) => f.page);
    assert.deepEqual(pages, ['raw/a-file.json', 'raw/z-file.json']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Skip case 1 — git not installed / not on PATH.
// ---------------------------------------------------------------------------

test('checkRawImmutability: git not on PATH reports one info finding, reason git-unavailable', async () => {
  const dir = await withTempRepo(async (d) => {
    gitInit(d);
    await writeRepoFile(d, 'raw/source.json', '{"v":1}\n');
    commit(d, 'add raw/source.json');
  });
  const emptyPathDir = await mkdtemp(join(tmpdir(), 'git-raw-test-empty-path-'));
  try {
    // A PATH pointing only at an empty directory: spawnSync's own lookup
    // fails before ever reaching CreateProcess, so this simulates "git is
    // not installed" without touching global process.env or requiring an
    // actual uninstall.
    const findings = checkRawImmutability(dir, 'raw', { env: { PATH: emptyPathDir } });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].kind, 'raw-immutability-check-skipped');
    assert.equal(findings[0].severity, 'info');
    assert.equal(findings[0].reason, 'git-unavailable');

    // Control, same fixture, real PATH: the check actually runs and finds
    // the file clean — proves the finding above is a genuine short-circuit,
    // not a permanently-skipped stub.
    const control = checkRawImmutability(dir, 'raw');
    assert.deepEqual(control, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(emptyPathDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Skip case 2 — not a git repository.
// ---------------------------------------------------------------------------

test('checkRawImmutability: a plain directory with no .git reports one info finding, reason not-a-git-repo', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'raw/source.json', '{"v":1}\n');
  });
  try {
    const findings = checkRawImmutability(dir, 'raw');
    assert.equal(findings.length, 1);
    assert.equal(findings[0].kind, 'raw-immutability-check-skipped');
    assert.equal(findings[0].severity, 'info');
    assert.equal(findings[0].reason, 'not-a-git-repo');

    // Control, same directory, now git-initialized and committed: the
    // check actually runs — proves the finding above tracked repo-ness,
    // not something permanently wrong with the fixture.
    gitInit(dir);
    commit(dir, 'add raw/source.json');
    const control = checkRawImmutability(dir, 'raw');
    assert.deepEqual(control, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Skip case 3 — rawDir has no git history at all.
// ---------------------------------------------------------------------------

test('checkRawImmutability: raw/ never committed reports one info finding, reason no-history', async () => {
  const dir = await withTempRepo(async (d) => {
    gitInit(d);
    // A commit exists in the repo, but nothing under raw/ — the directory
    // itself is not even created yet.
    await writeRepoFile(d, 'wiki/index.md', '# Index\n');
    commit(d, 'unrelated first commit');
  });
  try {
    const findings = checkRawImmutability(dir, 'raw');
    assert.equal(findings.length, 1);
    assert.equal(findings[0].kind, 'raw-immutability-check-skipped');
    assert.equal(findings[0].severity, 'info');
    assert.equal(findings[0].reason, 'no-history');

    // Control, same fixture: committing a file under raw/ moves the check
    // into a real (empty) result — proves the skip above tracked history,
    // not a repo the check is broken against.
    await writeRepoFile(dir, 'raw/source.json', '{"v":1}\n');
    commit(dir, 'add raw/source.json');
    const control = checkRawImmutability(dir, 'raw');
    assert.deepEqual(control, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Degenerate rawDir — never a git query scoped to the whole repo.
// ---------------------------------------------------------------------------

test('AC-style: degenerate rawDir values yield [] rather than a repo-wide git query', async () => {
  const dir = await withTempRepo(async (d) => {
    gitInit(d);
    await writeRepoFile(d, 'raw/source.json', '{"v":1}\n');
    commit(d, 'add raw/source.json');
    await writeRepoFile(d, 'raw/source.json', '{"v":2}\n');
    commit(d, 'modify raw/source.json');
  });
  try {
    // Control, same fixture: a real rawDir produces a genuine, non-empty
    // finding — proves the zeros below are refusal, not a check that never
    // finds anything.
    const control = checkRawImmutability(dir, 'raw');
    assert.equal(control.length, 1);
    assert.equal(control[0].kind, 'raw-modified');

    for (const degenerate of [undefined, '', '.', '/', '..', join(dir, 'raw')]) {
      const result = checkRawImmutability(dir, degenerate);
      assert.deepEqual(
        result,
        [],
        `rawDir=${JSON.stringify(degenerate)} must yield []`,
      );
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
