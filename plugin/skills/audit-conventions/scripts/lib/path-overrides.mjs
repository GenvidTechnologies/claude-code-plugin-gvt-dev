// Resolves `.gvt-agent.json`'s optional `paths` object (CONVENTIONS.md, the
// "**`paths`** (optional object)" entry) against declared expectation paths.
//
// `paths` has two distinct uses, told apart by key name:
//   - Convention-file overrides: key is a declared expectation path (e.g.
//     `docs/TOC.md`, `docs/decisions/`), value is where it actually lives.
//   - Reserved keys (RESERVED_PATH_KEYS): NOT convention-file overrides —
//     `plugin_root` (consumed by release-plugin / reconcile-mcp-pin) and
//     `c3project` (legacy genvid-construct3 marker, see lib/migrate.mjs
//     hasC3Markers). Never treated as an override target or flagged as
//     unrecognized.
//
// resolveExpectationPath({'docs/TOC.md': 'wiki/index.md'}, 'docs/TOC.md')
//   -> 'wiki/index.md'
// resolveExpectationPath({'docs/TOC.md': 'wiki/index.md'}, 'CLAUDE.md')
//   -> 'CLAUDE.md'                              (miss — unchanged)
// resolveExpectationPath({plugin_root: 'plugin'}, 'plugin_root')
//   -> 'plugin_root'                            (reserved key — never an override)
//
// resolveDocsRoot derives the docs-tier root (used by directory-walking
// scanners) from a `docs/TOC.md` override, rather than accepting a second,
// separately-declared root key (ADR-0022 decision 1: one directory, one name).
//
// overrideFindings reports `paths` entries that don't correspond to anything
// the audit reads: a key that is neither reserved nor a currently-declared
// expectation path, or an override value that's empty/unusable. This module
// is pure — no fs reads, no writes; callers pass in `declaredPaths` (the set
// of expectation paths gathered from installed components' metadata.expects).

export const RESERVED_PATH_KEYS = ['plugin_root', 'c3project'];

export function resolveExpectationPath(paths, declaredPath) {
  if (!paths || typeof paths !== 'object') return declaredPath;
  if (RESERVED_PATH_KEYS.includes(declaredPath)) return declaredPath;
  if (!(declaredPath in paths)) return declaredPath;
  return paths[declaredPath];
}

// The wiki-derived default: where a declared `docs/...` path lives when the
// repo declares no override. `docs/TOC.md` derives `<wikiDir>/index.md`; any
// other `docs/<rest>` derives `<wikiDir>/<rest>` (a directory keeps its
// trailing slash). Every other path is unchanged. Resolution never touches the
// file system.
//
// effectiveWikiDir({wiki: {wikiDir: 'kb/'}})        -> 'kb'
// effectiveWikiDir({})                              -> 'wiki'
// wikiDerivedDefault('docs/TOC.md', 'wiki')         -> 'wiki/index.md'
// wikiDerivedDefault('docs/decisions/', 'wiki')     -> 'wiki/decisions/'
// wikiDerivedDefault('CLAUDE.md', 'wiki')           -> 'CLAUDE.md'
// resolveDeclaredPath({}, 'docs/TOC.md')
//   -> { path: 'wiki/index.md', from: 'wiki-default' }

export const DEFAULT_WIKI_DIR = 'wiki';

export function effectiveWikiDir(config) {
  const raw = config?.wiki?.wikiDir;
  if (typeof raw !== 'string') return DEFAULT_WIKI_DIR;
  const dir = raw.trim().replace(/[\\/]$/, '');
  return dir === '' ? DEFAULT_WIKI_DIR : dir;
}

export function wikiDerivedDefault(declaredPath, wikiDir) {
  if (typeof declaredPath !== 'string') return declaredPath;
  if (declaredPath === 'docs/TOC.md') return `${wikiDir}/index.md`;
  if (declaredPath.startsWith('docs/') && declaredPath.length > 'docs/'.length) {
    return `${wikiDir}/${declaredPath.slice('docs/'.length)}`;
  }
  return declaredPath;
}

export function resolveDeclaredPath(config, declaredPath, { prefer } = {}) {
  const paths = config?.paths;
  const hasOverride =
    paths !== null &&
    typeof paths === 'object' &&
    !RESERVED_PATH_KEYS.includes(declaredPath) &&
    declaredPath in paths;
  if (hasOverride) return { path: resolveExpectationPath(paths, declaredPath), from: 'paths' };

  // A `prefer` entry runs its own ordered lookup elsewhere and never takes the
  // wiki default.
  if (prefer !== undefined) return { path: declaredPath, from: 'declared' };

  const derived = wikiDerivedDefault(declaredPath, effectiveWikiDir(config));
  return { path: derived, from: derived !== declaredPath ? 'wiki-default' : 'declared' };
}

export function resolveDocsRoot(paths) {
  const override = resolveExpectationPath(paths, 'docs/TOC.md');
  if (override === 'docs/TOC.md') {
    return { root: 'docs', indexFile: 'TOC.md', unrepresentable: false };
  }

  const slashAt = override.lastIndexOf('/');
  const root = slashAt === -1 ? '' : override.slice(0, slashAt);
  const indexFile = override.slice(slashAt + 1);
  if (root === '' || root === '.') {
    // A repo-root override (e.g. "docs/TOC.md": "INDEX.md") would make a
    // directory walk recurse the entire repo — keep the safe default and let
    // the caller report the problem instead. The root fell back to "docs", so
    // the filename falls back with it — pairing it with the override's own
    // basename would describe a file ("docs/INDEX.md") that doesn't exist.
    return { root: 'docs', indexFile: 'TOC.md', unrepresentable: true };
  }
  return { root, indexFile, unrepresentable: false };
}

export function overrideFindings(paths, declaredPaths) {
  if (!paths || typeof paths !== 'object') return [];

  const declared = new Set(declaredPaths ?? []);
  const findings = [];

  for (const [key, value] of Object.entries(paths)) {
    if (RESERVED_PATH_KEYS.includes(key)) continue;

    if (!declared.has(key)) {
      findings.push({
        kind: 'path-override',
        ok: false,
        severity: 'warning',
        detail: `paths key '${key}' does not match any declared expectation path — nothing reads this override`,
        key,
      });
      continue;
    }

    if (typeof value !== 'string' || value.trim() === '') {
      findings.push({
        kind: 'path-override',
        ok: false,
        severity: 'warning',
        detail: `paths['${key}'] override value is empty or unusable`,
        key,
      });
    }
  }

  return findings;
}
