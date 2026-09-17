// The bundle's candidate-file walk, for #150's mechanical conformance checker
// (Task 11) and any other maintain-wiki logic that needs the concept-page set
// or the bundle's index files.
//
// SKILL.md states the candidate set as `<wikiDir>/**/*.md` minus `index.md`
// and `log.md` AT ANY LEVEL — not just the bundle root. A walk that only
// excludes the index it happens to be reading (rather than every `index.md`
// and `log.md` anywhere under the bundle) misclassifies a reserved file in a
// subdirectory — e.g. `wiki/log.md` itself — as an orphaned concept page.
// That is a real, measured false positive of the naive approach, not a
// hypothetical.
//
// Pure — reads the filesystem, writes nothing, no process.exit, no console
// output. A missing <wikiDir>/ on disk is handled gracefully (empty result),
// same as a missing docsRoot/ elsewhere in this plugin.

import { promises as fs } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';

function toRepoRelativePosix(repoRoot, abs) {
  const rel = abs.slice(resolve(repoRoot).length + 1);
  return rel.split(sep).join('/');
}

// Resolves `wikiDir` (as configured, e.g. in .gvt-agent.json) against
// `repoRoot`, refusing every degenerate input that would otherwise walk the
// repository root: undefined/empty, an absolute path (however it happens to
// resolve), and any relative path (e.g. '.', './', '..') that resolves to
// `repoRoot` itself or escapes it. A wiki linter that silently scans the
// entire repo because a config key was missing is worse than one that
// refuses (AC31). Returns the resolved absolute directory, or null when the
// input is degenerate.
function safeWikiRootAbs(repoRoot, wikiDir) {
  if (!wikiDir) return null;
  if (isAbsolute(wikiDir)) return null; // never trust a caller-supplied absolute path

  const repoRootAbs = resolve(repoRoot);
  const abs = resolve(repoRootAbs, wikiDir);
  if (abs === repoRootAbs) return null; // '.', '' collapse to the repo root itself

  const escapesRoot = !abs.startsWith(repoRootAbs + sep);
  if (escapesRoot) return null; // e.g. '..' walked above repoRoot

  return abs;
}

// Recursively lists every *.md file under `rootAbs`, as absolute paths. A
// missing directory yields [] rather than throwing (readdir's ENOENT is
// caught and swallowed).
async function listMarkdownAbs(rootAbs) {
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        out.push(full);
      }
    }
  }
  await walk(rootAbs);
  return out;
}

function basenamePosix(relPosix) {
  const idx = relPosix.lastIndexOf('/');
  return idx === -1 ? relPosix : relPosix.slice(idx + 1);
}

// The concept-page candidate set: `<wikiDir>/**/*.md`, minus `index.md` and
// `log.md` at any level (see this module's header). Returns repo-relative,
// forward-slash paths, sorted, matching the shape audit-conventions'
// listMarkdown/wikiCandidateFiles produce on Windows.
//
// A degenerate wikiDir (undefined, '', '.', '/', or an absolute path) yields
// [] — see safeWikiRootAbs — as does a wikiDir naming a directory that
// doesn't exist on disk.
export async function wikiPageCandidates(repoRoot, wikiDir) {
  const rootAbs = safeWikiRootAbs(repoRoot, wikiDir);
  if (!rootAbs) return [];

  const files = await listMarkdownAbs(rootAbs);
  return files
    .map((abs) => toRepoRelativePosix(repoRoot, abs))
    .filter((rel) => {
      const base = basenamePosix(rel);
      return base !== 'index.md' && base !== 'log.md';
    })
    .sort();
}

// Locates every `index.md` under `<wikiDir>/`, at any level — the bundle-root
// index and every subdirectory index (SKILL.md's orphan-page rule: "a page
// counts as listed if it appears in `<wikiDir>/index.md` OR in the index.md
// of its own subdirectory").
//
// Returns a plain object mapping each index's OWN directory (repo-relative,
// forward-slash, no trailing slash) to that index.md's own repo-relative
// path — e.g. `{ wiki: 'wiki/index.md', 'wiki/sub': 'wiki/sub/index.md' }`.
// Chosen over a flat array of index paths because Task 11's orphan check
// needs, for a given page, "is there an index in the bundle root, or in this
// page's own directory" — a directory-keyed lookup answers that in one
// property access on each of the two keys (the bundle root's own relative
// path, and the page's own dirname), rather than every caller re-deriving
// dirname-of-index itself. A plain object (not a Map) so callers and tests
// can use ordinary property access and deepEqual without a conversion step.
//
// Same degenerate-input handling as wikiPageCandidates: a degenerate wikiDir
// or a missing directory on disk yields `{}`.
export async function wikiIndexPaths(repoRoot, wikiDir) {
  const rootAbs = safeWikiRootAbs(repoRoot, wikiDir);
  if (!rootAbs) return {};

  const files = await listMarkdownAbs(rootAbs);
  const result = {};
  for (const abs of files) {
    const rel = toRepoRelativePosix(repoRoot, abs);
    if (basenamePosix(rel) !== 'index.md') continue;
    const slash = rel.lastIndexOf('/');
    const dir = slash === -1 ? '' : rel.slice(0, slash);
    result[dir] = rel;
  }
  return result;
}
