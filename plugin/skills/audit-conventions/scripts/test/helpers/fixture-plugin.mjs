// Shared fixture helper for tests that run the REAL audit.mjs against a
// throwaway plugin root. withFixture copies the real audit-conventions scripts
// (minus their test/ folder) into <tmp>/plugin, with the real package.json and a
// link to the real plugin/node_modules so `#audit-core` resolves, and makes an
// empty <tmp>/consumer repo OUTSIDE that plugin root. writeSkill adds a fixture
// skill with arbitrary frontmatter to the throwaway plugin root; spawnAudit runs
// the copied audit.mjs from a chosen working directory.

import { mkdtemp, rm, mkdir, copyFile, writeFile, symlink, cp } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
// helpers/ sits in scripts/test/, so scripts/ is two levels up.
const SCRIPTS_DIR = join(__dirname, '..', '..');
const REAL_PLUGIN_ROOT = join(SCRIPTS_DIR, '..', '..', '..');
const TMP = realpathSync.native(tmpdir());

// Builds <tmp>/plugin (a plugin root) and <tmp>/consumer (the audited repo),
// calls fn(pluginRoot, consumerRoot), and removes both. `prefix` names the
// temp folder.
export async function withFixture(fn, prefix = 'gvt-load-diag-wiring-') {
  const base = await mkdtemp(join(TMP, prefix));
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

// Writes <pluginRoot>/skills/<name>/SKILL.md with the given frontmatter text.
export async function writeSkill(pluginRoot, name, frontmatter) {
  const dir = join(pluginRoot, 'skills', name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'SKILL.md'), `---\n${frontmatter}\n---\n\nBody.\n`);
}

export function spawnAudit(pluginRoot, consumerRoot) {
  const audit = join(pluginRoot, 'skills', 'audit-conventions', 'scripts', 'audit.mjs');
  return spawnSync(process.execPath, [audit], { cwd: consumerRoot, encoding: 'utf8' });
}
