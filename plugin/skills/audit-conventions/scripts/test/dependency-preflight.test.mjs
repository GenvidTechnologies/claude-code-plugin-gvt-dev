import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  checkPluginDependencies,
  checkLockfileSync,
  formatPreflightFailure,
} from '../lib/dependency-preflight.mjs';

// Unscoped synthetic fixture names only — a CI grep forbids the real leaf
// package's scope from appearing in this repo's non-.md code files.
const DEP = 'gvt-preflight-fixture-dep';
const TRANSITIVE = 'gvt-preflight-fixture-transitive';

async function withPluginRoot(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'gvt-dep-preflight-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeJson(path, obj) {
  await fs.writeFile(path, JSON.stringify(obj, null, 2));
}

async function writeManifest(root, dependencies) {
  await writeJson(join(root, 'package.json'), {
    name: 'fixture-plugin',
    private: true,
    dependencies,
  });
}

async function writeLockfile(root, { rootDependencies, packages }) {
  await writeJson(join(root, 'package-lock.json'), {
    name: 'fixture-plugin',
    lockfileVersion: 3,
    packages: {
      '': { name: 'fixture-plugin', dependencies: rootDependencies },
      ...packages,
    },
  });
}

// Writes a fixture package under <root>/node_modules/<name>. `missingEntry`
// omits the entry file entirely (package.json points at a file that isn't
// there); `emptyEntry` writes a zero-byte entry file (imports cleanly with
// no exports).
async function writeFixturePackage(root, name, { version = '1.0.0', missingEntry = false, emptyEntry = false } = {}) {
  const pkgDir = join(root, 'node_modules', name);
  await fs.mkdir(pkgDir, { recursive: true });
  await writeJson(join(pkgDir, 'package.json'), {
    name,
    version,
    type: 'module',
    main: './index.mjs',
    exports: './index.mjs',
  });
  if (!missingEntry) {
    const content = emptyEntry ? '' : 'export const value = 1;\n';
    await fs.writeFile(join(pkgDir, 'index.mjs'), content);
  }
}

// Test-only importer: resolves a bare specifier against <root>/node_modules
// instead of this test file's own location, since a dynamic import(spec)
// inside lib/ would otherwise resolve relative to lib/, not to the fixture
// tree. Mirrors real Node module resolution closely enough to exercise both
// "package.json missing" (absent) and "entry file missing" (unusable)
// naturally, via a real dynamic import() of the resolved entry file.
function makeFixtureImporter(root) {
  return async (spec) => {
    const pkgDir = join(root, 'node_modules', spec);
    const pkgJsonRaw = await fs.readFile(join(pkgDir, 'package.json'), 'utf8').catch(() => {
      throw new Error(`Cannot find package '${spec}' imported from fixture root`);
    });
    const pkgJson = JSON.parse(pkgJsonRaw);
    const entryRel = pkgJson.exports || pkgJson.main || './index.mjs';
    const entryPath = join(pkgDir, entryRel);
    return import(pathToFileURL(entryPath).href);
  };
}

test('checkPluginDependencies: ok — declared dep and a transitive both import/match', async () => {
  await withPluginRoot(async (root) => {
    await writeManifest(root, { [DEP]: '1.0.0' });
    await writeLockfile(root, {
      rootDependencies: { [DEP]: '1.0.0' },
      packages: {
        [`node_modules/${DEP}`]: { version: '1.0.0' },
        [`node_modules/${TRANSITIVE}`]: { version: '2.0.0' },
      },
    });
    await writeFixturePackage(root, DEP, { version: '1.0.0' });
    await writeFixturePackage(root, TRANSITIVE, { version: '2.0.0' });

    const verdict = await checkPluginDependencies({ pluginRoot: root, importer: makeFixtureImporter(root) });
    assert.deepEqual(verdict, { ok: true, verdict: 'ok', dependencies: [DEP] });
  });
});

test('checkPluginDependencies: no-manifest — no package.json at all', async () => {
  await withPluginRoot(async (root) => {
    const verdict = await checkPluginDependencies({ pluginRoot: root, importer: makeFixtureImporter(root) });
    assert.equal(verdict.ok, true);
    assert.equal(verdict.verdict, 'no-manifest');
  });
});

