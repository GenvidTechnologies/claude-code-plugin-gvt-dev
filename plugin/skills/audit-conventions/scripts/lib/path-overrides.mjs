// Resolves `.gvt-agent.json`'s optional `paths` object (CONVENTIONS.md:82-83)
// against declared expectation paths.
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

export function resolveDocsRoot(paths) {
  const override = resolveExpectationPath(paths, 'docs/TOC.md');
  if (override === 'docs/TOC.md') {
    return { root: 'docs', unrepresentable: false };
  }

  const slashAt = override.lastIndexOf('/');
  const root = slashAt === -1 ? '' : override.slice(0, slashAt);
  if (root === '' || root === '.') {
    // A repo-root override (e.g. "docs/TOC.md": "INDEX.md") would make a
    // directory walk recurse the entire repo — keep the safe default and let
    // the caller report the problem instead.
    return { root: 'docs', unrepresentable: true };
  }
  return { root, unrepresentable: false };
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
