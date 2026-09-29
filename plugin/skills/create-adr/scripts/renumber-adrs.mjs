#!/usr/bin/env node
// Renumber ADR files by opening a slot at position N, shifting every ADR
// numbered >= N up by one. Supports dry-run (default) and apply modes.
//
// CLI: node renumber-adrs.mjs --dir <adr-dir> --insert-at <N> [--apply]
//
// Exports for testing:
//   planRenumber({ dir, insertAt })  -> plan object (pure, no fs writes)
//   applyRenumber({ dir, insertAt }) -> performs moves + edits + prints report

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

// ---------------------------------------------------------------------------
// ADR file discovery
// ---------------------------------------------------------------------------

const ADR_FILENAME_RE = /^(\d{4})-(.+)\.md$/;

/**
 * Zero-pad a number to 4 digits.
 */
function pad(n) {
  return String(n).padStart(4, '0');
}

// ---------------------------------------------------------------------------
// Reference scanning
// ---------------------------------------------------------------------------

/**
 * Shell out to `git ls-files` in repoRoot to enumerate all tracked files.
 * Falls back to walking the dir tree if not a git repo or git unavailable.
 */
function listTrackedFiles(repoRoot) {
  const result = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status === 0 && result.stdout.trim()) {
    return result.stdout.trim().split('\n').map((f) => f.trim()).filter(Boolean);
  }
  // Fallback: walk tree
  return walkTree(repoRoot);
}

function walkTree(dir, base = dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === '.git') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      walkTree(full, base, out);
    } else if (e.isFile()) {
      out.push(relative(base, full).replace(/\\/g, '/'));
    }
  }
  return out;
}

// Patterns for AMBIGUOUS detection: bare ADR number references in text.
// Matches: "ADR 6", "ADR 0006", "decision 0006", "// See ADR 0006", etc.
function buildAmbiguousPatterns(movedNums) {
  // For each moved number, build patterns
  return movedNums.flatMap((n) => {
    const padded = pad(n);
    const bare = String(n);
    return [
      // "ADR 6" or "ADR 0006"
      new RegExp(`\\bADR\\s+${bare}\\b`, 'gi'),
      new RegExp(`\\bADR\\s+${padded}\\b`, 'gi'),
      // "decision 0006"
      new RegExp(`\\bdecision\\s+${padded}\\b`, 'gi'),
      new RegExp(`\\bdecision\\s+${bare}\\b`, 'gi'),
    ];
  });
}

/**
 * Scan a single file for unambiguous (relative link) and ambiguous (bare number) refs.
 *
 * unambiguous: relative links like `[text](NNNN-slug.md)` or TOC rows referencing
 *   `decisions/NNNN-slug.md`, where the target was moved.
 * ambiguous: bare patterns like "ADR 0006", "decision 0006" — report only.
 */
