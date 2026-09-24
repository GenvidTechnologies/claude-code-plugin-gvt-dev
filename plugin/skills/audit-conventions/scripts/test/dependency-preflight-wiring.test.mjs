// End-to-end wiring test for the dependency preflight (issue #477/#478):
// spawns the REAL, shipped audit.mjs bootstrap (copied byte-for-byte into a
// throwaway plugin root, never the repo's own plugin/node_modules) against a
// STUB audit-main.mjs that statically imports a synthetic fixture dependency.
// This exercises the actual bootstrap file audit.mjs, not a re-implementation
// of its logic — the dependency-preflight.mjs unit tests already cover
// checkPluginDependencies/formatPreflightFailure directly.
//
// Unscoped synthetic fixture name only — no real leaf package's scope
// appears anywhere in this file.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp, rm, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
// scripts/test/dependency-preflight-wiring.test.mjs -> scripts
const SCRIPTS_DIR = join(__dirname, '..');
const REAL_AUDIT = join(SCRIPTS_DIR, 'audit.mjs');
const REAL_PREFLIGHT_LIB = join(SCRIPTS_DIR, 'lib', 'dependency-preflight.mjs');

const DEP = 'gvt-preflight-fixture-dep';

// Builds a throwaway plugin root at
//   <tmp>/skills/audit-conventions/scripts/{audit.mjs, audit-main.mjs, lib/dependency-preflight.mjs}
// mirroring the real repo layout closely enough that audit.mjs's own
// SCRIPT_DIR -> PLUGIN_ROOT derivation (resolve(SCRIPT_DIR, '..','..','..'))
// lands on <tmp>, so a bare `import('gvt-preflight-fixture-dep')` issued from
// that copied audit.mjs (or from the stub audit-main.mjs alongside it) walks
// scripts/ -> audit-conventions/ -> skills/ -> <tmp>/node_modules, exactly
// like the real bootstrap does against a real plugin root.
async function withTmpPluginRoot(fn) {
  const root = await mkdtemp(join(tmpdir(), 'gvt-preflight-wiring-'));
  try {
    const scriptsDir = join(root, 'skills', 'audit-conventions', 'scripts');
    await mkdir(join(scriptsDir, 'lib'), { recursive: true });
    await copyFile(REAL_AUDIT, join(scriptsDir, 'audit.mjs'));
    await copyFile(REAL_PREFLIGHT_LIB, join(scriptsDir, 'lib', 'dependency-preflight.mjs'));
    await fn(root, scriptsDir);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const SENTINEL = 'PREFLIGHT_WIRING_SENTINEL_OK';

// Stub audit-main.mjs bodies. `withImport: true` statically imports the
// fixture dependency (exercising the "preflight must run before this static
// import" contract); `withImport: false` never references it at all (used
// for the no-manifest case, where node_modules/<DEP> legitimately doesn't
// exist and importing it would fail for a reason unrelated to the preflight).
function stubAuditMainBody({ withImport }) {
  if (withImport) {
    return [`import { marker } from '${DEP}';`, `console.log('${SENTINEL}:' + marker);`, ''].join('\n');
  }
  return [`console.log('${SENTINEL}');`, ''].join('\n');
}

function stubThrowingAuditMainBody() {
  return ["throw new Error('stub audit-main.mjs deliberately throws at load');", ''].join('\n');
}

async function writeStubAuditMain(scriptsDir, body) {
  await writeFile(join(scriptsDir, 'audit-main.mjs'), body);
}

async function writeJson(path, obj) {
  await fs.writeFile(path, JSON.stringify(obj, null, 2));
}

async function writeManifest(root, dependencies) {
  await writeJson(join(root, 'package.json'), { name: 'fixture-plugin', private: true, dependencies });
}

async function writeLockfile(root, rootDependencies, packages) {
  await writeJson(join(root, 'package-lock.json'), {
    name: 'fixture-plugin',
    lockfileVersion: 3,
    packages: { '': { name: 'fixture-plugin', dependencies: rootDependencies }, ...packages },
  });
}

// Writes the fixture package under <root>/node_modules/<DEP>.
// `missingEntry` writes the package.json but omits the entry file it points
// at, producing an "unusable" (present-but-broken) verdict rather than
// "absent".
async function writeFixturePackage(root, { version = '1.0.0', missingEntry = false } = {}) {
  const pkgDir = join(root, 'node_modules', DEP);
  await mkdir(pkgDir, { recursive: true });
  await writeJson(join(pkgDir, 'package.json'), {
    name: DEP,
    version,
    type: 'module',
    main: './index.mjs',
    exports: './index.mjs',
  });
  if (!missingEntry) {
    await fs.writeFile(join(pkgDir, 'index.mjs'), "export const marker = 'ok';\n");
  }
}

function spawnAudit(scriptsDir, root) {
  return spawnSync(process.execPath, [join(scriptsDir, 'audit.mjs')], { cwd: root, encoding: 'utf8' });
}

test('dependency preflight wiring: good tree -> exit 0, stub audit-main.mjs runs and prints the sentinel', async () => {
  await withTmpPluginRoot(async (root, scriptsDir) => {
    await writeStubAuditMain(scriptsDir, stubAuditMainBody({ withImport: true }));
    await writeManifest(root, { [DEP]: '1.0.0' });
    await writeLockfile(root, { [DEP]: '1.0.0' }, { [`node_modules/${DEP}`]: { version: '1.0.0' } });
    await writeFixturePackage(root, { version: '1.0.0' });

    const result = spawnAudit(scriptsDir, root);
    assert.equal(result.status, 0, `expected exit 0:\nstdout:${result.stdout}\nstderr:${result.stderr}`);
    assert.match(result.stdout, new RegExp(SENTINEL));
  });
});

test('dependency preflight wiring: absent dependency -> exit 2, diagnosable stderr, audit-main.mjs never runs', async () => {
  await withTmpPluginRoot(async (root, scriptsDir) => {
    await writeStubAuditMain(scriptsDir, stubAuditMainBody({ withImport: true }));
    await writeManifest(root, { [DEP]: '1.0.0' });
    await writeLockfile(root, { [DEP]: '1.0.0' }, { [`node_modules/${DEP}`]: { version: '1.0.0' } });
    // No writeFixturePackage call: node_modules/<DEP> never created.

    const result = spawnAudit(scriptsDir, root);
    assert.equal(result.status, 2, `expected exit 2:\nstdout:${result.stdout}\nstderr:${result.stderr}`);
    assert.match(result.stderr, new RegExp(DEP), 'stderr should name the missing dependency');
    assert.match(result.stderr, /Likely cause/, 'stderr should explain a likely cause');
    assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND/);
    assert.doesNotMatch(result.stderr, /^\s+at /m);
    assert.doesNotMatch(result.stdout, new RegExp(SENTINEL), 'audit-main.mjs must never load');
  });
});

test('dependency preflight wiring: partial install (entry file missing) -> exit 2, diagnosable stderr, audit-main.mjs never runs', async () => {
  await withTmpPluginRoot(async (root, scriptsDir) => {
    await writeStubAuditMain(scriptsDir, stubAuditMainBody({ withImport: true }));
    await writeManifest(root, { [DEP]: '1.0.0' });
    await writeLockfile(root, { [DEP]: '1.0.0' }, { [`node_modules/${DEP}`]: { version: '1.0.0' } });
    await writeFixturePackage(root, { version: '1.0.0', missingEntry: true });

    const result = spawnAudit(scriptsDir, root);
    assert.equal(result.status, 2, `expected exit 2:\nstdout:${result.stdout}\nstderr:${result.stderr}`);
    assert.match(result.stderr, new RegExp(DEP), 'stderr should name the broken dependency');
    assert.match(result.stderr, /Likely cause/, 'stderr should explain a likely cause');
    assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND/);
    assert.doesNotMatch(result.stderr, /^\s+at /m);
    assert.doesNotMatch(result.stdout, new RegExp(SENTINEL), 'audit-main.mjs must never load');
  });
});

