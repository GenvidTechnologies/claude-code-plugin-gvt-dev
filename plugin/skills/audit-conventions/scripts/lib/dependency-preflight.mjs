// Preflight check for the plugin's npm dependencies, run by audit.mjs's
// bootstrap BEFORE it dynamically imports the rest of the audit body
// (issue #477 / #478). ESM links static imports before any code runs, so a
// missing/broken dependency would otherwise surface as a raw
// `ERR_MODULE_NOT_FOUND` stack and exit 1 — the same exit code the published
// contract reserves for "required expectation unmet". This module lets the
// bootstrap detect that case up front and print a diagnosable message
// instead.
//
// Claude Code installs a plugin's declared dependencies with
// `npm ci --ignore-scripts` into `<pluginRoot>/node_modules`, but only when
// a lockfile is present; the install has a 60s timeout that can leave a
// PARTIAL tree, and a failed install never blocks the plugin from loading.
// So "the dependency isn't there" has several distinguishable causes, and
// the verdict below names which one applies.
//
// Deliberately node:-built-ins-only, no imports from sibling lib/ modules:
// this is the fallback that must still work when the thing it's checking
// for (a leaf npm dependency other lib/ modules may eventually depend on)
// is exactly what's missing.
//
// Check order (see checkPluginDependencies): manifest presence/non-empty
// dependencies -> lockfile presence -> manifest/lockfile drift -> per
// -dependency import -> full lockfile tree (transitives) / version match.
// Each step only runs once the previous one has nothing more specific to
// report, so the verdict returned is always the earliest, most actionable
// cause.

import { promises as fs } from 'node:fs';
import { join } from 'node:path';

const PACKAGE_JSON = 'package.json';
const LOCKFILE = 'package-lock.json';
const NODE_MODULES = 'node_modules';
const MIN_NODE_MAJOR = 22;

