// Detects drift between .genvid-agent.json `repo.host` and the actual git
// remote. Pure functions — no git/filesystem access; the caller is responsible
// for fetching the remote URL (e.g. `git remote get-url origin`) and the
// configured host, then passing them in. Keeping the logic IO-free makes it
// unit-testable without a real git repo.
//
//   inferHostFromRemote('git@github.com:org/repo.git') -> 'github'
//   detectHostDrift({ configuredHost: 'bitbucket', remoteUrl: 'https://github.com/o/r' })
//     -> { configured: 'bitbucket', inferred: 'github' }

// Substring signatures, matched against both https:// and git@ SSH remote forms
// (both embed the host domain literally).
const HOST_SIGNATURES = [
  { host: 'github', domain: 'github.com' },
  { host: 'bitbucket', domain: 'bitbucket.org' },
];

// Returns the inferred host ('github' | 'bitbucket') for a remote URL, or null
// when the URL is empty or its host isn't one we recognize.
export function inferHostFromRemote(url) {
  if (!url || typeof url !== 'string') return null;
  const lower = url.toLowerCase();
  for (const { host, domain } of HOST_SIGNATURES) {
    if (lower.includes(domain)) return host;
  }
  return null;
}

// Compares the configured repo.host against the host inferred from the remote.
// Returns null when there is nothing to warn about:
//   - configuredHost is absent (CONVENTIONS.md documents repo.host as optional),
//   - the remote host can't be determined (no remote, or an unrecognized host),
//   - the two agree.
// Otherwise returns { configured, inferred } describing the mismatch.
export function detectHostDrift({ configuredHost, remoteUrl }) {
  if (!configuredHost) return null;
  const inferred = inferHostFromRemote(remoteUrl);
  if (!inferred) return null;
  if (inferred === configuredHost) return null;
  return { configured: configuredHost, inferred };
}
