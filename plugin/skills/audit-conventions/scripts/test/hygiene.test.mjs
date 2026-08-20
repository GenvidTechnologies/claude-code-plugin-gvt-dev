import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  scanRetiredTokens,
  scanBrokenLinks,
  scanOrphanedDocs,
  wikiCandidateFiles,
  candidateFileCount,
} from '../lib/hygiene.mjs';
import { resolveDocsRoot } from '../lib/path-overrides.mjs';

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
    assert.equal(findings[0].file, 'docs/foo.md');
    assert.equal(findings[0].line, 1);
    assert.equal(findings[0].token, 'genvid-dev:');
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

test('scanBrokenLinks: a link inside an inline code span is NOT flagged', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'docs/foo.md', 'Use `[x](./missing.md)` as an example.\n');
  });
  try {
    const findings = await scanBrokenLinks(dir);
    assert.deepEqual(findings, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('scanBrokenLinks: a link inside a fenced code block is NOT flagged', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(
      d,
      'docs/foo.md',
      '```md\n[x](./missing.md)\n```\n',
    );
  });
  try {
    const findings = await scanBrokenLinks(dir);
    assert.deepEqual(findings, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('scanBrokenLinks: masking is span-local — a genuine broken link outside a code span on the same line is still flagged', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(
      d,
      'docs/foo.md',
      'Use `[x](./missing-in-span.md)` as an example, but [y](./missing-outside.md) is real.\n',
    );
  });
  try {
    const findings = await scanBrokenLinks(dir);
    assert.equal(findings.length, 1);
    assert.match(findings[0].detail, /docs\/foo\.md:1 broken link -> \.\/missing-outside\.md/);
    assert.ok(
      !findings.some((f) => f.detail.includes('missing-in-span.md')),
      'the link inside the inline code span must not be flagged',
    );
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

// ---------------------------------------------------------------------------
// opts.docsRoot — a relocated knowledge base (#384). Backward compatibility:
// omitting opts.docsRoot must behave byte-identically to the pre-#384 walk
// (proved above by every existing test in this file, none of which pass
// docsRoot).
// ---------------------------------------------------------------------------

// T8 (load-bearing, acceptance row): a repo that retired docs/ entirely in
// favor of documentation/, declaring the relocation via
// `paths: {"docs/TOC.md": "documentation/INDEX.md"}`. Measured baseline on
// the pre-#384 code (git-stashed and probed directly, not asserted here since
// that code no longer exists once this commit lands): scanRetiredTokens(dir),
// scanBrokenLinks(dir), scanOrphanedDocs(dir) each returned 0 findings against
// this exact fixture — "scanned and clean" was indistinguishable from
// "scanned nothing", which is the defect this task fixes.
test('opts.docsRoot: scanRetiredTokens finds a hit under a relocated root — no docs/ directory exists at all', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'documentation/INDEX.md', '# Index\n\nNothing here.\n');
    await writeRepoFile(d, 'documentation/page.md', 'Uses genvid-dev: to invoke.\n');
  });
  try {
    const findings = await scanRetiredTokens(dir, { docsRoot: 'documentation' });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].kind, 'retired-token');
    assert.equal(findings[0].file, 'documentation/page.md');
    assert.equal(findings[0].token, 'genvid-dev:');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('opts.docsRoot: omitting the override on the same relocated-root fixture still finds nothing — docsRoot must be passed explicitly', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'documentation/INDEX.md', '# Index\n\nNothing here.\n');
    await writeRepoFile(d, 'documentation/page.md', 'Uses genvid-dev: to invoke.\n');
  });
  try {
    const findings = await scanRetiredTokens(dir);
    assert.deepEqual(findings, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('scanOrphanedDocs: opts.docsRoot moves BOTH the index location and the re-filter to the relocated root', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'documentation/TOC.md', '# TOC\n\nNothing here.\n');
    await writeRepoFile(d, 'documentation/foo.md', 'content\n');
  });
  try {
    const findings = await scanOrphanedDocs(dir, { docsRoot: 'documentation' });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].kind, 'orphaned-doc');
    assert.match(findings[0].detail, /documentation\/foo\.md is not referenced in documentation\/TOC\.md/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('scanOrphanedDocs: opts.docsRoot — a doc indexed via a bare docsRoot-relative filename is NOT flagged', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'documentation/TOC.md', '# TOC\n\n- [Foo](foo.md)\n');
    await writeRepoFile(d, 'documentation/foo.md', 'content\n');
  });
  try {
    const findings = await scanOrphanedDocs(dir, { docsRoot: 'documentation' });
    assert.deepEqual(findings, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('opts.docsRoot: an unrepresentable override falls back to root "docs" (resolveDocsRoot\'s guard), and the scanners still walk it normally', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'docs/TOC.md', '# TOC\n\nNothing here.\n');
    await writeRepoFile(d, 'docs/foo.md', 'content\n');
  });
  try {
    const { root, unrepresentable } = resolveDocsRoot({ 'docs/TOC.md': 'INDEX.md' });
    assert.equal(root, 'docs');
    assert.equal(unrepresentable, true);

    const findings = await scanOrphanedDocs(dir, { docsRoot: root });
    assert.equal(findings.length, 1);
    assert.match(findings[0].detail, /docs\/foo\.md is not referenced in docs\/TOC\.md/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('candidateFileCount: counts the same candidate set listCandidateFiles produces (docs/**.md + CLAUDE.md)', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'docs/a.md', 'x\n');
    await writeRepoFile(d, 'docs/b.md', 'x\n');
    await writeRepoFile(d, 'CLAUDE.md', 'x\n');
  });
  try {
    assert.equal(await candidateFileCount(dir), 3);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('candidateFileCount: honors opts.docsRoot, and the default root sees none of the relocated files', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'documentation/a.md', 'x\n');
  });
  try {
    // listCandidateFiles always appends the 'CLAUDE.md' candidate regardless
    // of whether it exists on disk (missing files are handled gracefully by
    // safeReadFile downstream) — so the +1 shows up in both counts below.
    assert.equal(await candidateFileCount(dir, { docsRoot: 'documentation' }), 2);
    assert.equal(await candidateFileCount(dir), 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// wikiCandidateFiles — not called by any scanner yet (a later task wires it
// into scanRetiredTokens only, per ADR-0015 decision 2).
// ---------------------------------------------------------------------------

test('wikiCandidateFiles: lists .md files under wikiDir, including nested subdirectories', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'wiki/Home.md', '# Home\n');
    await writeRepoFile(d, 'wiki/nested/Sub-Page.md', '# Sub\n');
    await writeRepoFile(d, 'wiki/notes.txt', 'not markdown\n');
  });
  try {
    const files = await wikiCandidateFiles(dir, 'wiki');
    assert.deepEqual(
      files.sort(),
      ['wiki/Home.md', 'wiki/nested/Sub-Page.md'].sort(),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('wikiCandidateFiles: falsy/absent wikiDir returns [] rather than walking the repo root', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'CLAUDE.md', '# root doc\n');
  });
  try {
    assert.deepEqual(await wikiCandidateFiles(dir, undefined), []);
    assert.deepEqual(await wikiCandidateFiles(dir, ''), []);
    assert.deepEqual(await wikiCandidateFiles(dir, null), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('wikiCandidateFiles: wikiDir naming a directory that does not exist on disk returns []', async () => {
  const dir = await withTempRepo(async () => {});
  try {
    const files = await wikiCandidateFiles(dir, 'wiki');
    assert.deepEqual(files, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('wikiCandidateFiles: opts.excludePaths excludes a specific wiki page', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'wiki/Home.md', '# Home\n');
    await writeRepoFile(d, 'wiki/Retired-Page.md', '# Retired\n');
  });
  try {
    const files = await wikiCandidateFiles(dir, 'wiki', {
      excludePaths: ['wiki/Retired-Page.md'],
    });
    assert.deepEqual(files, ['wiki/Home.md']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// scanRetiredTokens now reaches <wikiDir>/ (F3+F4, #366) — scanBrokenLinks and
// scanOrphanedDocs deliberately do NOT (ADR-0015 decision 2 / ADR-0041):
// `maintain-wiki`'s own `lint` verb already owns dead-wiki-links and
// orphaned-page checks for <wikiDir>/. Every test below includes a mutation
// control proving the relevant scanner is live and the wiki-side emptiness is
// scope, not incapacity.
// ---------------------------------------------------------------------------

// T5. Baseline measured directly against the pre-widening code (git-stashed
// and probed outside this suite, not asserted here since that code no longer
// exists once this commit lands): scanRetiredTokens/scanBrokenLinks/
// scanOrphanedDocs against this exact fixture with opts.wikiDir: 'wiki' all
// returned 0 findings — wiki/other.md was simply never walked. After this
// commit, scanRetiredTokens finds the token; the other two still don't.
test('T5: scanRetiredTokens reaches wiki/other.md when opts.wikiDir is set; scanBrokenLinks/scanOrphanedDocs still do not', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'wiki/other.md', 'Use genvid-dev: to invoke.\n');
  });
  try {
    const tokenFindings = await scanRetiredTokens(dir, { wikiDir: 'wiki' });
    assert.equal(tokenFindings.length, 1);
    assert.equal(tokenFindings[0].kind, 'retired-token');
    assert.equal(tokenFindings[0].file, 'wiki/other.md');

    const linkFindings = await scanBrokenLinks(dir, { wikiDir: 'wiki' });
    assert.deepEqual(linkFindings, []);

    const orphanFindings = await scanOrphanedDocs(dir, { wikiDir: 'wiki' });
    assert.deepEqual(orphanFindings, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// T6. scanBrokenLinks/scanOrphanedDocs never see wiki/ content, at any point
// in this change — this is byte-identical on both sides of the widening,
// since neither scanner's candidate walk changed. The docs/-side control
// (byte-identical dead link, byte-identical unindexed doc) proves both
// scanners are live, not merely silent because they're broken.
test('T6: scanBrokenLinks/scanOrphanedDocs ignore wiki/dead.md and wiki/orphan.md, with a docs/-side control proving both scanners are live', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'wiki/dead.md', '[x](./nope.md)\n');
    await writeRepoFile(d, 'wiki/orphan.md', 'content\n');
    // Control: byte-identical dead link / unindexed doc, under docs/ where
    // both scanners already walk. docs/dead.md is indexed in TOC so it
    // contributes only to the broken-link count, not the orphan count.
    await writeRepoFile(d, 'docs/TOC.md', '# TOC\n\n- [Dead](dead.md)\n');
    await writeRepoFile(d, 'docs/dead.md', '[x](./nope.md)\n');
    await writeRepoFile(d, 'docs/orphan.md', 'content\n');
  });
  try {
    const linkFindings = await scanBrokenLinks(dir, { wikiDir: 'wiki' });
    assert.equal(linkFindings.length, 1, 'exactly the docs/dead.md broken link — wiki/dead.md is not walked');
    assert.match(linkFindings[0].detail, /docs\/dead\.md:1 broken link -> \.\/nope\.md/);
    assert.ok(!linkFindings.some((f) => f.detail.startsWith('wiki/')), 'no wiki/-rooted broken-link finding');

    const orphanFindings = await scanOrphanedDocs(dir, { wikiDir: 'wiki' });
    assert.equal(orphanFindings.length, 1, 'exactly the docs/orphan.md orphan — wiki/orphan.md is not walked');
    assert.match(orphanFindings[0].detail, /docs\/orphan\.md is not referenced in docs\/TOC\.md/);
    assert.ok(!orphanFindings.some((f) => f.detail.startsWith('wiki/')), 'no wiki/-rooted orphaned-doc finding');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// <rawDir>/ guard (F3+F4, #366 / #360) — the default repo-root layout
// (rawDir: 'raw') is already outside every walked root, so nothing to guard.
// The nested layout (rawDir under the docs root) IS inside the walk and needs
// the explicit exclusion added by effectiveExcludes' rawDirExclude.
// ---------------------------------------------------------------------------

// T7a. Default repo-root layout: raw/ is never inside opts.docsRoot ('docs')
// or opts.wikiDir ('wiki'), so it was already unreached before this change —
// this pins that it stays that way now that opts.rawDir exists as a concept.
// The wiki/other.md control proves scanRetiredTokens is actually running
// (with wikiDir wired) and not just vacuously silent.
test('T7a: raw/capture.md (default repo-root layout) is never flagged; the identical token in wiki/other.md still fires', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'raw/capture.md', 'Uses genvid-dev: as captured source.\n');
    await writeRepoFile(d, 'wiki/other.md', 'Uses genvid-dev: too.\n');
  });
  try {
    const findings = await scanRetiredTokens(dir, { wikiDir: 'wiki', rawDir: 'raw' });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'wiki/other.md');
    assert.ok(
      !findings.some((f) => f.file === 'raw/capture.md'),
      'raw/capture.md must never be flagged under the default repo-root layout',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// T7b. Nested layout (rawDir under docsRoot). Baseline measured directly
// against the pre-widening code (git-stashed and probed outside this suite,
// not asserted here since that code no longer exists once this commit
// lands): scanRetiredTokens found BOTH docs/raw/capture.md and docs/other.md
// (token=2), and scanOrphanedDocs flagged docs/raw/capture.md as unindexed
// (orphan=1) — docs/raw/ was walked like any other docs/ subdirectory. After
// this commit, docs/raw/ is excluded: token=1 (docs/other.md survives, which
// doubles as the control proving the docs/ walk itself is still live), and
// orphan=0 (docs/raw/capture.md no longer a candidate to be unindexed).
test('T7b: nested rawDir (docs/raw) is excluded from both scanRetiredTokens and scanOrphanedDocs; docs/other.md survives as the live-scan control', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'docs/TOC.md', '# TOC\n\n- [Other](other.md)\n');
    await writeRepoFile(d, 'docs/raw/capture.md', 'Uses genvid-dev: as captured source.\n');
    await writeRepoFile(d, 'docs/other.md', 'Uses genvid-dev: too.\n');
  });
  try {
    const tokenFindings = await scanRetiredTokens(dir, { rawDir: 'docs/raw' });
    assert.equal(tokenFindings.length, 1);
    assert.equal(tokenFindings[0].file, 'docs/other.md');

    const orphanFindings = await scanOrphanedDocs(dir, { rawDir: 'docs/raw' });
    assert.deepEqual(orphanFindings, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
