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
// --docs-root: see the footnote printed at the bottom of the report when
// this flag is passed. Short version: lib/hygiene.mjs's listCandidateFiles
// (the root all three scanners below actually walk) is module-private and
// hardcodes 'docs' today, so this flag does NOT change the scan results
// above the footnote — a later task (F2) adds opts.docsRoot support to
// listCandidateFiles, at which point the opts.docsRoot this probe already
// passes through will start being honoured with no changes needed here. In
// the meantime this probe uses the exported, general-purpose
// wikiCandidateFiles(repoRoot, dir, opts) helper (it accepts any directory,
// not just a wiki checkout) to preview what the candidate set at --docs-root
// would look like, without reimplementing the walk.

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
  // opts.docsRoot is passed through even though nothing reads it today (see
  // the file-header note) — forward-compatible with F2, inert until then.
  const scanOpts = docsRoot ? { ...baseOpts, docsRoot } : baseOpts;

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
  const docsCandidates = await wikiCandidateFiles(repoRoot, 'docs', scanOpts);
  const claudeMdIncluded = await fileExists(join(repoRoot, 'CLAUDE.md'));
  console.log('### Candidate-set sizes');
  console.log(
    `  - docs/ markdown candidates (root actually walked by the scanners below): ${docsCandidates.length}`,
  );
  console.log(
    `  - CLAUDE.md ${claudeMdIncluded ? 'present — included as +1 in retired-token/broken-link scans' : 'absent — nothing added'}`,
  );
  if (docsRoot && docsRoot !== 'docs') {
    const previewCandidates = await wikiCandidateFiles(repoRoot, docsRoot, scanOpts);
    console.log(
      `  - PREVIEW ONLY — candidates under --docs-root '${docsRoot}' if the walk were pointed there: ${previewCandidates.length} ` +
        `(the scanner runs below still walked 'docs', not '${docsRoot}' — see the footnote)`,
    );
  }
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

  if (docsRoot) {
    console.log('NOTE on --docs-root: opts.docsRoot was passed through to every scanner call above,');
    console.log("but lib/hygiene.mjs's listCandidateFiles (the root all three scanners actually walk)");
    console.log("is module-private and hardcodes 'docs' today — this flag has NO EFFECT on the scan");
    console.log('results above (only on the PREVIEW candidate-set line, which uses the exported');
    console.log('wikiCandidateFiles helper instead). A later task (F2) adds opts.docsRoot support to');
    console.log('listCandidateFiles; once that lands this same call starts honouring it with no');
    console.log('changes needed here.');
    console.log('');
  }
}

main().catch((err) => {
  console.error('hygiene-probe failed:', err);
  process.exit(1);
});
