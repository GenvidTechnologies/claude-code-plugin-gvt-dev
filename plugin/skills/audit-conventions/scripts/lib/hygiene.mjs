// Pure repo-hygiene scanners for audit-conventions.
//
// Each scanner is `(repoRoot, opts = {}) => findings[]` (async, pure — no fs
// writes). Findings follow the same self-contained shape as audit.mjs's other
// repo-health checks (host-drift, conventions-drift, desc-length): `{ kind,
// ok: false, severity, detail }`, no `component`/`target`/`reason` fields since
// these aren't tied to a component's metadata.expects declaration.
//
// Wired into audit.mjs's validate mode (main()) as info/warning findings.

import { promises as fs } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

import { listMarkdown } from './fs-walk.mjs';

export const DEFAULT_RETIRED_TOKENS = ['genvid:', 'genvid-dev:', 'genvid-c3'];
export const DEFAULT_EXCLUDE_PATHS = ['CHANGELOG.md', 'docs/superpowers/', 'docs/decisions/'];

// Naive: also matches links inside inline code spans (e.g. a doc showing
// `[text](fake.md)` as a Markdown example). Acceptable for an advisory,
// info/warning-only check — false positives are rare in practice and a repo can
// suppress a noisy file via hygiene.excludePaths. A real fix needs a Markdown parser.
const LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;

// ---- shared helpers ---------------------------------------------------------

function isExcluded(relPath, excludePaths) {
  return excludePaths.some((entry) => relPath.startsWith(entry) || relPath.includes(entry));
}

// Candidate file set shared by all three scanners: docs/**.md + repo-root
// CLAUDE.md, minus excludePaths. Repo-relative, forward-slash paths (matches
// listMarkdown's shape). Missing docs/ or CLAUDE.md are handled gracefully by
// listMarkdown / safeReadFile respectively — this helper never throws.
//
// excludePaths is a UNION of the baked-in defaults and any opts.excludePaths
// — the defaults (CHANGELOG.md, docs/superpowers/, docs/decisions/) always
// apply, so a consuming repo customizing this list only needs to name what it
// wants to ADD, not restate the defaults. This differs from retiredTokens
// (below), which replaces-when-provided, since a repo's deny-list is a
// deliberate full override.
async function listCandidateFiles(repoRoot, opts = {}) {
  const excludePaths = [...DEFAULT_EXCLUDE_PATHS, ...(opts.excludePaths ?? [])];
  const files = [...(await listMarkdown(repoRoot, 'docs')), 'CLAUDE.md'];
  return files.filter((f) => !isExcluded(f, excludePaths));
}

async function safeReadFile(path) {
  try {
    return await fs.readFile(path, 'utf8');
  } catch {
    return null;
  }
}

async function pathExists(path) {
  try {
    await fs.stat(path);
    return true;
  } catch {
    return false;
  }
}

// ---- scanRetiredTokens -------------------------------------------------------

export async function scanRetiredTokens(repoRoot, opts = {}) {
  const retiredTokens = opts.retiredTokens ?? DEFAULT_RETIRED_TOKENS;
  const files = await listCandidateFiles(repoRoot, opts);
  const findings = [];

  for (const relPath of files) {
    const content = await safeReadFile(join(repoRoot, relPath));
    if (content == null) continue;

    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      if (line.includes('http')) return; // provenance/issue URLs are correct-as-history
      for (const token of retiredTokens) {
        if (line.includes(token)) {
          findings.push({
            kind: 'retired-token',
            ok: false,
            severity: 'info',
            detail: `${relPath}:${idx + 1} contains retired token '${token}'`,
          });
        }
      }
    });
  }

  return findings;
}

// ---- scanBrokenLinks ---------------------------------------------------------

export async function scanBrokenLinks(repoRoot, opts = {}) {
  const files = await listCandidateFiles(repoRoot, opts);
  const findings = [];

  for (const relPath of files) {
    const content = await safeReadFile(join(repoRoot, relPath));
    if (content == null) continue;

    const lines = content.split('\n');
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      LINK_RE.lastIndex = 0;
      let match;
      while ((match = LINK_RE.exec(line))) {
        const rawTarget = match[1].trim();
        if (!rawTarget) continue;
        if (rawTarget.startsWith('#')) continue; // pure anchor
        if (/^https?:/i.test(rawTarget) || /^mailto:/i.test(rawTarget)) continue; // external

        const strippedTarget = rawTarget.split('#')[0].trim(); // drop trailing #anchor
        if (!strippedTarget) continue; // was e.g. "./file.md#anchor" with nothing left — shouldn't happen, but be safe

        const containingDir = dirname(join(repoRoot, relPath));
        const absTarget = strippedTarget.startsWith('/')
          ? join(repoRoot, strippedTarget.slice(1))
          : resolve(containingDir, strippedTarget);

        // fs.stat (not a file-only check) — directory targets (plugin/skeleton/,
        // examples/, audit-conventions-evals/) are valid and must not be flagged.
        const exists = await pathExists(absTarget);
        if (!exists) {
          findings.push({
            kind: 'broken-link',
            ok: false,
            severity: 'warning',
            detail: `${relPath}:${idx + 1} broken link -> ${rawTarget}`,
          });
        }
      }
    }
  }

  return findings;
}

// ---- scanOrphanedDocs ---------------------------------------------------------

export async function scanOrphanedDocs(repoRoot, opts = {}) {
  const tocContent = await safeReadFile(join(repoRoot, 'docs', 'TOC.md'));
  if (tocContent == null) return []; // no docs/TOC.md — nothing to check against

  const candidates = await listCandidateFiles(repoRoot, opts);
  const docs = candidates.filter((f) => f.startsWith('docs/') && f !== 'docs/TOC.md');

  const findings = [];
  for (const relPath of docs) {
    // docs/TOC.md lives inside docs/ itself, so it commonly links siblings
    // with a bare, docs-relative filename (e.g. `foo.md`) rather than the
    // full repo-relative path (`docs/foo.md`). A doc counts as indexed if
    // EITHER form appears in the TOC text.
    const docsRelPath = relPath.startsWith('docs/') ? relPath.slice('docs/'.length) : relPath;
    if (!tocContent.includes(relPath) && !tocContent.includes(docsRelPath)) {
      findings.push({
        kind: 'orphaned-doc',
        ok: false,
        severity: 'info',
        detail: `${relPath} is not referenced in docs/TOC.md`,
      });
    }
  }

  return findings;
}
