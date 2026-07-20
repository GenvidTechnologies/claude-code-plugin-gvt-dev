import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

import { scanRetiredTokens, scanBrokenLinks, scanOrphanedDocs } from '../lib/hygiene.mjs';

async function withTempRepo(setup) {
  const dir = await mkdtemp(join(tmpdir(), 'hygiene-test-'));
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

function git(dir, args) {
  const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

// ---------------------------------------------------------------------------
// scanRetiredTokens
// ---------------------------------------------------------------------------

test('scanRetiredTokens: flags a retired token in a doc', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'docs/foo.md', 'Use genvid-dev: to invoke.\n');
  });
  try {
    const findings = await scanRetiredTokens(dir);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].kind, 'retired-token');
    assert.equal(findings[0].ok, false);
    assert.equal(findings[0].severity, 'info');
    assert.match(findings[0].detail, /docs\/foo\.md:1 contains retired token 'genvid-dev:'/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('scanRetiredTokens: a hit on a line containing "http" is NOT flagged', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'docs/foo.md', 'See https://example.com/genvid-dev: for history.\n');
  });
  try {
    const findings = await scanRetiredTokens(dir);
    assert.equal(findings.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('scanRetiredTokens: a hit inside an excludePaths dir is NOT flagged', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'docs/superpowers/x.md', 'Old name was genvid-dev: back then.\n');
  });
  try {
    const findings = await scanRetiredTokens(dir);
    assert.equal(findings.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('scanRetiredTokens: missing docs/ dir -> []', async () => {
  const dir = await withTempRepo(async () => {});
  try {
    const findings = await scanRetiredTokens(dir);
    assert.deepEqual(findings, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// scanRetiredTokens — git-tracked config coverage (ADR-0014)
// ---------------------------------------------------------------------------

test('scanRetiredTokens: a git-tracked .gvt-agent.json containing a retired token is flagged', async () => {
  const dir = await withTempRepo(async (d) => {
    git(d, ['init', '-q', '.']);
    await writeRepoFile(d, '.gvt-agent.json', '{ "note": "genvid-dev: legacy" }\n');
    git(d, ['add', '.gvt-agent.json']);
  });
  try {
    const findings = await scanRetiredTokens(dir);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].kind, 'retired-token');
    assert.equal(findings[0].ok, false);
    assert.equal(findings[0].severity, 'info');
    assert.match(findings[0].detail, /\.gvt-agent\.json:1 contains retired token 'genvid-dev:'/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('scanRetiredTokens: an untracked .claude/settings.local.json containing a retired token is NOT flagged', async () => {
  const dir = await withTempRepo(async (d) => {
    git(d, ['init', '-q', '.']);
    // Written to disk but never `git add`-ed — conventionally a per-developer
    // local override, which can legitimately contain a literal retired-token
    // string (e.g. a permission grep-pattern rule).
    await writeRepoFile(d, '.claude/settings.local.json', '{ "rule": "genvid-dev:" }\n');
  });
  try {
    const findings = await scanRetiredTokens(dir);
    assert.deepEqual(findings, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('scanRetiredTokens: a git-tracked config line containing "http" with a token is NOT flagged', async () => {
  const dir = await withTempRepo(async (d) => {
    git(d, ['init', '-q', '.']);
    await writeRepoFile(
      d,
      'package.json',
      '{ "homepage": "https://example.com/genvid-dev:" }\n',
    );
    git(d, ['add', 'package.json']);
  });
  try {
    const findings = await scanRetiredTokens(dir);
    assert.deepEqual(findings, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('scanRetiredTokens: non-git repo with a docs/foo.md token is still flagged (markdown scan unaffected)', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'docs/foo.md', 'Use genvid-dev: to invoke.\n');
  });
  try {
    const findings = await scanRetiredTokens(dir);
    assert.equal(findings.length, 1);
    assert.match(findings[0].detail, /docs\/foo\.md:1 contains retired token 'genvid-dev:'/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// scanBrokenLinks
// ---------------------------------------------------------------------------

test('scanBrokenLinks: a link to a missing file is flagged', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'docs/foo.md', '[x](./missing.md)\n');
  });
  try {
    const findings = await scanBrokenLinks(dir);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].kind, 'broken-link');
    assert.equal(findings[0].severity, 'warning');
    assert.match(findings[0].detail, /docs\/foo\.md:1 broken link -> \.\/missing\.md/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('scanBrokenLinks: links to an existing file, an existing dir, an external URL, and a pure anchor are NOT flagged', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'docs/exists.md', 'target\n');
    await mkdir(join(d, 'somedir'), { recursive: true });
    await writeRepoFile(
      d,
      'docs/foo.md',
      '[x](./exists.md)\n[d](../somedir/)\n[e](https://x)\n[a](#anchor)\n',
    );
  } );
  try {
    const findings = await scanBrokenLinks(dir);
    assert.deepEqual(findings, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('scanBrokenLinks: missing docs/ dir -> []', async () => {
  const dir = await withTempRepo(async () => {});
  try {
    const findings = await scanBrokenLinks(dir);
    assert.deepEqual(findings, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// scanOrphanedDocs
// ---------------------------------------------------------------------------

test('scanOrphanedDocs: a doc not mentioned in docs/TOC.md is flagged', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'docs/TOC.md', '# TOC\n\nNothing here.\n');
    await writeRepoFile(d, 'docs/foo.md', 'content\n');
  });
  try {
    const findings = await scanOrphanedDocs(dir);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].kind, 'orphaned-doc');
    assert.equal(findings[0].severity, 'info');
    assert.match(findings[0].detail, /docs\/foo\.md is not referenced in docs\/TOC\.md/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('scanOrphanedDocs: a doc whose path is mentioned in docs/TOC.md is NOT flagged', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'docs/TOC.md', '# TOC\n\n- [Bar](docs/bar.md)\n');
    await writeRepoFile(d, 'docs/bar.md', 'content\n');
  });
  try {
    const findings = await scanOrphanedDocs(dir);
    assert.deepEqual(findings, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('scanOrphanedDocs: a doc indexed via a bare docs-relative filename (no docs/ prefix) is NOT flagged', async () => {
  const dir = await withTempRepo(async (d) => {
    // docs/TOC.md lives inside docs/ itself, so it commonly links siblings
    // with a bare filename rather than the full repo-relative path.
    await writeRepoFile(d, 'docs/TOC.md', '# TOC\n\n- [Foo](foo.md)\n');
    await writeRepoFile(d, 'docs/foo.md', 'content\n');
  });
  try {
    const findings = await scanOrphanedDocs(dir);
    assert.deepEqual(findings, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('scanOrphanedDocs: a doc under an excludePaths dir is NOT flagged', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'docs/TOC.md', '# TOC\n\nNothing here.\n');
    await writeRepoFile(d, 'docs/superpowers/plan.md', 'content\n');
  });
  try {
    const findings = await scanOrphanedDocs(dir);
    assert.deepEqual(findings, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('scanOrphanedDocs: no docs/TOC.md -> []', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'docs/foo.md', 'content\n');
  });
  try {
    const findings = await scanOrphanedDocs(dir);
    assert.deepEqual(findings, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// opts overrides
// ---------------------------------------------------------------------------

test('opts.retiredTokens override changes scanRetiredTokens results vs defaults', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'docs/foo.md', 'This uses a custom-token: marker.\n');
  });
  try {
    const defaultFindings = await scanRetiredTokens(dir);
    assert.equal(defaultFindings.length, 0, 'default tokens should not match a custom marker');

    const overriddenFindings = await scanRetiredTokens(dir, { retiredTokens: ['custom-token:'] });
    assert.equal(overriddenFindings.length, 1);
    assert.match(overriddenFindings[0].detail, /custom-token:/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('opts.excludePaths override changes scanOrphanedDocs results vs defaults', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'docs/TOC.md', '# TOC\n\nNothing here.\n');
    await writeRepoFile(d, 'docs/special/foo.md', 'content\n');
  });
  try {
    const defaultFindings = await scanOrphanedDocs(dir);
    assert.equal(defaultFindings.length, 1, 'default excludePaths should not exclude docs/special/');

    const overriddenFindings = await scanOrphanedDocs(dir, { excludePaths: ['docs/special/'] });
    assert.deepEqual(overriddenFindings, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('opts.excludePaths MERGES with the baked-in defaults, it does not replace them', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'docs/TOC.md', '# TOC\n\nNothing here.\n');
    // Still covered by the baked-in defaults even though opts.excludePaths
    // only names an unrelated extra directory.
    await writeRepoFile(d, 'docs/decisions/0001-example.md', 'content\n');
    await writeRepoFile(d, 'CHANGELOG.md', '## Unreleased\n- did a thing\n');
    // Only excluded via the opts override.
    await writeRepoFile(d, 'docs/special/foo.md', 'content\n');
  });
  try {
    const findings = await scanOrphanedDocs(dir, { excludePaths: ['docs/special/'] });
    assert.deepEqual(
      findings,
      [],
      'docs/decisions/ and CHANGELOG.md defaults must still apply alongside the opts addition',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('opts.retiredTokens REPLACES the defaults (does not merge) — a custom deny-list stops matching the baked-in tokens', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'docs/foo.md', 'Uses genvid-dev: and custom-token: markers.\n');
  });
  try {
    const overriddenFindings = await scanRetiredTokens(dir, { retiredTokens: ['custom-token:'] });
    assert.equal(overriddenFindings.length, 1);
    assert.match(overriddenFindings[0].detail, /custom-token:/);
    assert.ok(
      !overriddenFindings.some((f) => f.detail.includes('genvid-dev:')),
      'the baked-in genvid-dev: token must not be matched once retiredTokens is overridden',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
