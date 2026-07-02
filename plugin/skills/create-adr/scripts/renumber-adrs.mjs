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
 * Parse ADR filename into { num, slug } or null.
 */
function parseAdrName(name) {
  const m = ADR_FILENAME_RE.exec(name);
  if (!m) return null;
  return { num: parseInt(m[1], 10), slug: m[2], name };
}

/**
 * Zero-pad a number to 4 digits.
 */
function pad(n) {
  return String(n).padStart(4, '0');
}

/**
 * List all ADR files in dir, sorted by number ascending.
 * Returns [{ num, slug, name }]
 */
function listAdrs(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .map(parseAdrName)
    .filter(Boolean)
    .sort((a, b) => a.num - b.num);
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
  const adrs = listAdrs(dir);
  const highest = adrs.length > 0 ? adrs[adrs.length - 1].num : 0;

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
    const oldName = `${pad(oldNum)}-${adr.slug}.md`;
    const newName = `${pad(newNum)}-${adr.slug}.md`;
    moves.push({
      oldNum,
      newNum,
      oldName,
      newName,
      slug: adr.slug,
    });
  }

  // Heading edits: for each moved file, update `# NNNN. ` heading
  const headingEdits = moves.map((m) => ({
    filename: m.newName, // the file after rename
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

  // Perform git mv highest-down (moves are already in that order)
  for (const move of plan.moves) {
    const oldPath = join(dir, move.oldName);
    const newPath = join(dir, move.newName);
    const result = spawnSync('git', ['mv', oldPath, newPath], {
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
  const { values } = parseArgs({
    options: {
      dir: { type: 'string' },
      'insert-at': { type: 'string' },
      apply: { type: 'boolean', default: false },
    },
  });

  const dir = values['dir'];
  const insertAt = parseInt(values['insert-at'], 10);

  if (!dir || isNaN(insertAt)) {
    console.error('Usage: node renumber-adrs.mjs --dir <adr-dir> --insert-at <N> [--apply]');
    process.exit(1);
  }

  const absDir = resolve(dir);

  if (values['apply']) {
    applyRenumber({ dir: absDir, insertAt });
  } else {
    const plan = planRenumber({ dir: absDir, insertAt });
    console.log(formatPlan(plan));
  }
}
