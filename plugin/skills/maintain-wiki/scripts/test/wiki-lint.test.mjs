import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const WIKI_LINT = fileURLToPath(new URL('../wiki-lint.mjs', import.meta.url));

async function withTempRepo(setup) {
  const dir = await mkdtemp(join(tmpdir(), 'wiki-lint-test-'));
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

function runWikiLint(repoPath) {
  const result = spawnSync(process.execPath, [WIKI_LINT, repoPath], { encoding: 'utf8' });
  return result;
}

// ---------------------------------------------------------------------------
// A bundle with a real finding (dead link, out-of-bundle link) and a skip
// finding (no wiki/index.md -> orphan-check-skipped; not a git repo ->
// raw-immutability-check-skipped) in the same run. Exit code must still be 0
// — that is the advisory contract, and this fixture is the control proving
// "exit 0" isn't vacuously passing over an empty report.
// ---------------------------------------------------------------------------

test('wiki-lint: exits 0 with real findings AND skip findings both present in stdout', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(
      d,
      '.gvt-agent.json',
      JSON.stringify({ wiki: { wikiDir: 'wiki', rawDir: 'raw' } }),
    );
    // Real finding 1: a dead link (resolves inside the bundle, doesn't exist).
    // Real finding 2: an out-of-bundle link (resolves outside wiki/).
    await writeRepoFile(
      d,
      'wiki/page-a.md',
      '# Page A\n\n## Related\n\n- [Missing page](./page-b.md)\n- [Outside](../docs/notes.md)\n',
    );
    // No wiki/index.md -> checkOrphanedPages returns a single
    // orphan-check-skipped finding instead of scanning for orphans.
    // No git init anywhere -> checkRawImmutability returns a single
    // raw-immutability-check-skipped finding (reason not-a-git-repo).
  });
  try {
    const result = runWikiLint(dir);
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}. stderr: ${result.stderr}`);

    const out = result.stdout;

    // Real findings actually appear in stdout — the control that "exit 0"
    // isn't passing over a silently empty report.
    assert.match(out, /### Dead links/);
    assert.match(out, /1 finding:/);
    assert.match(out, /page-a\.md.*dead link -> \.\/page-b\.md/);

    assert.match(out, /### Out-of-bundle links \(advisory\)/);
    assert.match(out, /page-a\.md.*link -> \.\.\/docs\/notes\.md resolves outside wiki\//);

    // Skip findings are visibly distinguished from "checked, clean".
    assert.match(out, /### Orphaned pages \/ unreachable subtrees/);
    assert.match(out, /\[SKIPPED — could not check\].*orphan check skipped/);

    assert.match(out, /### raw\/ immutability \(optional, rawDir=raw\)/);
    assert.match(out, /\[SKIPPED — could not check\].*not a git repository/);

    // The summary line separates real findings from skipped checks rather
    // than folding them into one number.
    assert.match(out, /## summary: 2 findings, 2 checks could not run/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Control: a bundle with nothing wrong at all reports "checked — clean" for
// every section, never conflating it with a skip.
// ---------------------------------------------------------------------------

test('wiki-lint: a clean, fully-checkable bundle reports "checked — clean" everywhere, exit 0', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(
      d,
      '.gvt-agent.json',
      JSON.stringify({ wiki: { wikiDir: 'wiki', rawDir: 'raw' } }),
    );
    await writeRepoFile(d, 'wiki/index.md', '# Index\n\n- [Page A](./page-a.md)\n');
    await writeRepoFile(d, 'wiki/page-a.md', '# Page A\n\nNo links here.\n');
    const git = (args) => spawnSync('git', args, { cwd: d, encoding: 'utf8' });
    git(['init', '-q', '.']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'Test']);
    git(['config', 'commit.gpgsign', 'false']);
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'add wiki']);
  });
  try {
    const result = runWikiLint(dir);
    assert.equal(result.status, 0);

    const out = result.stdout;
    assert.match(out, /### Dead links\s*\n\s*checked — clean, 0 findings/);
    assert.match(out, /### Out-of-bundle links \(advisory\)\s*\n\s*checked — clean, 0 findings/);
    assert.match(
      out,
      /### Orphaned pages \/ unreachable subtrees\s*\n\s*checked — clean, 0 findings/,
    );
    // raw/ was never populated, so its check is genuinely skipped
    // (no-history) — a real, expected "could not check", not a bug in the
    // fixture.
    assert.match(out, /\[SKIPPED — could not check\].*no git history/);
    assert.match(out, /## summary: 0 findings, 1 check could not run/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Missing/unparseable .gvt-agent.json falls back to defaults and says so,
// rather than crashing.
// ---------------------------------------------------------------------------

test('wiki-lint: missing .gvt-agent.json falls back to wiki/raw defaults and notes it, exit 0', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'wiki/page-a.md', '# Page A\n\nNo links.\n');
  });
  try {
    const result = runWikiLint(dir);
    assert.equal(result.status, 0);

    const out = result.stdout;
    assert.match(out, /wikiDir: wiki \(default\)/);
    assert.match(out, /rawDir:  raw \(default\)/);
    assert.match(out, /note:.*\.gvt-agent\.json is missing or could not be parsed/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// An absent bundle must not read as a clean one. The two link checks return
// findings, so an empty result from them is ambiguous: it means "every link
// resolved" over a real corpus and equally "there were no pages at all" when
// <wikiDir>/ is missing. Rendering the second as "checked — clean" would
// assert a clean bill of health over a bundle the run never opened — the same
// scanned-nothing-versus-scanned-and-clean conflation the orphan and raw
// checks each return an explicit skip to avoid.
test('wiki-lint: an absent bundle reports every check as could-not-run, never as clean', async () => {
  const dir = await withTempRepo(async () => {});
  try {
    const result = runWikiLint(dir);
    assert.equal(result.status, 0, 'advisory: exit 0 even with nothing to check');
    assert.ok(
      !result.stdout.includes('checked — clean'),
      'no section may claim a clean result over a bundle that does not exist',
    );
    assert.match(result.stdout, /## summary: 0 findings, 4 checks could not run/);

    // Control, same harness: a real bundle with a resolvable link DOES report
    // "checked — clean" for its link checks — so the absence above is the
    // empty-corpus guard firing, not a CLI that can never print a clean line.
    const live = await withTempRepo(async (d) => {
      await writeRepoFile(d, 'wiki/index.md', '[a](a.md)\n');
      await writeRepoFile(d, 'wiki/a.md', '# A\n');
    });
    try {
      const control = runWikiLint(live);
      assert.equal(control.status, 0);
      assert.match(control.stdout, /### Dead links\r?\n {2}checked — clean/);
      assert.ok(
        !control.stdout.includes('nothing to link-check'),
        'a populated bundle must not take the empty-corpus path',
      );
    } finally {
      await rm(live, { recursive: true, force: true });
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