test('checkPluginDependencies: no-manifest — package.json present but no/empty dependencies', async () => {
  await withPluginRoot(async (root) => {
    await writeManifest(root, {});
    const verdict = await checkPluginDependencies({ pluginRoot: root, importer: makeFixtureImporter(root) });
    assert.equal(verdict.ok, true);
    assert.equal(verdict.verdict, 'no-manifest');
  });
});

test('checkPluginDependencies: no-lockfile — dependencies declared, package-lock.json missing', async () => {
  await withPluginRoot(async (root) => {
    await writeManifest(root, { [DEP]: '1.0.0' });
    const verdict = await checkPluginDependencies({ pluginRoot: root, importer: makeFixtureImporter(root) });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.verdict, 'no-lockfile');
  });
});

test('checkPluginDependencies: lockfile-drift — manifest deps disagree with lockfile root entry', async () => {
  await withPluginRoot(async (root) => {
    await writeManifest(root, { [DEP]: '1.0.0' });
    await writeLockfile(root, {
      rootDependencies: { [DEP]: '1.1.0' },
      packages: { [`node_modules/${DEP}`]: { version: '1.1.0' } },
    });
    const verdict = await checkPluginDependencies({ pluginRoot: root, importer: makeFixtureImporter(root) });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.verdict, 'lockfile-drift');
  });
});

test('checkPluginDependencies: absent — import fails, node_modules/<name> missing entirely', async () => {
  await withPluginRoot(async (root) => {
    await writeManifest(root, { [DEP]: '1.0.0' });
    await writeLockfile(root, {
      rootDependencies: { [DEP]: '1.0.0' },
      packages: { [`node_modules/${DEP}`]: { version: '1.0.0' } },
    });
    // No writeFixturePackage call: node_modules/<DEP> never created.
    const verdict = await checkPluginDependencies({ pluginRoot: root, importer: makeFixtureImporter(root) });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.verdict, 'absent');
    assert.equal(verdict.dependency, DEP);
  });
});

test('checkPluginDependencies: unusable — dir present, entry file missing', async () => {
  await withPluginRoot(async (root) => {
    await writeManifest(root, { [DEP]: '1.0.0' });
    await writeLockfile(root, {
      rootDependencies: { [DEP]: '1.0.0' },
      packages: { [`node_modules/${DEP}`]: { version: '1.0.0' } },
    });
    await writeFixturePackage(root, DEP, { version: '1.0.0', missingEntry: true });
    const verdict = await checkPluginDependencies({ pluginRoot: root, importer: makeFixtureImporter(root) });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.verdict, 'unusable');
    assert.equal(verdict.dependency, DEP);
  });
});

test('checkPluginDependencies: unusable — import succeeds but namespace is empty (zero-byte entry)', async () => {
  await withPluginRoot(async (root) => {
    await writeManifest(root, { [DEP]: '1.0.0' });
    await writeLockfile(root, {
      rootDependencies: { [DEP]: '1.0.0' },
      packages: { [`node_modules/${DEP}`]: { version: '1.0.0' } },
    });
    await writeFixturePackage(root, DEP, { version: '1.0.0', emptyEntry: true });
    const verdict = await checkPluginDependencies({ pluginRoot: root, importer: makeFixtureImporter(root) });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.verdict, 'unusable');
    assert.equal(verdict.dependency, DEP);
    assert.equal(verdict.error, undefined); // no thrown error in this case
  });
});

test('checkPluginDependencies: tree-incomplete — a transitive lockfile entry has no installed package.json', async () => {
  await withPluginRoot(async (root) => {
    await writeManifest(root, { [DEP]: '1.0.0' });
    await writeLockfile(root, {
      rootDependencies: { [DEP]: '1.0.0' },
      packages: {
        [`node_modules/${DEP}`]: { version: '1.0.0' },
        [`node_modules/${TRANSITIVE}`]: { version: '2.0.0' },
      },
    });
    await writeFixturePackage(root, DEP, { version: '1.0.0' });
    // TRANSITIVE is declared in the lockfile but never installed on disk.
    const verdict = await checkPluginDependencies({ pluginRoot: root, importer: makeFixtureImporter(root) });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.verdict, 'tree-incomplete');
    assert.equal(verdict.dependency, TRANSITIVE);
  });
});

