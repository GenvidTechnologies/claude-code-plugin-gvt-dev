// The `<rawDir>/` immutability check behind #150's `lint` mechanical
// checker: the `raw/` tier holds immutable captured source — a file there is
// written once and never edited afterwards — and #150 names the mechanism
// directly: `git log --diff-filter=M -- <rawDir>/`. Any file that command
// names has been modified after its initial commit, which violates the
// tier's contract.
//
// Pure in this skill's sense despite shelling out: the git invocations below
// are read-only queries (`rev-parse`, `log`), never a write, never
// `process.exit`, never console output. Reporting is the CLI's job, same as
// checks.mjs.
//
// Three distinct "could not check" cases share one shape with the real
// result, deliberately: git not installed / not on PATH, the repo not being
// a git repository, and `<rawDir>/` having no git history at all (nothing
// under it has ever been committed, so there is nothing to compare against).
// Returning `[]` for any of these would render as "raw/ is clean", which is
// a different claim — the same ambiguity ADR-0053 and checks.mjs's
// checkOrphanedPages missing-index branch both exist to remove. Each case
// instead returns a single informational finding naming which one applied,
// under the shared kind `raw-immutability-check-skipped` with a `reason`
// field distinguishing the three.
//
// git is resolved as the bare command name `git`, deliberately: unlike
// `tar`/`npm`, Windows ships no System32 `git.exe` a bare lookup could be
// shadowed by, so spawnSync's own PATH search reliably reaches Git for
// Windows' git.exe. This is the same bare-name resolution already used
// elsewhere in this plugin (audit-conventions' git-info.mjs, create-adr's
// renumber-adrs.mjs, audit-conventions' migrate.mjs) with no incident on
// record. `env` is threaded through as an optional override purely so tests
// can simulate "git not on PATH" by pointing PATH at an empty directory,
// without mutating global `process.env`.

import { spawnSync } from 'node:child_process';
import { isAbsolute, resolve, sep } from 'node:path';

// Resolves `rawDir` (as configured, e.g. in .gvt-agent.json) against
// `repoRoot` into the repo-relative, forward-slash directory string git
// wants as a pathspec — refusing every degenerate input that would
// otherwise scope a git query to the whole repository: undefined/empty, an
// absolute path (however it happens to resolve), and any relative path
// (e.g. '.', './', '..') that resolves to `repoRoot` itself or escapes it.
// Mirrors wiki-pages.mjs's safeWikiRootAbs guard exactly, adapted to return
// a relative pathspec string rather than an absolute directory, since a git
// pathspec is what every caller below needs. Returns null on any
// degenerate input.
function safeRawDirRel(repoRoot, rawDir) {
  if (!rawDir) return null;
  if (isAbsolute(rawDir)) return null; // never trust a caller-supplied absolute path

  const repoRootAbs = resolve(repoRoot);
  const abs = resolve(repoRootAbs, rawDir);
  if (abs === repoRootAbs) return null; // '.', '' collapse to the repo root itself

  const escapesRoot = !abs.startsWith(repoRootAbs + sep);
  if (escapesRoot) return null; // e.g. '..' walked above repoRoot

  return abs.slice(repoRootAbs.length + 1).split(sep).join('/');
}

function runGit(repoRoot, args, env) {
  return spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    ...(env ? { env } : {}),
  });
}

function skippedFinding(reason, detail) {
  return {
    kind: 'raw-immutability-check-skipped',
    ok: false,
    severity: 'info',
    reason,
    detail,
  };
}

// Checks `<rawDir>/` for files modified after their initial commit.
//
// Returns `{ kind: 'raw-modified', ok: false, severity: 'warning', page,
// detail }[]` — one per modified file, `page` holding the file's
// repo-relative path (reusing checks.mjs's field name for a finding's
// subject, as unreachable-subtree already does for a non-page path) — or a
// single `raw-immutability-check-skipped` info finding when the check could
// not run at all (see this module's header for the three cases). A
// degenerate `rawDir` yields `[]` silently, matching wiki-pages.mjs's own
// degenerate-input precedent (safety, not reporting, is the concern there).
//
// `options.env`, if given, replaces the environment passed to every git
// invocation — an override for tests, never needed by real callers.
export function checkRawImmutability(repoRoot, rawDir, options = {}) {
  const { env } = options;
  const rawRel = safeRawDirRel(repoRoot, rawDir);
  if (!rawRel) return [];

  const probe = runGit(repoRoot, ['rev-parse', '--is-inside-work-tree'], env);
  if (probe.error && probe.error.code === 'ENOENT') {
    return [
      skippedFinding(
        'git-unavailable',
        `git is not installed, or not on PATH — ${rawDir}/ immutability could not be checked`,
      ),
    ];
  }
  if (probe.status !== 0) {
    return [
      skippedFinding(
        'not-a-git-repo',
        `${repoRoot} is not a git repository — ${rawDir}/ immutability could not be checked`,
      ),
    ];
  }

  const pathspec = `${rawRel}/`;
  const history = runGit(repoRoot, ['log', '--format=%H', '--', pathspec], env);
  if (history.status !== 0 || !history.stdout.trim()) {
    return [
      skippedFinding(
        'no-history',
        `${rawDir}/ has no git history — nothing under it has ever been committed, so immutability could not be checked`,
      ),
    ];
  }

  const modified = runGit(
    repoRoot,
    ['log', '--diff-filter=M', '--name-only', '--format=', '--', pathspec],
    env,
  );
  const files = new Set(
    (modified.stdout || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  );

  return [...files]
    .sort()
    .map((file) => ({
      kind: 'raw-modified',
      ok: false,
      severity: 'warning',
      page: file,
      detail: `${file} was modified after its initial commit — ${rawDir}/ is immutable captured source and must be written once, never edited (git log --diff-filter=M -- ${rawDir}/).`,
    }));
}
