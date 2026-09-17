// Integration test: the three repo-hygiene scanners (scanRetiredTokens,
// scanBrokenLinks, scanOrphanedDocs from lib/hygiene.mjs) are wired into
// audit.mjs's validate-mode findings, render via formatFinding's
// self-contained-kind branch, and — critically — never gate the exit code
// (they are info/warning severity only).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { withTempMigratedRepo } from './helpers/temp-repo.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
// scripts/test/hygiene-wiring.test.mjs -> scripts -> audit-conventions -> skills -> plugin
const AUDIT_PATH = resolve(__dirname, '..', 'audit.mjs');

function spawnAudit(args, cwd) {
  return spawnSync(process.execPath, [AUDIT_PATH, ...args], { cwd, encoding: 'utf8' });
}

// Builds a minimal STATE_MIGRATED temp repo (via withTempMigratedRepo) with
// docs fixtures that trip all three hygiene scanners:
//   - docs/example.md: a retired 'genvid-dev:' token, plus a dangling
//     relative link (./nope.md doesn't exist).
//   - docs/orphan.md: present on disk, but not referenced from docs/TOC.md.
//   - docs/TOC.md: indexes docs/example.md but not docs/orphan.md.
async function withTempHygieneRepo(setup) {
  return withTempMigratedRepo(async (dir) => {
    await writeFile(
      join(dir, 'docs', 'example.md'),
      [
        '# Example',
        '',
        'Contains a genvid-dev: token reference here.',
        '',
        'See [broken](./nope.md) for details.',
        '',
      ].join('\n'),
    );
    await writeFile(join(dir, 'docs', 'orphan.md'), '# Orphan\n\nNot indexed anywhere.\n');
    await writeFile(
      join(dir, 'docs', 'TOC.md'),
      ['# TOC', '', '- [Example](./example.md)', ''].join('\n'),
    );
    if (setup) await setup(dir);
  });
}

test('audit: hygiene scanners surface retired-token, broken-link, orphaned-doc findings, and exit 0', async () => {
  const tmpDir = await withTempHygieneRepo();
  try {
    const result = spawnAudit([], tmpDir);

    assert.match(
      result.stdout,
      /retired token 'genvid-dev:'/,
      'report should surface the retired-token finding',
    );
    assert.match(
      result.stdout,
      /broken link -> \.\/nope\.md/,
      'report should surface the broken-link finding',
    );
    assert.match(
      result.stdout,
      /docs\/orphan\.md is not referenced in docs\/TOC\.md/,
      'report should surface the orphaned-doc finding',
    );

    // CRITICAL: these three findings are info/warning severity — they must
    // never gate the exit code. This is the load-bearing regression guard.
    assert.equal(
      result.status,
      0,
      `audit must exit 0 despite hygiene findings (info/warning only):\n${result.stdout}`,
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('audit: hygiene config override (retiredTokens: []) suppresses the retired-token finding', async () => {
  const tmpDir = await withTempHygieneRepo(async (dir) => {
    await writeFile(
      join(dir, '.gvt-agent.json'),
      JSON.stringify(
        { project: { name: 'foo' }, commands: { validate: 'echo ok' }, hygiene: { retiredTokens: [] } },
        null,
        2,
      ),
    );
  });
  try {
    const result = spawnAudit([], tmpDir);

    assert.doesNotMatch(
      result.stdout,
      /retired token/,
      'retired-token finding should disappear once hygiene.retiredTokens is overridden to []',
    );
    // The other two scanners are unaffected by this override and should still fire.
    assert.match(
      result.stdout,
      /broken link -> \.\/nope\.md/,
      'broken-link finding should be unaffected by the retiredTokens override',
    );
    assert.match(
      result.stdout,
      /docs\/orphan\.md is not referenced in docs\/TOC\.md/,
      'orphaned-doc finding should be unaffected by the retiredTokens override',
    );
    assert.equal(result.status, 0, 'audit should still exit 0');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// #454 AC10. withTempMigratedRepo's base fixture creates docs/ but never
// docs/TOC.md, so scanOrphanedDocs' guard 2 (missing index, ADR-0053) fires
// unconditionally here with no extra setup. This pins that the resulting
// orphan-check-skipped finding renders through formatFinding's self-contained
// branch (registered in SELF_CONTAINED_KINDS) rather than falling through to
// the component branch, which would print `**undefined**` where a component
// name goes since this finding carries no f.component.
test('audit: a missing docs/TOC.md renders an orphan-check-skipped report line, never **undefined** (#454 AC10)', async () => {
  const tmpDir = await withTempMigratedRepo();
  try {
    const result = spawnAudit([], tmpDir);

    const skipLine = result.stdout
      .split('\n')
      .find((line) => line.startsWith('- orphan check skipped'));
    assert.ok(
      skipLine,
      `expected a report line starting "- orphan check skipped":\n${result.stdout}`,
    );
    assert.doesNotMatch(
      skipLine,
      /\*\*undefined\*\*/,
      'the self-contained branch must render this finding, not the component branch with f.component undefined',
    );

    // Positive control, same report: a component-branch "expects" line is
    // also present (e.g. plan-task's docs/TOC.md expectation, unmet in this
    // same fixture) — proving that render path IS exercised in this exact
    // output, so the absence of **undefined** above is specific to the
    // orphan-check-skipped finding rather than vacuous because the component
    // branch never fires at all.
    assert.match(
      result.stdout,
      /\*\*[\w-]+\*\* expects/,
      `expected at least one component-branch "expects" line in the same report:\n${result.stdout}`,
    );

    // Note: this fixture's absent docs/TOC.md ALSO trips an unrelated
    // required-expectation failure (condense-lessons requires docs/TOC.md
    // outright), so the exit code here is 1 for a reason that has nothing to
    // do with the orphan-check-skipped finding (which is info-severity and
    // never gates the exit code — see the two exit-0 tests above). This test
    // is scoped to the rendering question only.
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// #454 AC21. A `docs/TOC.md` paths override collapsing docsRoot onto wikiDir
// is a real, wireable repo shape (ADR-0053) — not just a lib/hygiene.mjs unit
// scenario. This confirms scanBrokenLinks' link-check-skipped finding
// actually reaches the rendered report through audit.mjs's real config load
// (loadHygieneConfig / repoConfig.wiki), not only through a hand-built opts
// object in the unit tests above.
test('audit: a docsRoot-collapsed-onto-wikiDir repo renders a link-check-skipped report line (#454 AC21)', async () => {
  const tmpDir = await withTempMigratedRepo(async (dir) => {
    await writeFile(
      join(dir, '.gvt-agent.json'),
      JSON.stringify(
        {
          project: { name: 'foo' },
          commands: { validate: 'echo ok' },
          wiki: { wikiDir: 'wiki' },
          paths: { 'docs/TOC.md': 'wiki/TOC.md' },
        },
        null,
        2,
      ),
    );
    await mkdir(join(dir, 'wiki'), { recursive: true });
    await writeFile(join(dir, 'wiki', 'TOC.md'), '# TOC\n\n- [Page](page.md)\n');
    await writeFile(join(dir, 'wiki', 'page.md'), '# Page\n\ncontent\n');
  });
  try {
    const result = spawnAudit([], tmpDir);

    assert.ok(
      result.stdout.includes('were not link-checked'),
      `expected a link-check-skipped report line:\n${result.stdout}`,
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});