test('checkPluginDependencies: version-mismatch — installed version differs from lockfile-pinned version', async () => {
  await withPluginRoot(async (root) => {
    await writeManifest(root, { [DEP]: '1.0.0' });
    await writeLockfile(root, {
      rootDependencies: { [DEP]: '1.0.0' },
      packages: { [`node_modules/${DEP}`]: { version: '9.9.9' } },
    });
    // Installed on disk at 1.0.0, but the lockfile pins 9.9.9.
    await writeFixturePackage(root, DEP, { version: '1.0.0' });
    const verdict = await checkPluginDependencies({ pluginRoot: root, importer: makeFixtureImporter(root) });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.verdict, 'version-mismatch');
    assert.equal(verdict.dependency, DEP);
    assert.equal(verdict.expected, '9.9.9');
    assert.equal(verdict.installed, '1.0.0');
  });
});

test('checkLockfileSync: pure check agrees with the async no-manifest/no-lockfile/lockfile-drift verdicts', () => {
  assert.deepEqual(checkLockfileSync({}, null), { ok: true, verdict: 'no-manifest' });
  assert.deepEqual(checkLockfileSync({ dependencies: { [DEP]: '1.0.0' } }, null), {
    ok: false,
    verdict: 'no-lockfile',
    dependencies: { [DEP]: '1.0.0' },
  });
  const drift = checkLockfileSync(
    { dependencies: { [DEP]: '1.0.0' } },
    { packages: { '': { dependencies: { [DEP]: '2.0.0' } } } },
  );
  assert.equal(drift.ok, false);
  assert.equal(drift.verdict, 'lockfile-drift');
  const agree = checkLockfileSync(
    { dependencies: { [DEP]: '1.0.0' } },
    { packages: { '': { dependencies: { [DEP]: '1.0.0' } } } },
  );
  assert.deepEqual(agree, { ok: true, verdict: 'ok', dependencies: { [DEP]: '1.0.0' } });
});

test('formatPreflightFailure: absent — names the dependency, no ERR_MODULE_NOT_FOUND, no stack lines', () => {
  const message = formatPreflightFailure({
    ok: false,
    verdict: 'absent',
    dependency: DEP,
    version: '1.0.0',
    error: "Cannot find package 'gvt-preflight-fixture-dep' imported from /some/path",
  });
  assert.match(message, new RegExp(DEP));
  assert.doesNotMatch(message, /ERR_MODULE_NOT_FOUND/);
  assert.doesNotMatch(message, /^\s+at /m);
  assert.match(message, /1\.0\.0/);
  assert.match(message, new RegExp(process.version.replace(/\./g, '\\.')));
});

test('formatPreflightFailure: unusable — names the dependency, no ERR_MODULE_NOT_FOUND, no stack lines', () => {
  const message = formatPreflightFailure({
    ok: false,
    verdict: 'unusable',
    dependency: DEP,
    version: '1.0.0',
    error: 'Error [ERR_MODULE_NOT_FOUND]: Cannot find module\n    at Object..js (node:internal/x:1:1)',
  });
  assert.match(message, new RegExp(DEP));
  assert.doesNotMatch(message, /ERR_MODULE_NOT_FOUND/);
  assert.doesNotMatch(message, /^\s+at /m);
});

test('formatPreflightFailure: no-lockfile — explains the host skips the install without a lockfile', () => {
  const message = formatPreflightFailure({ ok: false, verdict: 'no-lockfile' });
  assert.match(message, /npm ci/);
  assert.match(message, /skipped/);
});

test('formatPreflightFailure: ok verdict -> empty string', () => {
  assert.equal(formatPreflightFailure({ ok: true, verdict: 'ok' }), '');
});
