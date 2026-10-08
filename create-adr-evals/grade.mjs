// create-adr-evals/grade.mjs
//
// Deterministic grading for one create-adr-evals run (#582 T2). Pure given a
// fixture root on disk: no spawning, no model calls — run.mjs and
// test/grade.test.mjs are the only callers. `gradeRun` diffs the working
// tree against the pre-run snapshot fixtures.mjs took, so it grades whatever
// state the model left behind whether or not it committed (design note: "the
// grader considers both committed and uncommitted results").
//
// D1-D7 below are the designer's own labels (see the #582 design hand-off);
// D5 applies only to the wiki variants (A/A-infer/C) because variant B's
// correct behavior IS a docs/TOC.md change (the first-use scaffold's
// self-indexed row).

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { snapshotTree } from './fixtures.mjs';
import { extractFrontmatter } from '../plugin/skills/audit-conventions/scripts/lib/frontmatter.mjs';
import { lintWiki } from '../plugin/skills/maintain-wiki/scripts/lib/checks.mjs';
import { describeAdrDir } from '../plugin/skills/create-adr/scripts/renumber-adrs.mjs';

// Mirrors renumber-adrs.mjs's own ADR_FILENAME_RE / DATE_NAMED_RE discovery
// rule (not exported there) so this grader applies the identical exclusions:
// index.md/README.md and date-named notes are never mistaken for an ADR.
const ADR_FILENAME_RE = /^(\d{4})-(.+)\.md$/;
const DATE_NAMED_RE = /^\d{4}-\d{2}-\d{2}-/;

function isAdrBasename(name) {
  return ADR_FILENAME_RE.test(name) && !DATE_NAMED_RE.test(name);
}

function parseAdrNumber(name) {
  const m = ADR_FILENAME_RE.exec(name);
  return m ? parseInt(m[1], 10) : null;
}

function pad4(n) {
  return String(n).padStart(4, '0');
}

function basename(relPath) {
  const idx = relPath.lastIndexOf('/');
  return idx === -1 ? relPath : relPath.slice(idx + 1);
}

/**
 * Diff two snapshotTree() Maps. Returns repo-relative POSIX paths.
 */
function diffTree(before, after) {
  const added = [];
  const removed = [];
  const changed = [];
  for (const [p, hash] of after) {
    if (!before.has(p)) added.push(p);
    else if (before.get(p) !== hash) changed.push(p);
  }
  for (const p of before.keys()) {
    if (!after.has(p)) removed.push(p);
  }
  return { added, removed, changed };
}

/**
 * `tags` round-trips through audit-core's frontmatter parser as a literal
 * string for a flow-style `[a, b]` scalar (its parser has no flow-sequence
 * support — probed directly against the real parser, not inferred by
 * reading it), and as an array of empty objects for a block-style `- item`
 * list (its array support is scoped to arrays of `- key: value` objects).
 * So the only representation this check can trust is substring containment
 * on the flow-style string form, with an Array.isArray branch kept in case
 * a future parser version does return real array elements.
 */
function tagsContains(tagsValue, token) {
  if (tagsValue == null) return false;
  if (Array.isArray(tagsValue)) {
    return tagsValue.some((t) => typeof t === 'string' && t.trim() === token);
  }
  return String(tagsValue).includes(token);
}

