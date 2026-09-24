import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { checkLockfileSync } from '../lib/dependency-preflight.mjs';

// Real-tree check, deliberately not fixture-based: reads THIS repo's own
// plugin/package.json and plugin/package-lock.json and confirms they agree,
// so a manifest edit that forgets to regenerate the lockfile (or vice versa)
// fails the suite instead of only surfacing later as a live 'lockfile-drift'
// preflight verdict. Read-only — no install, no network.
//
// Deliberately does not spell out the real dependency's scoped npm-org name
// anywhere in this file: the leak-guard workflow forbids that org token in
// non-.md tracked files (plugin/package.json and plugin/package-lock.json
// are the only exemptions), so this test reads both the manifest and
// lockfile off disk rather than hardcoding any name from them.
const scriptsDir = dirname(dirname(fileURLToPath(import.meta.url)));
const pluginRoot = join(scriptsDir, '..', '..', '..');

async function readJson(path) {
  return JSON.parse(await fs.readFile(path, 'utf8'));
}

test('dependency manifest/lockfile sync: this repo\'s real plugin/package.json and plugin/package-lock.json agree', async () => {
  const manifest = await readJson(join(pluginRoot, 'package.json'));
  const lockfile = await readJson(join(pluginRoot, 'package-lock.json'));

  assert.ok(Object.keys(manifest.dependencies || {}).length > 0, 'expected the real manifest to declare at least one dependency');

  const verdict = checkLockfileSync(manifest, lockfile);
  assert.equal(verdict.ok, true, `expected manifest and lockfile to agree, got verdict: ${verdict.verdict}`);
  assert.equal(verdict.verdict, 'ok');
  assert.deepEqual(verdict.dependencies, manifest.dependencies);
});
