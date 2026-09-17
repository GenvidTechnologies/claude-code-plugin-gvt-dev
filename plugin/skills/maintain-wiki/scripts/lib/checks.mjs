// The substantive checks behind #150's `lint` mechanical checker: dead
// wiki-links, out-of-bundle links, orphaned pages, and unreachable
// subdirectory subtrees — as SKILL.md's `lint` section states them.
//
// Pure in the same sense as this skill's other lib modules: no writes, no
// process.exit, no console output. Reporting is the CLI's job. Every check
// here composes md-links.mjs (link extraction + OKF §6.1 resolution) and
// wiki-pages.mjs (the candidate-page and index-path walk) rather than
// re-implementing either — the only filesystem access this module performs
// directly is reading one already-located page's content, a leaf read, never
// a directory walk of its own.
//
// This module also settles issue #428's open design question, in code, for
// the first time: a page counts as "listed" in an index when a link TARGET
// RESOLVES to that page, never by substring containment of a basename. A
// naive "does the index text contain this page's basename" check would treat
// `query-cache.md` as listed merely because the index links
// `cloudscript-query-cache.md` — a real substring collision, not evidence the
// shorter page is registered anywhere. #428's own proposed wording (match
// the literal link-target marker before resolution) is deliberately NOT
// adopted either: an unresolvable link target is a dead link, not evidence a
// page is unlisted, and folding the two together would contradict the dead
// link check below. Resolve first, then compare resolved paths — that is
// the one rule that is coherent with both checks at once.

import { promises as fs } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { scanPageLinks } from './md-links.mjs';
import { wikiAllMarkdown, wikiIndexPaths, wikiPageCandidates } from './wiki-pages.mjs';

async function safeReadFile(absPath) {
  try {
    return await fs.readFile(absPath, 'utf8');
  } catch {
    return null;
  }
}

// Normalizes `wikiDir` (as configured, e.g. in .gvt-agent.json) to the same
// repo-relative, forward-slash form wiki-pages.mjs's own returned keys use,
// so `indexPaths[normalizedWikiDir]` reliably finds the bundle-root entry
// even when the caller's wikiDir string carries a redundant form (e.g.
// './wiki'). This is plain path arithmetic, not a filesystem walk — it
// mirrors, in miniature, wiki-pages.mjs's own resolution step so this module
// doesn't have to import an unexported helper from it. A degenerate wikiDir
// (undefined, '', an absolute path, one that escapes repoRoot) normalizes to
// something that simply won't be a key of an (already empty) indexPaths
// object — see wiki-pages.mjs's own degenerate-input handling.
function normalizedWikiDir(repoRoot, wikiDir) {
  if (!wikiDir) return wikiDir;
  const rel = relative(resolve(repoRoot), resolve(repoRoot, wikiDir));
  return rel.split('\\').join('/');
}

// The page set scanned for the two link-based checks below: every markdown
// page in the bundle, reserved files included.
//
// The orphan candidate set is deliberately NOT reused here. It subtracts
// `index.md` and `log.md`, because a reserved file is not a concept page and
// therefore cannot be orphaned — a statement about what must be *listed*, not
// about whose links get read. A dead link written into `log.md` is still a
// dead link, and lint is the only check that would ever see it.
async function linkScannedPages(repoRoot, wikiDir) {
  return wikiAllMarkdown(repoRoot, wikiDir);
}

async function linksForPage(repoRoot, wikiDir, pageRelPath) {
  const content = await safeReadFile(join(repoRoot, pageRelPath));
  if (content == null) return [];
  return scanPageLinks(repoRoot, wikiDir, pageRelPath, content);
}

// ---- dead links --------------------------------------------------------------

// A link resolving INSIDE the bundle to a file that doesn't exist. Advisory
// only — OKF §6.1 explicitly permits a link to point at knowledge not yet
// written, so this is never a rejection.
export async function checkDeadLinks(repoRoot, wikiDir) {
  const pages = await linkScannedPages(repoRoot, wikiDir);
  const findings = [];
  for (const page of pages) {
    const links = await linksForPage(repoRoot, wikiDir, page);
    for (const link of links) {
      if (!link.insideBundle || link.exists) continue;
      findings.push({
        kind: 'dead-link',
        ok: false,
        severity: 'warning',
        page,
        target: link.rawTarget,
        resolvedTarget: link.resolvedRelPath,
        lineNumber: link.lineNumber,
        detail: `${page}:${link.lineNumber} dead link -> ${link.rawTarget} (resolves to ${link.resolvedRelPath}, which does not exist). Advisory only — OKF §6.1 permits a link to point at knowledge not yet written.`,
      });
    }
  }
  return findings;
}

// ---- out-of-bundle links -------------------------------------------------------

