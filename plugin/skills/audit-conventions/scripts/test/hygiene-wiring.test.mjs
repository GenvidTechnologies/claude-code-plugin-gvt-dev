// Integration test: the three repo-hygiene scanners (scanRetiredTokens,
// scanBrokenLinks, scanOrphanedDocs from lib/hygiene.mjs) are wired into
// audit.mjs's validate-mode findings, render via formatFinding's
// self-contained-kind branch, and — critically — never gate the exit code
// (they are info/warning severity only).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rm, writeFile } from 'node:fs/promises';
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
