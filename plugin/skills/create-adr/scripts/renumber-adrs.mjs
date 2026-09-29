#!/usr/bin/env node
// Renumber ADR files by opening a slot at position N, shifting every ADR
// numbered >= N up by one. Supports dry-run (default) and apply modes.
//
// CLI: node renumber-adrs.mjs --dir <adr-dir> --insert-at <N> [--apply]
//
// Exports for testing:
//   planRenumber({ dir, insertAt })  -> plan object (pure, no fs writes)
//   applyRenumber({ dir, insertAt }) -> performs moves + edits + prints report

import { readdirSync, readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

/**
 * True when `buf`'s first 8 KB contains a NUL byte — a cheap binary-file
 * heuristic used to exclude non-text files from the corpus scan.
 */
function isBinaryBuffer(buf) {
  const len = Math.min(buf.length, 8192);
  for (let i = 0; i < len; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

/**
 * Read the `wiki` block from `<repoRoot>/.gvt-agent.json`, if present.
 * Missing or unparseable config is not an error — isFrozenPath() already
 * falls back to its own wikiDir/rawDir defaults when a key is undefined.
 */
function readWikiConfig(repoRoot) {
  try {
    const raw = readFileSync(join(repoRoot, '.gvt-agent.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return { wikiDir: parsed.wiki?.wikiDir, rawDir: parsed.wiki?.rawDir };
  } catch {
    return {};
  }
}

/**
 * Join a POSIX-relative `rel` path onto a (possibly empty) `base` directory,
 * without introducing a leading slash when `base` is `''`.
 */
function joinRel(base, rel) {
  return base ? `${base}/${rel}` : rel;
}

/**
 * Build a sorted array of line-start offsets for `text`, for O(log n)
 * offset -> line-number lookups via lineForOffset().
 */
function buildLineIndex(text) {
  const offsets = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') offsets.push(i + 1);
  }
  return offsets;
}

function lineForOffset(lineIndex, offset) {
  let lo = 0;
  let hi = lineIndex.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineIndex[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/**
 * Classify a token match by the character(s) immediately preceding it:
 * `](` or `](<` -> relative-link (a markdown link target); a preceding `/`
 * -> path (embedded in a longer path); a preceding backtick -> code;
 * anything else -> text.
 */
function classifyTokenKind(text, index) {
  if (index >= 3 && text[index - 1] === '<' && text.slice(index - 3, index - 1) === '](') {
    return 'relative-link';
  }
  if (index >= 2 && text.slice(index - 2, index) === '](') {
    return 'relative-link';
  }
  const prev = index > 0 ? text[index - 1] : '';
  if (prev === '/') return 'path';
  if (prev === '`') return 'code';
  return 'text';
}

/**
 * Scan a single file for ambiguous (bare number) refs. Unambiguous
 * (whole-filename-token) refs are found separately, via buildTokenRewriter().
 *
 * ambiguous: bare patterns like "ADR 0006", "decision 0006", and the hyphen
 * form "ADR-0006"/"ADR-6" — report only, never rewritten (ADR-0011 rule).
 * `reportFile` is the citing file's post-move path (a file that itself moved
 * is reported at its new location); `file` keeps the pre-move relPath used to
 * read the content, for compatibility with existing consumers.
 */
function scanAmbiguous({ relPath, content, movedNums, reportFile }) {
  const ambiguous = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Ambiguous: bare "ADR N" / "ADR NNNN" / "decision NNNN" / "ADR-N" /
    // "ADR-NNNN" patterns — only for moved numbers.
    for (const n of movedNums) {
      const padded = pad(n);
      const bare = String(n);
      const patterns = bare === padded
        ? [
            new RegExp(`\\bADR\\s+${bare}\\b`, 'i'),
            new RegExp(`\\bdecision\\s+${bare}\\b`, 'i'),
            new RegExp(`\\bADR-${bare}\\b`, 'i'),
          ]
        : [
            new RegExp(`\\bADR\\s+${bare}\\b`, 'i'),
            new RegExp(`\\bADR\\s+${padded}\\b`, 'i'),
            new RegExp(`\\bdecision\\s+${padded}\\b`, 'i'),
            new RegExp(`\\bADR-${bare}\\b`, 'i'),
            new RegExp(`\\bADR-${padded}\\b`, 'i'),
          ];

      let matched = false;
      for (const pat of patterns) {
        if (pat.test(line)) { matched = true; break; }
      }
      if (matched) {
        ambiguous.push({
          file: relPath,
          reportFile: reportFile ?? relPath,
          line: lineNum,
          lineText: line,
          num: n,
        });
      }
    }
  }

  return ambiguous;
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
      // Formatting-only additions (F4): discoveredCount/dir/repoRoot mirror
      // the full-plan branch below so formatPlan() can render the same
      // "Discovered N ADRs under <dir>" header and Summary line regardless
      // of which branch produced the plan. excluded/excludedOccurrenceCount
      // are always empty/zero here since no scan runs on this early exit.
      discoveredCount: adrs.length,
      dir,
      repoRoot: findRepoRoot(dir) ?? dirname(dir),
      excluded: [],
      excludedOccurrenceCount: 0,
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

  const wikiCfg = readWikiConfig(repoRoot);
  const trackedFiles = listTrackedFiles(repoRoot);
  const rewriter = buildTokenRewriter(oldToNew);

  // Old repoRoot-relative path -> new repoRoot-relative path, for citing
  // files that are themselves being moved (a moved ADR's own self- or
  // cross-references still need `newFile` to point at its post-move path).
  const movedRelPathToNew = new Map(
    moves.map((m) => [
      joinRel(adrDirRel, m.oldPath ?? m.oldName),
      joinRel(adrDirRel, m.newPath ?? m.newName),
    ]),
  );

  const allUnambiguous = [];
  const allAmbiguous = [];
  const excluded = [];
  const excludedSeen = new Set();
  // Occurrence count (not file count) of frozen-path token hits — the `U`
  // figure in the dry-run Summary line (F4). Counted here, alongside the
  // existing `excluded` file-path list, rather than by re-scanning at
  // format time.
  let excludedOccurrenceCount = 0;

  for (const relPath of trackedFiles) {
    let raw;
    try {
      raw = readFileSync(join(repoRoot, relPath));
    } catch {
      continue;
    }
    if (isBinaryBuffer(raw)) continue;
    const content = raw.toString('utf8');
    const frozen = isFrozenPath(relPath, wikiCfg);

    const { hits } = rewriter(content);
    if (hits.length > 0) {
      if (frozen) {
        if (!excludedSeen.has(relPath)) {
          excludedSeen.add(relPath);
          excluded.push(relPath);
        }
        excludedOccurrenceCount += hits.length;
      } else {
        const lineIndex = buildLineIndex(content);
        const newFile = movedRelPathToNew.get(relPath);
        for (const hit of hits) {
          allUnambiguous.push({
            file: relPath,
            ...(newFile ? { newFile } : {}),
            line: lineForOffset(lineIndex, hit.index),
            kind: classifyTokenKind(content, hit.index),
            oldText: hit.oldText,
            newText: hit.newText,
          });
        }
      }
    }

    // Frozen paths are history: scan-and-list (via `excluded` above) but
    // never included in the ambiguous report either.
    if (!frozen) {
      const reportFile = movedRelPathToNew.get(relPath) ?? relPath;
      allAmbiguous.push(...scanAmbiguous({ relPath, content, movedNums, reportFile }));
    }
  }

  return {
    insertAt,
    highest,
    moves,
    headingEdits,
    unambiguous: allUnambiguous,
    ambiguous: allAmbiguous,
    excluded,
    excludedOccurrenceCount,
    discoveredCount: adrs.length,
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

  const adrDirRel = relative(repoRoot, dir).replace(/\\/g, '/');

  // Old repoRoot-relative path -> move, for every moved ADR.
  const moveByOldRel = new Map(
    plan.moves.map((m) => [joinRel(adrDirRel, m.oldPath ?? m.oldName), m]),
  );

  // Old repoRoot-relative path -> its unambiguous hits (citing files), used
  // only to select which files need recomputing — never to drive the
  // rewrite itself (see below).
  const hitsByFile = new Map();
  for (const ref of plan.unambiguous) {
    if (!hitsByFile.has(ref.file)) hitsByFile.set(ref.file, []);
    hitsByFile.get(ref.file).push(ref);
  }

  // Every file whose content needs recomputing: every moved ADR (for its
  // heading, plus any refs it itself carries), plus every citing file with
  // an unambiguous hit.
  const candidateOldRelPaths = new Set([...moveByOldRel.keys(), ...hitsByFile.keys()]);

  // Re-run the SAME single-pass, boundary-respecting rewriter planRenumber
  // used to detect the hits above. Replaying detected refs one at a time via
  // a plain substring replace (the old design) is unsafe: `String#split`
  // matches `0003-c.md` inside `x0003-c.md` and `0003-c.md.bak` too, which
  // is exactly the token-boundary violation buildTokenRewriter exists to
  // prevent — so the rewrite must go through the same regex, not a re-derived
  // string replace.
  const rewriter = buildTokenRewriter(plan.oldToNew);

  // Compute new content for every candidate, keyed by its FINAL (post-move)
  // path, reading from the OLD (pre-move) path — all reads happen before any
  // git mv runs below, so a moved file's refs are read from where the file
  // still lives, not from where it is about to go.
  const finalContents = new Map();

  for (const oldRel of candidateOldRelPaths) {
    const move = moveByOldRel.get(oldRel);
    const finalRel = move ? joinRel(adrDirRel, move.newPath ?? move.newName) : oldRel;

    let content;
    try {
      content = readFileSync(join(repoRoot, oldRel), 'utf8');
    } catch (err) {
      console.error(`Warning: could not read ${oldRel}: ${err.message}`);
      continue;
    }
    let updated = content;

    if (move) {
      const headingRe = new RegExp(`^# ${pad(move.oldNum)}\\.`, 'm');
      if (headingRe.test(updated)) {
        updated = updated.replace(headingRe, `# ${pad(move.newNum)}.`);
      } else {
        console.error(`Warning: ${oldRel} has no "# ${pad(move.oldNum)}." heading — heading not updated.`);
      }
    }

    if (hitsByFile.has(oldRel)) {
      updated = rewriter(updated).text;
    }

    if (updated !== content) {
      finalContents.set(finalRel, updated);
    }
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

  // Write every changed file to its final (post-move) location.
  const writtenPaths = [];
  for (const [finalRel, content] of finalContents) {
    writeFileSync(join(repoRoot, finalRel), content, 'utf8');
    writtenPaths.push(finalRel);
    console.log(`Updated: ${finalRel}`);
  }

  if (writtenPaths.length > 0) {
    const result = spawnSync('git', ['add', '--', ...writtenPaths], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      console.error('Error: git add failed:');
      console.error(result.stderr || result.stdout);
      process.exit(1);
    }
  }

  // Print ambiguous report (never modified), grouped by file — shares its
  // rendering with the dry-run's ambiguous section (F4).
  if (plan.ambiguous.length > 0) {
    console.log('\n--- Ambiguous references (review manually, NOT auto-fixed) ---');
    const groups = groupByFile(plan.ambiguous, (ref) => ref.reportFile ?? ref.file);
    for (const line of formatGroupedByFile(groups, (ref) => ref.lineText.trim())) {
      console.log(line);
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
// Pure helpers for recursive/themed discovery (#581 task 1), and for the
// single-pass token rewrite and frozen-path exclusion (#581 task 1, wired
// into planRenumber/applyRenumber in task 3). Exported for direct unit
// testing in addition to their use above.
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
 * Group an array of ref-like objects (each carrying a `.line`) by a citing
 * path derived via `keyFn`, preserving first-seen file order. Shared by the
 * dry-run reference-rewrite/ambiguous sections and the --apply ambiguous
 * report, both of which render a "grouped by file" listing.
 * @param {Array<object>} items
 * @param {(item: object) => string} keyFn
 * @returns {Map<string, object[]>}
 */
function groupByFile(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

/**
 * Render a grouped-by-file listing: one `path (N lines): Lx, Ly, …` header
 * per file, followed by each affected line's detail (via `lineFormatter`).
 * @param {Map<string, object[]>} groups
 * @param {(item: object) => string} lineFormatter
 * @returns {string[]}
 */
function formatGroupedByFile(groups, lineFormatter) {
  const out = [];
  for (const [file, items] of groups) {
    const lineNums = items.map((item) => `L${item.line}`).join(', ');
    out.push(`  ${file} (${items.length} lines): ${lineNums}`);
    for (const item of items) {
      out.push(`    L${item.line}: ${lineFormatter(item)}`);
    }
  }
  return out;
}

/**
 * Compute the five Summary figures from a plan (#581 F4):
 *   moves        — plan.moves.length
 *   rewrites     — unambiguous reference-rewrite occurrences
 *   rewriteFiles — distinct citing files among those occurrences
 *   untouched    — frozen-path token occurrences left untouched
 *   ambigLines   — distinct (file, line) pairs among ambiguous refs
 * @param {object} plan
 */
function computeSummary(plan) {
  const rewriteFiles = new Set(plan.unambiguous.map((r) => r.newFile ?? r.file));
  const ambigLines = new Set(plan.ambiguous.map((r) => `${r.reportFile ?? r.file}:${r.line}`));
  return {
    moves: plan.moves.length,
    rewrites: plan.unambiguous.length,
    rewriteFiles: rewriteFiles.size,
    untouched: plan.excludedOccurrenceCount ?? 0,
    ambigLines: ambigLines.size,
  };
}

function formatSummaryLine(s) {
  return `Summary: ${s.moves} moves, ${s.rewrites} reference rewrites in ${s.rewriteFiles} files, ${s.untouched} left untouched, ${s.ambigLines} ambiguous lines`;
}

/**
 * Format a dry-run plan for stdout.
 */
function formatPlan(plan) {
  const lines = ['--- ADR Renumber Dry-Run ---', ''];

  const adrDirRel = plan.repoRoot ? relative(plan.repoRoot, plan.dir).replace(/\\/g, '/') : plan.dir;
  lines.push(`Discovered ${plan.discoveredCount} ADRs under ${adrDirRel}`);

  const summary = computeSummary(plan);

  if (plan.moves.length === 0) {
    lines.push('');
    lines.push(`No moves needed: insert-at ${plan.insertAt} is beyond highest ADR ${plan.highest}.`);
    lines.push('');
    lines.push(formatSummaryLine(summary));
    return lines.join('\n');
  }

  lines.push('');
  lines.push(`Insert slot at: ${plan.insertAt} (highest existing: ${plan.highest})`);
  lines.push('');
  lines.push('File moves (highest-down to avoid collisions):');
  for (const m of plan.moves) {
    lines.push(`  ${joinRel(adrDirRel, m.oldPath ?? m.oldName)} -> ${joinRel(adrDirRel, m.newPath ?? m.newName)}`);
  }

  if (plan.unambiguous.length > 0) {
    lines.push('');
    lines.push('Reference rewrites (grouped by file):');
    const groups = groupByFile(plan.unambiguous, (r) => r.newFile ?? r.file);
    lines.push(...formatGroupedByFile(groups, (r) => `[${r.kind}] "${r.oldText}" -> "${r.newText}"`));
  }

  if (plan.excluded.length > 0) {
    lines.push('');
    lines.push('Left untouched (frozen history — deliberately not rewritten):');
    for (const f of plan.excluded) {
      lines.push(`  ${f}`);
    }
  }

  if (plan.ambiguous.length > 0) {
    lines.push('');
    lines.push('Ambiguous references (review manually, never auto-fixed):');
    const groups = groupByFile(plan.ambiguous, (r) => r.reportFile ?? r.file);
    lines.push(...formatGroupedByFile(groups, (r) => r.lineText.trim()));
  }

  lines.push('');
  lines.push(formatSummaryLine(summary));
  lines.push('');
  lines.push('Re-run with --apply to execute.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

// Compare canonical real paths: a plain resolve() string compare misses the
// same file reached through a Windows 8.3 short name (e.g. a TEMP path) or a
// symlink, and the CLI then silently does nothing and exits 0.
const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync.native(process.argv[1]) === realpathSync.native(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

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