test('dependency preflight wiring: manifest declares deps but package-lock.json is missing -> exit 2, stderr mentions the lockfile', async () => {
  await withTmpPluginRoot(async (root, scriptsDir) => {
    await writeStubAuditMain(scriptsDir, stubAuditMainBody({ withImport: true }));
    await writeManifest(root, { [DEP]: '1.0.0' });
    // No writeLockfile call: package-lock.json never created.

    const result = spawnAudit(scriptsDir, root);
    assert.equal(result.status, 2, `expected exit 2:\nstdout:${result.stdout}\nstderr:${result.stderr}`);
    assert.match(result.stderr, /package-lock\.json/, 'stderr should mention the lockfile');
    assert.doesNotMatch(result.stdout, new RegExp(SENTINEL), 'audit-main.mjs must never load');
  });
});

test('dependency preflight wiring: no manifest at all -> preflight is a no-op, exit 0, sentinel prints', async () => {
  await withTmpPluginRoot(async (root, scriptsDir) => {
    // Stub body deliberately has NO import of the fixture dependency: with no
    // package.json, node_modules/<DEP> legitimately doesn't exist either, and
    // this case is specifically about the preflight not blocking a plugin
    // root that declares no dependencies at all.
    await writeStubAuditMain(scriptsDir, stubAuditMainBody({ withImport: false }));
    // No package.json, no package-lock.json, no node_modules.

    const result = spawnAudit(scriptsDir, root);
    assert.equal(result.status, 0, `expected exit 0:\nstdout:${result.stdout}\nstderr:${result.stderr}`);
    assert.match(result.stdout, new RegExp(SENTINEL));
  });
});

test('dependency preflight wiring: preflight passes, but audit-main.mjs itself throws at load -> exit 2, one line, no stack', async () => {
  await withTmpPluginRoot(async (root, scriptsDir) => {
    await writeStubAuditMain(scriptsDir, stubThrowingAuditMainBody());
    // No package.json: preflight is a no-op (verdict 'no-manifest'), so this
    // exercises the bootstrap's pre-existing try/import/catch around
    // audit-main.mjs itself, downstream of a passing preflight.

    const result = spawnAudit(scriptsDir, root);
    assert.equal(result.status, 2, `expected exit 2:\nstdout:${result.stdout}\nstderr:${result.stderr}`);
    const stderrLines = result.stderr.split('\n').filter((line) => line.trim().length > 0);
    assert.equal(stderrLines.length, 1, `expected exactly one stderr line, got:\n${result.stderr}`);
    assert.doesNotMatch(result.stderr, /^\s+at /m);
    assert.doesNotMatch(result.stdout, new RegExp(SENTINEL));
  });
});
