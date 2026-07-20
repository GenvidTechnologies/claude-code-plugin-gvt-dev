// Small git-inspection helpers shared by audit.mjs (and future callers).
// Every helper here degrades gracefully — no git repo, no remote, no upstream
// tracking branch — by returning null rather than throwing, so callers can
// treat "unknown" uniformly instead of wrapping each call in try/catch.

import { spawnSync } from 'node:child_process';

export function gitRemoteUrl(repoRoot) {
  const result = spawnSync('git', ['remote', 'get-url', 'origin'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) return null; // no remote, or not a git repo
  return result.stdout.trim();
}

export function gitDefaultBranch(repoRoot) {
  const result = spawnSync('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) return null; // not a git repo, no origin, or HEAD unset
  const branch = result.stdout.trim();
  if (!branch) return null;
  return branch.replace(/^origin\//, '');
}

// Returns the set of repo-relative, forward-slash paths git tracks (index +
// HEAD), per `git ls-files` — includes staged-but-uncommitted files, so no
// commit/identity is required, just an initialized repo with an index.
// Returns null (not a Set) when not a git repo / git unavailable, same
// graceful-degradation contract as the other helpers here.
export function gitTrackedFiles(repoRoot) {
  const result = spawnSync('git', ['ls-files'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) return null; // not a git repo, or git unavailable
  const paths = result.stdout.split('\n').filter((line) => line.length > 0);
  return new Set(paths);
}