function scanFile({ relPath, content, oldToNew, movedOldNames, movedNums, adrDirRel }) {
  const unambiguous = [];
  const ambiguous = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Unambiguous: relative markdown link `[text](NNNN-slug.md)` where NNNN-slug.md is a moved file
    // Match pattern: ](NNNN-slug.md) or ](<NNNN-slug.md>)
    const linkRe = /\]\(<?(\d{4}-[^)>]+\.md)>?\)/g;
    let m;
    while ((m = linkRe.exec(line)) !== null) {
      const linkedName = m[1];
      if (movedOldNames.has(linkedName)) {
        unambiguous.push({
          file: relPath,
          line: lineNum,
          kind: 'relative-link',
          oldText: linkedName,
          newText: oldToNew.get(linkedName),
        });
      }
    }

    // Unambiguous: TOC-style rows referencing decisions/NNNN-slug.md
    // Patterns:
    //   [`decisions/NNNN-slug.md`](decisions/NNNN-slug.md) — description
    //   [decisions/NNNN-slug.md](decisions/NNNN-slug.md) — description
    const tocRe = /decisions\/(\d{4}-[^)`\s]+\.md)/g;
    const tocSeen = new Set();
    while ((m = tocRe.exec(line)) !== null) {
      const fname = m[1];
      if (movedOldNames.has(fname) && !tocSeen.has(fname)) {
        tocSeen.add(fname);
        unambiguous.push({
          file: relPath,
          line: lineNum,
          kind: 'toc-row',
          oldText: `decisions/${fname}`,
          newText: `decisions/${oldToNew.get(fname)}`,
        });
      }
    }

    // Ambiguous: bare "ADR N" / "ADR NNNN" / "decision NNNN" patterns
    for (const n of movedNums) {
      const padded = pad(n);
      const bare = String(n);
      // Check for "ADR N" patterns (case-insensitive)
      const adrPatterns = [
        new RegExp(`\\bADR\\s+${bare}\\b`, 'i'),
        new RegExp(`\\bADR\\s+${padded}\\b`, 'i'),
        new RegExp(`\\bdecision\\s+${padded}\\b`, 'i'),
      ];
      // Exclude bare==padded dup
      const uniquePatterns = bare === padded
        ? [new RegExp(`\\bADR\\s+${bare}\\b`, 'i'), new RegExp(`\\bdecision\\s+${bare}\\b`, 'i')]
        : adrPatterns;

      let matched = false;
      for (const pat of uniquePatterns) {
        if (pat.test(line)) { matched = true; break; }
      }
      if (matched) {
        ambiguous.push({
          file: relPath,
          line: lineNum,
          lineText: line,
          num: n,
        });
      }
    }
  }

  return { unambiguous, ambiguous };
}

// ---------------------------------------------------------------------------
// planRenumber — pure planning, no fs writes
// ---------------------------------------------------------------------------

/**
 * Plan the renumber operation.
 * @param {{ dir: string, insertAt: number }} opts
 *   dir      — absolute path to the ADR directory (also treated as repo root for ref scanning)
 * @returns {object} plan
 */
export function planRenumber({ dir, insertAt }) {
  if (!Number.isInteger(insertAt) || insertAt < 1) {
    const err = new Error(`--insert-at must be an integer >= 1, got: ${insertAt}`);
    err.code = 'EINSERTAT';
    throw err;
  }

  const { adrs, duplicates } = discoverAdrs(dir);

  if (duplicates.size > 0) {
    const parts = [...duplicates.entries()].map(
      ([num, paths]) => `ADR ${pad(num)} used by: ${paths.join(', ')}`,
    );
    const err = new Error(`Duplicate ADR numbers found across theme directories: ${parts.join('; ')}`);
    err.code = 'EDUPLICATE';
    throw err;
  }

  if (adrs.length === 0) {
    const err = new Error(`No ADR files found under ${dir}`);
    err.code = 'ENOADRS';
    throw err;
  }

  const highest = adrs[adrs.length - 1].num;

  // If N == H+1 or N > H, nothing to move (append / out-of-range)
  if (insertAt > highest) {
    return {
      insertAt,
      highest,
      moves: [],
      headingEdits: [],
      unambiguous: [],
      ambiguous: [],
    };
  }

  // Compute moves highest-down to avoid collisions
  const moves = [];
  for (let k = highest; k >= insertAt; k--) {
    const adr = adrs.find((a) => a.num === k);
    if (!adr) continue; // gap in numbering — skip
    const oldNum = k;
    const newNum = k + 1;
    const oldName = adr.name;
    const newName = `${pad(newNum)}-${adr.slug}.md`;
    const relDir = adr.relDir;
    const oldPath = adr.path;
    const newPath = relDir ? `${relDir}/${newName}` : newName;
    moves.push({
      oldNum,
      newNum,
      oldName,
      newName,
      slug: adr.slug,
      relDir,
      oldPath,
      newPath,
    });
  }

  // Heading edits: for each moved file, update `# NNNN. ` heading
  const headingEdits = moves.map((m) => ({
    filename: m.newName, // the file after rename
    path: m.newPath, // the file's post-move path relative to dir
    oldHeadingPrefix: `# ${pad(m.oldNum)}.`,
    newHeadingPrefix: `# ${pad(m.newNum)}.`,
  }));

  // Build lookup maps for reference scanning
  const oldToNew = new Map(moves.map((m) => [m.oldName, m.newName]));
  const movedOldNames = new Set(moves.map((m) => m.oldName));
  const movedNums = moves.map((m) => m.oldNum);

  // Determine repo root: adr dir may be like `repo/docs/decisions`; we need repo root
  // for `git ls-files`. Walk up to find .git; fall back to parent of the ADR dir
  // so that files outside the ADR sub-directory (src/, docs/) are still scanned.
  const repoRoot = findRepoRoot(dir) ?? dirname(dir);
  const adrDirRel = relative(repoRoot, dir).replace(/\\/g, '/');

  const trackedFiles = listTrackedFiles(repoRoot);

  const allUnambiguous = [];
  const allAmbiguous = [];

  // Determine extensions to scan: .md and common source extensions
  const SCAN_EXTS = new Set(['.md', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx', '.py', '.go', '.rs', '.cs', '.cpp', '.c', '.h', '.java', '.rb', '.swift']);

  for (const relPath of trackedFiles) {
    const ext = relPath.includes('.') ? '.' + relPath.split('.').pop() : '';
    if (!SCAN_EXTS.has(ext)) continue;

    let content;
    try {
      content = readFileSync(join(repoRoot, relPath), 'utf8');
    } catch {
      continue;
    }

    const { unambiguous, ambiguous } = scanFile({
      relPath,
      content,
      oldToNew,
      movedOldNames,
      movedNums,
      adrDirRel,
    });

    allUnambiguous.push(...unambiguous);
    allAmbiguous.push(...ambiguous);
  }

  return {
    insertAt,
    highest,
    moves,
    headingEdits,
    unambiguous: allUnambiguous,
    ambiguous: allAmbiguous,
    repoRoot,
    dir,
    oldToNew,
    movedOldNames,
  };
}

// ---------------------------------------------------------------------------
// applyRenumber — perform the renumber with git mv
// ---------------------------------------------------------------------------

/**
 * Apply the renumber: git mv files, rewrite headings, fix unambiguous refs.
 * Requires a clean git worktree. Prints the ambiguous report but does NOT modify those.
 * @param {{ dir: string, insertAt: number }} opts
 */
export function applyRenumber({ dir, insertAt }) {
  // Clean-tree precondition
  const repoRoot = findRepoRoot(dir) ?? dirname(dir);
  const status = spawnSync('git', ['status', '--porcelain'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (status.status !== 0) {
    console.error('Error: git status failed — ensure this is a git repository.');
    process.exit(1);
  }
  if (status.stdout.trim() !== '') {
    console.error('Error: working tree is not clean. Commit or stash your changes before running --apply.');
    console.error('Uncommitted changes detected:');
    console.error(status.stdout.trim());
    process.exit(1);
  }

  const plan = planRenumber({ dir, insertAt });

  if (plan.moves.length === 0) {
    console.log(`No files to move — insert-at ${insertAt} is beyond highest ADR ${plan.highest}.`);
    return plan;
  }

  // Perform git mv highest-down (moves are already in that order). Use the
  // move's relDir-aware oldPath/newPath (not the bare oldName/newName) so a
  // themed move (file inside a theme subdirectory) resolves to its real
  // location instead of a nonexistent direct child of `dir`.
  for (const move of plan.moves) {
    const fromPath = join(dir, move.oldPath ?? move.oldName);
    const toPath = join(dir, move.newPath ?? move.newName);
    const result = spawnSync('git', ['mv', fromPath, toPath], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      console.error(`Error: git mv ${move.oldName} -> ${move.newName} failed:`);
      console.error(result.stderr || result.stdout);
      process.exit(1);
    }
    console.log(`Moved: ${move.oldName} -> ${move.newName}`);
  }

  // Apply heading edits
  for (const edit of plan.headingEdits) {
    const filePath = join(dir, edit.filename);
    let content;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch (err) {
      console.error(`Warning: could not read ${edit.filename} for heading edit: ${err.message}`);
      continue;
    }
    const updated = content.replace(edit.oldHeadingPrefix, edit.newHeadingPrefix);
    if (updated !== content) {
      writeFileSync(filePath, updated, 'utf8');
      console.log(`Updated heading in: ${edit.filename}`);
    }
  }

  // Apply unambiguous reference rewrites
  // Group by file to avoid multiple reads
  const byFile = new Map();
  for (const ref of plan.unambiguous) {
    if (!byFile.has(ref.file)) byFile.set(ref.file, []);
    byFile.get(ref.file).push(ref);
  }

  for (const [relPath, refs] of byFile) {
    const filePath = join(repoRoot, relPath);
    let content;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch (err) {
      console.error(`Warning: could not read ${relPath} for ref rewrite: ${err.message}`);
      continue;
    }
    let updated = content;
    // Apply rewrites for this file (deduplicated by oldText)
    const seen = new Set();
    for (const ref of refs) {
      if (seen.has(ref.oldText)) continue;
      seen.add(ref.oldText);
      // Replace all occurrences of oldText with newText
      updated = updated.split(ref.oldText).join(ref.newText);
    }
    if (updated !== content) {
      writeFileSync(filePath, updated, 'utf8');
      console.log(`Updated references in: ${relPath}`);
    }
  }

  // Print ambiguous report (never modified)
  if (plan.ambiguous.length > 0) {
    console.log('\n--- Ambiguous references (review manually, NOT auto-fixed) ---');
    for (const ref of plan.ambiguous) {
      console.log(`  ${ref.file}:${ref.line}: ${ref.lineText.trim()}`);
    }
    console.log('--- End ambiguous report ---\n');
  }

  return plan;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Walk up from dir to find the nearest .git directory.
 * Returns the directory containing .git, or null.
 */
function findRepoRoot(startDir) {
  let current = resolve(startDir);
  while (true) {
    try {
      const entries = readdirSync(current);
      if (entries.includes('.git')) return current;
    } catch {
      return null;
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

// ---------------------------------------------------------------------------
// New pure helpers for recursive/themed discovery, single-pass token rewrite
// and frozen-path exclusion (added in #581 task 1). Exported for testing but
// NOT YET WIRED into planRenumber/applyRenumber — that wiring lands in
// #581 tasks 2-4 (F1-F3).
// ---------------------------------------------------------------------------

const DATE_NAMED_RE = /^\d{4}-\d{2}-\d{2}-/;

/**
 * Recursively discover ADR files under `dir`, skipping dot-directories and
 * `node_modules`. An ADR is a basename matching `NNNN-slug.md` that is NOT
 * date-shaped (`NNNN-NN-NN-...`) — that excludes date-stamped notes files.
 * `index.md`, `README.md` and any other non-matching file are ignored.
 *
 * Returns `{ adrs, duplicates }`:
 *   - `adrs`: every discovered ADR as one sequence sorted by `num` ascending,
 *     each `{ num, name, slug, relDir, path }`. `relDir` is the POSIX-style
 *     directory of the file relative to `dir` (`''` for a file directly in
 *     `dir`, `'alpha'` for `dir/alpha/...`). `path` is the file's POSIX-style
 *     path relative to `dir` (`relDir` joined with `name`).
 *   - `duplicates`: `Map<num, path[]>` — only numbers that occur more than
 *     once across the whole tree (e.g. across two themes).
 *
 * @param {string} dir
 * @returns {{ adrs: Array<{num:number,name:string,slug:string,relDir:string,path:string}>, duplicates: Map<number,string[]> }}
 */
export function discoverAdrs(dir) {
  const adrs = [];

  function walk(current, relDir) {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.name === 'node_modules') continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full, relDir ? `${relDir}/${entry.name}` : entry.name);
        continue;
      }
      if (!entry.isFile()) continue;
      if (DATE_NAMED_RE.test(entry.name)) continue;
      const m = ADR_FILENAME_RE.exec(entry.name);
      if (!m) continue;
      adrs.push({
        num: parseInt(m[1], 10),
        name: entry.name,
        slug: m[2],
        relDir,
        path: relDir ? `${relDir}/${entry.name}` : entry.name,
      });
    }
  }

  walk(dir, '');
  adrs.sort((a, b) => a.num - b.num);

  const byNum = new Map();
  for (const adr of adrs) {
    if (!byNum.has(adr.num)) byNum.set(adr.num, []);
    byNum.get(adr.num).push(adr.path);
  }
  const duplicates = new Map();
  for (const [num, paths] of byNum) {
    if (paths.length > 1) duplicates.set(num, paths);
  }

  return { adrs, duplicates };
}

/**
 * Escape a string for literal use inside a RegExp alternation.
 */
function escapeForRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a single-pass whole-filename-token rewriter from a map of old
 * basename -> new basename. Never chain per-name replaces (that mis-rewrites
 * a shifted sequence, e.g. 0002-x.md -> 0003-x.md -> 0004-x.md).
 *
 * The returned function performs ONE regex pass over the input text, using a
 * single alternation of every old basename (regex-escaped, longest first so
 * a longer filename that embeds a shorter one — e.g.
 * `0007-supersedes-0003-c.md` embedding `0003-c.md` — matches whole first),
 * bounded by a lookbehind/lookahead that requires the match to be a whole
 * filename token (not a substring of a longer token, an extension, or a
 * trailing digit run).
 *
 * @param {Map<string,string>} oldToNew
 * @returns {(text: string) => { text: string, hits: Array<{index:number, oldText:string, newText:string}> }}
 */
export function buildTokenRewriter(oldToNew) {
  const names = [...oldToNew.keys()];
  if (names.length === 0) {
    return (text) => ({ text, hits: [] });
  }
  const alternation = [...names]
    .sort((a, b) => b.length - a.length)
    .map(escapeForRegExp)
    .join('|');
  const tokenRe = new RegExp(
    `(?<![A-Za-z0-9_.-])(?:${alternation})(?![A-Za-z0-9_-]|[.][A-Za-z0-9])`,
    'g',
  );

  return function rewrite(text) {
    const hits = [];
    const rewritten = text.replace(tokenRe, (match, offset) => {
      const newText = oldToNew.get(match);
      hits.push({ index: offset, oldText: match, newText });
      return newText;
    });
    return { text: rewritten, hits };
  };
}

/**
 * True when `rel` (a repo-relative POSIX path) is frozen history that a
 * renumber sweep must scan-and-list but never rewrite:
 *   - any `CHANGELOG.md` (by basename, any directory)
 *   - anything under `docs/superpowers/`
 *   - anything under `<cfg.rawDir ?? 'raw'>/`
 *   - exactly `<cfg.wikiDir ?? 'wiki'>/log.md`
 *   - exactly `.pointer-baseline.json` (repo root)
 *
 * @param {string} rel
 * @param {{ rawDir?: string, wikiDir?: string }} [cfg]
 * @returns {boolean}
 */
export function isFrozenPath(rel, cfg = {}) {
  const normalized = rel.replace(/\\/g, '/').replace(/^\.\//, '');
  const rawDir = cfg.rawDir ?? 'raw';
  const wikiDir = cfg.wikiDir ?? 'wiki';
  const basename = normalized.split('/').pop();

  if (basename === 'CHANGELOG.md') return true;
  if (normalized === 'docs/superpowers' || normalized.startsWith('docs/superpowers/')) return true;
  if (normalized === rawDir || normalized.startsWith(`${rawDir}/`)) return true;
  if (normalized === `${wikiDir}/log.md`) return true;
  if (normalized === '.pointer-baseline.json') return true;
  return false;
}

/**
 * Format a dry-run plan for stdout.
 */
function formatPlan(plan) {
  const lines = ['--- ADR Renumber Dry-Run ---', ''];
  if (plan.moves.length === 0) {
    lines.push(`No moves needed: insert-at ${plan.insertAt} is beyond highest ADR ${plan.highest}.`);
    return lines.join('\n');
  }

  lines.push(`Insert slot at: ${plan.insertAt} (highest existing: ${plan.highest})`);
  lines.push('');
  lines.push('File moves (highest-down to avoid collisions):');
  for (const m of plan.moves) {
    lines.push(`  ${m.oldName} -> ${m.newName}`);
  }

  if (plan.headingEdits.length > 0) {
    lines.push('');
    lines.push('Heading edits:');
    for (const e of plan.headingEdits) {
      lines.push(`  ${e.filename}: "${e.oldHeadingPrefix} ..." -> "${e.newHeadingPrefix} ..."`);
    }
  }

  if (plan.unambiguous.length > 0) {
    lines.push('');
    lines.push('Unambiguous reference rewrites (auto-fix in --apply):');
    for (const r of plan.unambiguous) {
      lines.push(`  ${r.file}:${r.line} [${r.kind}]: "${r.oldText}" -> "${r.newText}"`);
    }
  }

  if (plan.ambiguous.length > 0) {
    lines.push('');
    lines.push('Ambiguous references (review manually, never auto-fixed):');
    for (const r of plan.ambiguous) {
      lines.push(`  ${r.file}:${r.line}: ${r.lineText.trim()}`);
    }
  }

  lines.push('');
  lines.push('Re-run with --apply to execute.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));

if (isMain) {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        dir: { type: 'string' },
        'insert-at': { type: 'string' },
        apply: { type: 'boolean', default: false },
      },
    }));
  } catch (err) {
    console.error(`Error: invalid command-line arguments: ${String(err.message).split('\n')[0]}`);
    process.exit(1);
  }

  const dir = values['dir'];
  const insertAtRaw = values['insert-at'];

  if (!dir) {
    console.error('Usage: node renumber-adrs.mjs --dir <adr-dir> --insert-at <N> [--apply]');
    process.exit(1);
  }

  if (!insertAtRaw || !/^\d+$/.test(insertAtRaw) || parseInt(insertAtRaw, 10) < 1) {
    console.error(`Error: --insert-at must be a positive integer, got: ${insertAtRaw ?? '(missing)'}`);
    process.exit(1);
  }

  const insertAt = parseInt(insertAtRaw, 10);

  if (insertAt > 9999) {
    console.error(`Error: --insert-at ${insertAt} exceeds the maximum ADR number 9999.`);
    process.exit(1);
  }

  const absDir = resolve(dir);

  try {
    if (values['apply']) {
      applyRenumber({ dir: absDir, insertAt });
    } else {
      const plan = planRenumber({ dir: absDir, insertAt });
      console.log(formatPlan(plan));
    }
  } catch (err) {
    console.error(`Error: ${String(err.message).split('\n')[0]}`);
    process.exit(1);
  }
}