// A link whose resolved target escapes <wikiDir>/. Legal per OKF §6.1 and
// resolvable on local disk — so checkDeadLinks passes it silently — but
// unresolvable to an external OKF consumer that receives only the bundle.
// Reported as a note, not a defect. Existence-checked too: a target that
// escapes the bundle AND doesn't resolve on disk is dead as well, and the
// note says so.
export async function checkOutOfBundleLinks(repoRoot, wikiDir) {
  const pages = await linkScannedPages(repoRoot, wikiDir);
  const findings = [];
  for (const page of pages) {
    const links = await linksForPage(repoRoot, wikiDir, page);
    for (const link of links) {
      if (link.insideBundle) continue;
      const deadNote = link.exists
        ? ''
        : ' It also does not exist on disk, so it is dead as well.';
      findings.push({
        kind: 'out-of-bundle-link',
        ok: false,
        severity: 'info',
        page,
        target: link.rawTarget,
        resolvedTarget: link.resolvedRelPath,
        lineNumber: link.lineNumber,
        detail: `${page}:${link.lineNumber} link -> ${link.rawTarget} resolves outside ${wikiDir}/ (to ${link.resolvedRelPath}). Legal per OKF §6.1 and resolvable on local disk, but unresolvable to an external consumer that receives only the bundle.${deadNote}`,
      });
    }
  }
  return findings;
}

// ---- orphaned pages + unreachable subtrees --------------------------------------

// Orphaned pages (a concept page listed in no index), plus the separate
// unreachable-subtree case a per-page rule alone misses. If <wikiDir>/index.md
// is absent, the whole check is skipped and a single informational note is
// returned instead — OKF §11 forbids rejecting a bundle for a missing
// index.md, and reporting every page as an orphan would be a rejection in
// all but name (SKILL.md states this verbatim). This mirrors the same
// inapplicable-vs-passed distinction ADR-0053 established for the audit's
// own orphan scanner: an empty array here would read as "zero orphans",
// which is a different claim from "never checked."
export async function checkOrphanedPages(repoRoot, wikiDir) {
  const indexPaths = await wikiIndexPaths(repoRoot, wikiDir);
  const rootDir = normalizedWikiDir(repoRoot, wikiDir);
  const rootIndexPath = indexPaths[rootDir];

  if (!rootIndexPath) {
    return [
      {
        kind: 'orphan-check-skipped',
        ok: false,
        severity: 'info',
        detail: `no bundle-root index found at ${wikiDir}/index.md — orphan check skipped (a missing index.md must never be treated as a rejection; OKF §11)`,
      },
    ];
  }

  // Resolved, inside-bundle link targets per index, keyed by the index's own
  // directory (the same keys wikiIndexPaths uses) — resolution-based, per
  // #428 (see this module's header): an index "lists" a page when one of its
  // link targets RESOLVES to that page, never by substring containment of a
  // basename.
  const resolvedByIndexDir = {};
  for (const [dir, indexRelPath] of Object.entries(indexPaths)) {
    const links = await linksForPage(repoRoot, wikiDir, indexRelPath);
    resolvedByIndexDir[dir] = new Set(
      links.filter((l) => l.insideBundle).map((l) => l.resolvedRelPath),
    );
  }

  const candidates = await wikiPageCandidates(repoRoot, wikiDir);
  const findings = [];

  for (const page of candidates) {
    const slash = page.lastIndexOf('/');
    const pageDir = slash === -1 ? '' : page.slice(0, slash);

    const listedByRoot = resolvedByIndexDir[rootDir]?.has(page) ?? false;
    const listedByOwnDir = resolvedByIndexDir[pageDir]?.has(page) ?? false;
    if (listedByRoot || listedByOwnDir) continue;

    const ownIndexPath = indexPaths[pageDir];
    let detail;
    if (pageDir === rootDir) {
      detail = `${page} is listed in no index — ${wikiDir}/index.md does not link it`;
    } else if (ownIndexPath) {
      detail = `${page} is listed in no index — neither ${wikiDir}/index.md nor ${ownIndexPath} links it`;
    } else {
      detail = `${page} is listed in no index — ${wikiDir}/index.md does not link it, and its own directory has no index.md`;
    }

    findings.push({
      kind: 'orphaned-page',
      ok: false,
      severity: 'info',
      page,
      detail,
    });
  }

  // Unreachable subtree — a subdirectory index that is itself not linked
  // from the bundle-root index. The per-page rule above cannot catch this:
  // every page under <wikiDir>/sub/ can be listed in <wikiDir>/sub/index.md
  // while <wikiDir>/sub/index.md itself is reachable from nothing.
  const rootLinks = resolvedByIndexDir[rootDir] ?? new Set();
  for (const [dir, indexRelPath] of Object.entries(indexPaths)) {
    if (dir === rootDir) continue; // the root index itself, not a subtree
    if (rootLinks.has(indexRelPath)) continue;
    findings.push({
      kind: 'unreachable-subtree',
      ok: false,
      severity: 'info',
      page: indexRelPath,
      detail: `${indexRelPath} is not linked from ${wikiDir}/index.md — its subtree is unreachable from the bundle root`,
    });
  }

  return findings;
}

// ---- convenience aggregate -------------------------------------------------

// Runs all three checks and concatenates their findings, in the order they
// appear in SKILL.md's `lint` section: dead links, out-of-bundle links, then
// the orphan family (orphaned pages, unreachable subtrees, or the single
// missing-root-index note). Callers that need one check in isolation (e.g. to
// group findings by kind) should call the individual functions above instead.
export async function lintWiki(repoRoot, wikiDir) {
  const [dead, outOfBundle, orphans] = await Promise.all([
    checkDeadLinks(repoRoot, wikiDir),
    checkOutOfBundleLinks(repoRoot, wikiDir),
    checkOrphanedPages(repoRoot, wikiDir),
  ]);
  return [...dead, ...outOfBundle, ...orphans];
}