function stripFrontmatter(source) {
  return source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

// ---------------------------------------------------------------------------
// Wiki variants: A, A-infer, C
// ---------------------------------------------------------------------------

async function gradeWikiRun({ root, before, meta }) {
  const reasons = [];
  const after = snapshotTree(root);
  const diff = diffTree(before, after);

  // D1: exactly one new ADR file under wiki/decisions/, at the expected
  // number, in the expected theme (A/C) or any pre-existing theme (A-infer).
  const newAdrCandidates = diff.added.filter((p) => {
    if (!p.startsWith(`${meta.decisionsDir}`)) return false;
    return isAdrBasename(basename(p));
  });

  let newPath = null;
  let newNumber = null;
  let theme = null;
  let themeIsExisting = null;
  let newThemeCreated = false;
  let d1 = false;

  if (newAdrCandidates.length === 1) {
    newPath = newAdrCandidates[0];
    const rel = newPath.slice(meta.decisionsDir.length);
    const slash = rel.lastIndexOf('/');
    theme = slash === -1 ? null : rel.slice(0, slash);
    const base = slash === -1 ? rel : rel.slice(slash + 1);
    newNumber = parseAdrNumber(base);
    themeIsExisting = theme !== null && meta.themes.includes(theme);
    newThemeCreated = theme !== null && !themeIsExisting;

    const themeOk = meta.expectedTheme ? theme === meta.expectedTheme : themeIsExisting;
    d1 = newNumber === meta.expectedNumber && theme !== null && themeOk;
    if (!d1) {
      reasons.push(`D1: expected ${pad4(meta.expectedNumber)} in ${meta.expectedTheme ?? 'an existing theme'}, got ${newPath}`);
    }
  } else {
    reasons.push(`D1: expected exactly one new ADR file under ${meta.decisionsDir}, found ${newAdrCandidates.length} (${newAdrCandidates.join(', ') || 'none'})`);
  }

  // D2: no change under docs/decisions/; no README.md added anywhere under wiki/.
  const docsDecisionsTouched = [...diff.added, ...diff.removed, ...diff.changed]
    .some((p) => p.startsWith('docs/decisions/'));
  const wikiReadmeAdded = diff.added.some((p) => p.startsWith('wiki/') && basename(p) === 'README.md');
  const d2 = !docsDecisionsTouched && !wikiReadmeAdded;
  if (!d2) reasons.push(`D2: docs/decisions/ touched=${docsDecisionsTouched}, README.md added under wiki/=${wikiReadmeAdded}`);

  // D3: OKF frontmatter (type, tags include decisions+theme, title has no
  // leading number) and a `# NNNN. ` body heading.
  let d3 = false;
  if (newPath) {
    const content = readFileSync(join(root, newPath), 'utf8');
    const fm = extractFrontmatter(content);
    const hasType = Boolean(fm) && typeof fm.type === 'string' && fm.type.trim() !== '';
    const tagsOk = Boolean(fm) && tagsContains(fm.tags, 'decisions') && (theme ? tagsContains(fm.tags, theme) : true);
    const titleOk = Boolean(fm) && typeof fm.title === 'string' && !/^\s*\d{3,4}[.\-)]/.test(fm.title);
    const body = stripFrontmatter(content);
    const headingOk = newNumber != null && new RegExp(`^#\\s*${pad4(newNumber)}\\.`, 'm').test(body);
    d3 = hasType && tagsOk && titleOk && headingOk;
    if (!d3) reasons.push(`D3: hasType=${hasType} tagsOk=${tagsOk} titleOk=${titleOk} headingOk=${headingOk}`);
  } else {
    reasons.push('D3: skipped — no new ADR file found');
  }

  // D4: the theme index links the new file, AND lintWiki reports zero
  // orphaned-page/unreachable-subtree findings (a real lint run, not a
  // hand-rolled proxy — see test/grade.test.mjs's injected-orphan case).
  let d4 = false;
  if (newPath && theme) {
    const themeIndexRel = `${meta.decisionsDir}${theme}/index.md`;
    const newBasename = basename(newPath);
    let linksNewFile = false;
    if (existsSync(join(root, themeIndexRel))) {
      const idx = readFileSync(join(root, themeIndexRel), 'utf8');
      linksNewFile = idx.includes(`](${newBasename})`);
    }
    const findings = await lintWiki(root, 'wiki');
    const orphanish = findings.filter((f) => f.kind === 'orphaned-page' || f.kind === 'unreachable-subtree');
    d4 = linksNewFile && orphanish.length === 0;
    if (!d4) {
      reasons.push(`D4: theme index links new file=${linksNewFile}, orphan/unreachable findings=${orphanish.length} (${orphanish.map((f) => f.page).join(', ')})`);
    }
  } else {
    reasons.push('D4: skipped — no new ADR file/theme found');
  }

  // D5 (wiki variants only): docs/TOC.md unchanged.
  const tocBefore = before.get('docs/TOC.md');
  const tocAfter = after.get('docs/TOC.md');
  const d5 = tocBefore === tocAfter;
  if (!d5) reasons.push('D5: docs/TOC.md changed');

  // D6: wiki/log.md unchanged, if it existed before the run.
  const logBefore = before.get('wiki/log.md');
  const logAfter = after.get('wiki/log.md');
  const d6 = logBefore === undefined || logBefore === logAfter;
  if (!d6) reasons.push('D6: wiki/log.md changed');

  // D7: describeAdrDir's `--next` resolution agrees after the run.
  let d7 = false;
  try {
    const summary = describeAdrDir({ repoRoot: root, dir: meta.decisionsDir });
    d7 = newNumber != null && summary.next === newNumber + 1;
    if (!d7) reasons.push(`D7: --next reports next=${summary.next}, expected ${newNumber != null ? newNumber + 1 : '(n/a)'}`);
  } catch (err) {
    reasons.push(`D7: describeAdrDir threw: ${err.message}`);
  }

  const assertions = { d1, d2, d3, d4, d5, d6, d7 };
  const allDeterministicPass = Object.values(assertions).every(Boolean);

  return {
    theme,
    themeIsExisting,
    newThemeCreated,
    newNumber,
    newPath,
    assertions,
    allDeterministicPass,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// Negative control: B
// ---------------------------------------------------------------------------

function gradeDefaultRun({ root, before, meta }) {
  const reasons = [];
  const after = snapshotTree(root);
  const diff = diffTree(before, after);

  // D2: no change anywhere under wiki/ (the decoy bundle).
  const wikiTouched = [...diff.added, ...diff.removed, ...diff.changed].some((p) => p.startsWith('wiki/'));
  const d2 = !wikiTouched;
  if (!d2) reasons.push('D2: wiki/ was touched');

  // D1: exactly one new ADR file directly under docs/decisions/ (no theme
  // subdirectory), at the expected (first) number.
  const newAdrCandidates = diff.added.filter((p) => {
    if (!p.startsWith('docs/decisions/')) return false;
    const rel = p.slice('docs/decisions/'.length);
    return !rel.includes('/') && isAdrBasename(rel);
  });

  let newPath = null;
  let newNumber = null;
  let d1 = false;
  if (newAdrCandidates.length === 1) {
    newPath = newAdrCandidates[0];
    newNumber = parseAdrNumber(basename(newPath));
    d1 = newNumber === meta.expectedNumber;
    if (!d1) reasons.push(`D1: expected docs/decisions/${pad4(meta.expectedNumber)}-*.md, got ${newPath}`);
  } else {
    reasons.push(`D1: expected exactly one new ADR file directly under docs/decisions/, found ${newAdrCandidates.length} (${newAdrCandidates.join(', ') || 'none'})`);
  }

  // D3: no frontmatter at all, and the file's first non-blank line is the
  // `# NNNN. ` body heading.
  let d3 = false;
  if (newPath) {
    const content = readFileSync(join(root, newPath), 'utf8');
    const fm = extractFrontmatter(content);
    const firstLine = content.split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
    const headingOk = newNumber != null && new RegExp(`^#\\s*${pad4(newNumber)}\\.`).test(firstLine);
    d3 = fm === null && headingOk;
    if (!d3) reasons.push(`D3: frontmatter present=${fm !== null}, first line="${firstLine}"`);
  } else {
    reasons.push('D3: skipped — no new ADR file found');
  }

  // D4: docs/TOC.md gained a Decision Records row for the new file, and
  // docs/decisions/README.md was scaffolded with the TOC breadcrumb.
  let tocHasRow = false;
  const tocPath = join(root, 'docs/TOC.md');
  if (newPath && existsSync(tocPath)) {
    const toc = readFileSync(tocPath, 'utf8');
    tocHasRow = toc.includes(basename(newPath)) || (newNumber != null && toc.includes(pad4(newNumber)));
  }
  let readmeOk = false;
  const readmePath = join(root, 'docs/decisions/README.md');
  if (existsSync(readmePath)) {
    readmeOk = readFileSync(readmePath, 'utf8').includes('](../TOC.md)');
  }
  const d4 = tocHasRow && readmeOk;
  if (!d4) reasons.push(`D4: TOC row present=${tocHasRow}, README breadcrumb present=${readmeOk}`);

  // D6: wiki/log.md unchanged, if it existed before the run (it doesn't in
  // this fixture, so this is a vacuous pass unless the model creates one).
  const logBefore = before.get('wiki/log.md');
  const logAfter = after.get('wiki/log.md');
  const d6 = logBefore === undefined || logBefore === logAfter;
  if (!d6) reasons.push('D6: wiki/log.md changed');

  // D7: describeAdrDir's `--next` resolution agrees after the run.
  let d7 = false;
  try {
    const summary = describeAdrDir({ repoRoot: root, dir: meta.decisionsDir });
    d7 = newNumber != null && summary.next === newNumber + 1;
    if (!d7) reasons.push(`D7: --next reports next=${summary.next}, expected ${newNumber != null ? newNumber + 1 : '(n/a)'}`);
  } catch (err) {
    reasons.push(`D7: describeAdrDir threw: ${err.message}`);
  }

  const assertions = { d1, d2, d3, d4, d6, d7 };
  const allDeterministicPass = Object.values(assertions).every(Boolean);

  return {
    theme: null,
    themeIsExisting: null,
    newThemeCreated: false,
    newNumber,
    newPath,
    assertions,
    allDeterministicPass,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Grade one run's resulting working tree against its pre-run snapshot.
 * `meta` is fixtures.buildFixture()'s own `meta` return value — the
 * fixture's shape IS the grading contract, so this never re-derives it from
 * `.gvt-agent.json` or guesses at a variant name.
 * @param {{ variant: string, root: string, before: Map<string,string>, meta: object }} opts
 * @returns {Promise<object>}
 */
export async function gradeRun({ variant, root, before, meta }) {
  const result = meta.wiki
    ? await gradeWikiRun({ root, before, meta })
    : gradeDefaultRun({ root, before, meta });
  return { variant, ...result };
}

export { diffTree, isAdrBasename, tagsContains };
