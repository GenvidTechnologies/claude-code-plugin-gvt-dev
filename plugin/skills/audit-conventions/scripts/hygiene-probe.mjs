#!/usr/bin/env node
// Dev-only probe for the audit-conventions hygiene scanners. NOT wired into
// audit.mjs, commands.validate, or any skill — run directly with `node`.
//
// Why this exists: every finding-count figure behind this change's design
// (widening the candidate-set walk, adding a wiki tier, etc.) was previously
// obtained by copying lib/ to a scratchpad, hand-patching the walk, and
// running the scanners against a real repo — a throwaway harness, rebuilt
// and discarded each time the question came up. Four open issues (#281,
// #232, #233, #360) all turn on the same question — "what would this
// scanner change do to a consumer's repo?" — so this lands the harness as a
// reusable tool instead of re-discarding it again.
//
// It imports and calls only the already-exported pure functions from
// lib/hygiene.mjs and lib/path-overrides.mjs. It does not reimplement any
// scanner or walk logic.
//
// Usage:
//   node hygiene-probe.mjs [repoPath] [--docs-root <dir>] [--wiki-dir <dir>]
//
// repoPath defaults to cwd. --wiki-dir additionally lists wiki candidates via
// wikiCandidateFiles (landed in commit 10e4522) — not yet wired into any
// scanner call.
//
// --docs-root: relocates the walk root the three scanners below actually use
// (lib/hygiene.mjs's listCandidateFiles, via opts.docsRoot — landed in F2/
// #384) away from the 'docs' default, so this flag DOES change the scan
// results above. The PREVIEW line under "Candidate-set sizes" additionally
// uses the exported, general-purpose wikiCandidateFiles(repoRoot, dir, opts)
// helper (it accepts any directory, not just a wiki checkout) to show the
// docsRoot candidate count next to the default-root one, without
// reimplementing the walk.

import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  scanRetiredTokens,
  scanBrokenLinks,
  scanOrphanedDocs,
  wikiCandidateFiles,
  DEFAULT_RETIRED_TOKENS,
  DEFAULT_EXCLUDE_PATHS,
} from './lib/hygiene.mjs';

function parseArgs(argv) {
  const args = { repoPath: undefined, docsRoot: undefined, wikiDir: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--docs-root') {
      args.docsRoot = argv[++i];
    } else if (arg === '--wiki-dir') {
      args.wikiDir = argv[++i];
    } else if (!args.repoPath) {
      args.repoPath = arg;
    }
  }
  return args;
}

// Mirrors audit.mjs's own loadHygieneConfig (graceful — missing file, missing
// key, or invalid JSON all resolve to undefined so the scanners fall back to
// their own baked-in defaults).
async function loadHygieneConfig(repoRoot) {
  try {
    const raw = await fs.readFile(join(repoRoot, '.gvt-agent.json'), 'utf8');
    return JSON.parse(raw).hygiene;
  } catch {
    return undefined;
  }
}

async function fileExists(path) {
  try {
    const s = await fs.stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

function printFindings(name, findings) {
  console.log(`### ${name} — ${findings.length} finding${findings.length === 1 ? '' : 's'}`);
  for (const f of findings) {
    const loc = f.file ? `${f.file}:${f.line ?? '?'} ` : '';
    console.log(`  - ${loc}${f.detail}`);
  }
  console.log('');
}

async function main() {
  const { repoPath, docsRoot, wikiDir } = parseArgs(process.argv.slice(2));
  const repoRoot = resolve(repoPath ?? process.cwd());

  const hygiene = await loadHygieneConfig(repoRoot);
  const baseOpts = { retiredTokens: hygiene?.retiredTokens, excludePaths: hygiene?.excludePaths };
  const scanOpts = docsRoot ? { ...baseOpts, docsRoot } : baseOpts;
  const effectiveDocsRoot = docsRoot ?? 'docs';

  console.log('## hygiene-probe');
  console.log('');
  console.log(`repo:      ${repoRoot}`);
  console.log(`docs-root: ${docsRoot ?? 'docs (default)'}`);
  console.log(`wiki-dir:  ${wikiDir ?? '(none)'}`);
  console.log(`retiredTokens: ${JSON.stringify(scanOpts.retiredTokens ?? DEFAULT_RETIRED_TOKENS)}`);
  console.log(`excludePaths:  ${JSON.stringify([...DEFAULT_EXCLUDE_PATHS, ...(scanOpts.excludePaths ?? [])])}`);
  console.log('');

  // Candidate-set sizes, so a zero-finding scanner below reads as "scanned
  // and clean" rather than "scanned nothing". listCandidateFiles itself is
  // module-private and not exported, so we approximate its docs-tier half via
  // the exported, general-purpose wikiCandidateFiles(repoRoot, dir, opts) —
  // it applies the identical listMarkdown-plus-excludePaths walk to whatever
  // directory it's given. It omits the one thing listCandidateFiles adds on
  // top (the repo-root CLAUDE.md), which is reported separately below.
  //
  // effectiveDocsRoot mirrors opts.docsRoot ?? 'docs' — the exact root the
  // scanner calls below actually walk (opts.docsRoot is honored by
  // listCandidateFiles as of F2/#384), so this line reports the real
  // candidate set, not a preview of one.
  const docsCandidates = await wikiCandidateFiles(repoRoot, effectiveDocsRoot, scanOpts);
  const claudeMdIncluded = await fileExists(join(repoRoot, 'CLAUDE.md'));
  console.log('### Candidate-set sizes');
  console.log(
    `  - ${effectiveDocsRoot}/ markdown candidates (root actually walked by the scanners below): ${docsCandidates.length}`,
  );
  console.log(
    `  - CLAUDE.md ${claudeMdIncluded ? 'present — included as +1 in retired-token/broken-link scans' : 'absent — nothing added'}`,
  );
  if (wikiDir) {
    const wikiCandidates = await wikiCandidateFiles(repoRoot, wikiDir, scanOpts);
    console.log(`  - wiki candidates under --wiki-dir '${wikiDir}': ${wikiCandidates.length}`);
  }
  console.log('');

  const retiredTokenFindings = await scanRetiredTokens(repoRoot, scanOpts);
  printFindings('scanRetiredTokens', retiredTokenFindings);

  const brokenLinkFindings = await scanBrokenLinks(repoRoot, scanOpts);
  printFindings('scanBrokenLinks', brokenLinkFindings);

  const orphanedDocFindings = await scanOrphanedDocs(repoRoot, scanOpts);
  printFindings('scanOrphanedDocs', orphanedDocFindings);

  if (wikiDir) {
    const wikiCandidates = await wikiCandidateFiles(repoRoot, wikiDir, scanOpts);
    console.log(
      `### wikiCandidateFiles('${wikiDir}') — ${wikiCandidates.length} candidate file${wikiCandidates.length === 1 ? '' : 's'}`,
    );
    for (const f of wikiCandidates) console.log(`  - ${f}`);
    console.log('');
    console.log(
      'NOTE: wikiCandidateFiles is not wired into any scanner call above (ADR-0015 decision 2 /',
    );
    console.log('commit 10e4522) — this only lists the candidate set it would produce.');
    console.log('');
  }
}

main().catch((err) => {
  console.error('hygiene-probe failed:', err);
  process.exit(1);
});
