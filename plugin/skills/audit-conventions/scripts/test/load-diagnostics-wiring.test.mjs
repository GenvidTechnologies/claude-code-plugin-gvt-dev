// End-to-end wiring test for the component load-failure diagnostics: spawns
// the REAL audit.mjs, with the real audit-conventions scripts copied into a
// throwaway plugin root, against a consumer repo OUTSIDE that plugin root (so
// the audit is not the plugin auditing its own source). The throwaway plugin
// root holds a package.json with the real `imports` map and a link to the real
// plugin/node_modules, so `#audit-core` resolves to the installed audit-core.
//
// The fixture is one skill whose frontmatter is malformed YAML
// (`description: Use it: now`, a parseError). The audit must print the whole
// report, name the skill in a diagnostic, and exit 2.
//
// A dangling skill-directory link (makeDanglingLink) is the readError
// end-to-end fixture under audit-core 0.4.0: walkComponents reports the
// unreadable entry instead of skipping it. A skill with no frontmatter block
// is the NO_FRONTMATTER parseError fixture.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, copyFile, writeFile, symlink, cp } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { makeDanglingLink } from './helpers/temp-repo.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = join(__dirname, '..');
const REAL_PLUGIN_ROOT = join(SCRIPTS_DIR, '..', '..', '..');
const TMP = realpathSync.native(tmpdir());

// Builds <tmp>/plugin (a plugin root) and <tmp>/consumer (the audited repo),
// calls fn(pluginRoot, consumerRoot), and removes both.
async function withFixture(fn) {
  const base = await mkdtemp(join(TMP, 'gvt-load-diag-wiring-'));
  try {
    const pluginRoot = join(base, 'plugin');
    const consumerRoot = join(base, 'consumer');
    const scriptsDir = join(pluginRoot, 'skills', 'audit-conventions', 'scripts');
    await mkdir(consumerRoot, { recursive: true });
    await cp(SCRIPTS_DIR, scriptsDir, {
      recursive: true,
      filter: (src) => !src.startsWith(join(SCRIPTS_DIR, 'test')),
    });
    await copyFile(join(REAL_PLUGIN_ROOT, 'package.json'), join(pluginRoot, 'package.json'));
    await copyFile(join(REAL_PLUGIN_ROOT, 'package-lock.json'), join(pluginRoot, 'package-lock.json'));
    await symlink(join(REAL_PLUGIN_ROOT, 'node_modules'), join(pluginRoot, 'node_modules'), 'junction');
    await fn(pluginRoot, consumerRoot);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
}

async function writeSkill(pluginRoot, name, frontmatter) {
  const dir = join(pluginRoot, 'skills', name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'SKILL.md'), `---\n${frontmatter}\n---\n\nBody.\n`);
}

function spawnAudit(pluginRoot, consumerRoot) {
  const audit = join(pluginRoot, 'skills', 'audit-conventions', 'scripts', 'audit.mjs');
  return spawnSync(process.execPath, [audit], { cwd: consumerRoot, encoding: 'utf8' });
}

test('load diagnostics wiring: a skill with malformed frontmatter makes a consumer audit exit 2 and name the skill', async () => {
  await withFixture(async (pluginRoot, consumerRoot) => {
    await writeSkill(pluginRoot, 'broken-skill', 'name: broken-skill\ndescription: Use it: now');

    const result = spawnAudit(pluginRoot, consumerRoot);
    assert.equal(result.status, 2, `expected exit 2:\nstdout:${result.stdout}\nstderr:${result.stderr}`);
    assert.match(result.stdout, /^- The plugin's own skill "broken-skill" has frontmatter that could not be parsed/m);
    assert.match(result.stdout, /BLOCK_AS_IMPLICIT_KEY/);
  });
});

test('load diagnostics wiring: a skill with no frontmatter makes a consumer audit exit 2', async () => {
  await withFixture(async (pluginRoot, consumerRoot) => {
    const dir = join(pluginRoot, 'skills', 'bare');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'SKILL.md'), 'Just a body, no frontmatter.\n');

    const result = spawnAudit(pluginRoot, consumerRoot);
    assert.equal(result.status, 2, `expected exit 2:\nstdout:${result.stdout}\nstderr:${result.stderr}`);
    assert.match(result.stdout, /^- The plugin's own skill "bare" is missing its frontmatter/m);
    assert.doesNotMatch(result.stdout, /"bare" has frontmatter/);
  });
});

test('load diagnostics wiring: a dangling skill link makes a consumer audit exit 2 without a doubled error code', async () => {
  await withFixture(async (pluginRoot, consumerRoot) => {
    await mkdir(join(pluginRoot, 'skills'), { recursive: true });
    await makeDanglingLink(join(pluginRoot, 'skills', 'ghost'));

    const result = spawnAudit(pluginRoot, consumerRoot);
    assert.equal(result.status, 2, `expected exit 2:\nstdout:${result.stdout}\nstderr:${result.stderr}`);
    assert.doesNotMatch(result.stdout, /ENOENT: ENOENT/);
  });
});

test('load diagnostics wiring: the full report prints before the load-failure exit', async () => {
  await withFixture(async (pluginRoot, consumerRoot) => {
    await writeSkill(pluginRoot, 'broken-skill', 'name: broken-skill\ndescription: Use it: now');

    const result = spawnAudit(pluginRoot, consumerRoot);
    assert.equal(result.status, 2, `expected exit 2:\nstdout:${result.stdout}\nstderr:${result.stderr}`);
    assert.match(result.stdout, /### Summary/);
  });
});

test('load diagnostics wiring: a well-formed skill alone does not exit 2 and reports no load failure', async () => {
  await withFixture(async (pluginRoot, consumerRoot) => {
    await writeSkill(pluginRoot, 'fine-skill', 'name: fine-skill\ndescription: A well formed skill');

    const result = spawnAudit(pluginRoot, consumerRoot);
    // 0: the fixture skill declares no metadata.expects, so no required expectation can be unmet.
    assert.equal(result.status, 0, `expected exit 0:\nstdout:${result.stdout}\nstderr:${result.stderr}`);
    assert.doesNotMatch(result.stdout, /could not be parsed|could not be read/);
  });
});