// Reads and JSON.parses a file, returning null when it doesn't exist.
// Parse errors and other IO errors propagate — a present-but-corrupt
// manifest/lockfile is not something this module should silently paper
// over.
async function readJsonIfExists(path) {
  try {
    const raw = await fs.readFile(path, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

async function dirExists(path) {
  try {
    const stat = await fs.stat(path);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

// Flat string-map equality (dependency name -> semver range). Good enough
// for comparing manifest `dependencies` against a lockfile root entry's
// `dependencies` — both are flat objects with string values.
function stringMapsEqual(a, b) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => a[key] === b[key]);
}

// Strips a `[ERR_XXX_YYY]` / `ERR_XXX_YYY:` style Node error-code prefix
// from a message, and returns only the first line (never a stack).
function firstLineWithoutErrorCode(message) {
  const line = String(message).split('\n')[0];
  return line.replace(/\[?ERR_[A-Z_]+\]?:?\s*/g, '').trim();
}

function firstErrorLine(err) {
  const message = err && err.message != null ? err.message : err;
  return firstLineWithoutErrorCode(message);
}

function lockedEntryFor(lockfile, name) {
  const packages = (lockfile && lockfile.packages) || {};
  return packages[`${NODE_MODULES}/${name}`] || null;
}

// Pure, synchronous check of manifest `dependencies` against the lockfile's
// root entry (`packages[""].dependencies`). Does no filesystem/import work
// of its own beyond what the caller already read, so it's reusable by a
// test that just wants to assert "this repo's real plugin/package.json and
// plugin/package-lock.json agree" without installing anything.
//
// Returns one of:
//   { ok: true,  verdict: 'no-manifest' }    -- no dependencies declared
//   { ok: false, verdict: 'no-lockfile' }    -- deps declared, no lockfile
//   { ok: false, verdict: 'lockfile-drift' } -- deps declared, disagree with lockfile
//   { ok: true,  verdict: 'ok' }             -- deps declared and agree with lockfile
//     (this is NOT the final verdict for checkPluginDependencies — it only
//     means "nothing to report yet"; the caller still needs to check that
//     each dependency actually imports and that the installed tree matches)
export function checkLockfileSync(manifest, lockfile) {
  const dependencies = (manifest && manifest.dependencies) || {};
  if (Object.keys(dependencies).length === 0) {
    return { ok: true, verdict: 'no-manifest' };
  }
  if (!lockfile) {
    return { ok: false, verdict: 'no-lockfile', dependencies };
  }
  const rootEntry = (lockfile.packages && lockfile.packages['']) || {};
  const lockedDependencies = rootEntry.dependencies || {};
  if (!stringMapsEqual(dependencies, lockedDependencies)) {
    return {
      ok: false,
      verdict: 'lockfile-drift',
      manifestDependencies: dependencies,
      lockfileDependencies: lockedDependencies,
    };
  }
  return { ok: true, verdict: 'ok', dependencies };
}

// Tries to import a single declared dependency and classifies the failure.
//   - import() throws, node_modules/<name> absent -> 'absent'
//   - import() throws, node_modules/<name> present -> 'unusable' (e.g. the
//     package.json exists but the entry file it points at doesn't)
//   - import() succeeds but the returned namespace has no exported keys
//     -> 'unusable' (a zero-byte entry file imports cleanly with 0 keys)
//   - import() succeeds with a non-empty namespace -> ok
async function checkDependencyImport(name, pluginRoot, importer, lockedVersion) {
  try {
    const namespace = await importer(name);
    const keys = namespace && typeof namespace === 'object' ? Object.keys(namespace) : [];
    if (keys.length === 0) {
      return {
        ok: false,
        verdict: 'unusable',
        dependency: name,
        version: lockedVersion,
        reason: `${name} imported successfully but its module namespace has no exports`,
      };
    }
    return { ok: true };
  } catch (err) {
    const present = await dirExists(join(pluginRoot, NODE_MODULES, name));
    return {
      ok: false,
      verdict: present ? 'unusable' : 'absent',
      dependency: name,
      version: lockedVersion,
      error: firstErrorLine(err),
    };
  }
}

// Walks the full lockfile `packages` map (which includes transitives, not
// just the manifest's direct dependencies) and confirms every non-optional
// entry is actually installed at the pinned version. This runs AFTER the
// per-dependency import check above, because a direct dependency can import
// fine on its own while a transitive it needs at runtime is still missing
// or mismatched (npm's flattened node_modules layout).
async function checkLockfileTree(pluginRoot, lockfile) {
  const packages = (lockfile && lockfile.packages) || {};
  for (const [key, entry] of Object.entries(packages)) {
    if (key === '') continue;
    if (!key.startsWith(`${NODE_MODULES}/`)) continue;
    if (entry && (entry.dev || entry.optional)) continue;

    const name = key.slice(key.lastIndexOf(`${NODE_MODULES}/`) + NODE_MODULES.length + 1);
    const installed = await readJsonIfExists(join(pluginRoot, key, PACKAGE_JSON));
    if (!installed) {
      return {
        ok: false,
        verdict: 'tree-incomplete',
        dependency: name,
        version: entry && entry.version,
        path: key,
      };
    }
    if (entry && entry.version && installed.version !== entry.version) {
      return {
        ok: false,
        verdict: 'version-mismatch',
        dependency: name,
        expected: entry.version,
        installed: installed.version,
      };
    }
  }
  return { ok: true };
}

// Checks that every dependency the plugin manifest declares is actually
// usable. `importer` is injected so tests can resolve bare specifiers
// against a temp fixture tree instead of this file's own location — a
// dynamic `import(spec)` called from inside lib/ resolves relative to
// lib/, not to an arbitrary `pluginRoot`.
//
// The default importer (used when the bootstrap doesn't override it) is a
// plain `(spec) => import(spec)`. That's correct for a real plugin root
// because Node's bare-specifier resolution walks UP from the importing
// file's directory looking for `node_modules`: the bootstrap lives at
// `<pluginRoot>/skills/audit-conventions/scripts/audit.mjs`, so a plain
// `import(name)` from there walks scripts/ -> audit-conventions/ ->
// skills/ -> <pluginRoot>/node_modules and finds it, with no need to know
// `pluginRoot` in advance.
export async function checkPluginDependencies({ pluginRoot, importer = (spec) => import(spec) }) {
  const manifest = await readJsonIfExists(join(pluginRoot, PACKAGE_JSON));
  const lockfile = await readJsonIfExists(join(pluginRoot, LOCKFILE));

  const lockCheck = checkLockfileSync(manifest, lockfile);
  if (lockCheck.verdict === 'no-manifest' || !lockCheck.ok) {
    return lockCheck;
  }

  const dependencies = manifest.dependencies || {};
  for (const name of Object.keys(dependencies)) {
    const lockedVersion = (lockedEntryFor(lockfile, name) || {}).version;
    const importResult = await checkDependencyImport(name, pluginRoot, importer, lockedVersion);
    if (!importResult.ok) return importResult;
  }

  const treeCheck = await checkLockfileTree(pluginRoot, lockfile);
  if (!treeCheck.ok) return treeCheck;

  return { ok: true, verdict: 'ok', dependencies: Object.keys(dependencies) };
}

const FIX_HINT =
  'Fix: run `claude plugin update gvt-dev@gvt-plugins` to reinstall (or, from a source checkout, `npm ci --prefix plugin`).';
const INSTALL_SKIPPED_CAUSE =
  "Likely cause: the plugin's dependency install did not complete or was skipped — Claude Code runs `npm ci` at plugin install, update, and session start, and does not block the plugin when it fails.";

// Renders a preflight failure verdict (as returned by checkPluginDependencies)
// into a human-readable message for stderr. Never includes a stack trace or
// the literal `ERR_MODULE_NOT_FOUND` string — checkDependencyImport already
// strips Node's error-code prefix before it reaches here.
export function formatPreflightFailure(verdict) {
  if (!verdict || verdict.ok) return '';

  const lines = [`gvt-dev plugin dependency check failed: ${verdict.verdict}.`];
  const pinned = (name, version) => (version ? `"${name}" (pinned to ${version} in package-lock.json)` : `"${name}"`);

  switch (verdict.verdict) {
    case 'no-lockfile':
      lines.push(
        "The plugin manifest (package.json) declares dependencies, but package-lock.json is missing, so Claude Code's npm ci install step is skipped for this plugin entirely.",
      );
      break;
    case 'lockfile-drift':
      lines.push(
        "The plugin manifest's dependencies do not match the versions pinned in package-lock.json, so `npm ci` would not install the declared set.",
      );
      break;
    case 'absent':
      lines.push(`Dependency ${pinned(verdict.dependency, verdict.version)} could not be imported, and its node_modules directory is missing.`);
      lines.push(INSTALL_SKIPPED_CAUSE);
      break;
    case 'unusable':
      lines.push(`Dependency ${pinned(verdict.dependency, verdict.version)} is present on disk but could not be loaded.`);
      lines.push(
        "Likely cause: a partial install — Claude Code's npm ci has a 60s timeout and can leave a partial dependency tree, and does not block the plugin when the install fails.",
      );
      break;
    case 'tree-incomplete':
      lines.push(`A dependency required by package-lock.json, ${pinned(verdict.dependency, verdict.version)}, is missing from node_modules.`);
      lines.push(INSTALL_SKIPPED_CAUSE);
      break;
    case 'version-mismatch':
      lines.push(
        `Dependency "${verdict.dependency}" is installed at version ${verdict.installed}, but package-lock.json pins ${verdict.expected}.`,
      );
      lines.push('Likely cause: an interrupted or stale install left a mismatched dependency tree.');
      break;
    default:
      lines.push('Unexpected preflight failure.');
  }

  if (verdict.error) {
    // Defensively re-normalize even though checkDependencyImport already
    // stripped the error down to a single, code-free line — this keeps the
    // "no stack, no ERR_MODULE_NOT_FOUND" guarantee true regardless of what
    // produced the verdict.
    lines.push(`Underlying error: ${firstLineWithoutErrorCode(verdict.error)}`);
  }

  lines.push(FIX_HINT);
  lines.push(`Node ${process.version} (the plugin's dependencies require Node >= ${MIN_NODE_MAJOR}).`);

  return lines.join('\n');
}
