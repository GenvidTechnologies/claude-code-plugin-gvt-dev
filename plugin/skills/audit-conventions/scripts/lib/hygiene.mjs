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
import { gitTrackedFiles } from './git-info.mjs';

export const DEFAULT_RETIRED_TOKENS = ['genvid:', 'genvid-dev:', 'genvid-c3'];
export const DEFAULT_EXCLUDE_PATHS = ['CHANGELOG.md', 'docs/superpowers/', 'docs/decisions/'];

// Fixed allow-list of repo-root config paths scanRetiredTokens also considers,
// beyond the Markdown candidate set. Repo-relative, forward-slash paths. Not
// scanned by presence alone — see configCandidateFiles below, which
// intersects this list with `git ls-files` (ADR-0014): a per-developer
// .claude/settings.local.json is conventionally untracked and can
// legitimately contain a literal retired-token string (e.g. a permission
// grep-pattern rule), so scanning it by presence would false-positive on
// local junk.
export const RETIRED_TOKEN_CONFIG_CANDIDATES = [
  'package.json',
  '.gvt-agent.json',
  '.claude/settings.json',
  '.claude/settings.local.json',
];

// Inline code spans and fenced code blocks are skipped (see maskInlineCode and
// the inFence tracking in scanBrokenLinks below), so a doc showing
// `[text](fake.md)` as a Markdown example no longer false-positives. Known
// remaining limitation: reference-style links (`[text][ref]`) are not
// resolved — intentionally out of scope (#135).
const LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;

// Blanks out backtick-delimited inline code spans on a single line so LINK_RE
// doesn't match links shown as Markdown examples inside them. Operates
// per-line (deliberately not `[\s\S]` across the whole file) so an unmatched
// backtick run (no closing run on the same line) leaves the line unchanged —
// normal links elsewhere on that line still scan.
function maskInlineCode(line) {
  return line.replace(/(`+)[\s\S]*?\1/g, (span) => ' '.repeat(span.length));
}

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

// Config candidate set for scanRetiredTokens only: RETIRED_TOKEN_CONFIG_CANDIDATES
// intersected with the git-tracked set, minus excludePaths (same union
// semantics as listCandidateFiles). If gitTrackedFiles returns null (not a
// git repo, or git unavailable), the config scan is skipped ([]) — the
// Markdown scan is unaffected. See ADR-0014.
function configCandidateFiles(repoRoot, opts = {}) {
  const excludePaths = [...DEFAULT_EXCLUDE_PATHS, ...(opts.excludePaths ?? [])];
  const tracked = gitTrackedFiles(repoRoot);
  if (tracked == null) return [];
  return RETIRED_TOKEN_CONFIG_CANDIDATES.filter(
    (f) => tracked.has(f) && !isExcluded(f, excludePaths),
  );
}

// ---- scanRetiredTokens -------------------------------------------------------

export async function scanRetiredTokens(repoRoot, opts = {}) {
  const retiredTokens = opts.retiredTokens ?? DEFAULT_RETIRED_TOKENS;
  const files = [
    ...(await listCandidateFiles(repoRoot, opts)),
    ...configCandidateFiles(repoRoot, opts),
  ];
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
    let inFence = false;
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      const trimmed = line.trim();
      if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
        inFence = !inFence;
        continue; // fence delimiter line itself never contains a link to scan
      }
      if (inFence) continue;

      const maskedLine = maskInlineCode(line);
      LINK_RE.lastIndex = 0;
      let match;
      while ((match = LINK_RE.exec(maskedLine))) {
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
