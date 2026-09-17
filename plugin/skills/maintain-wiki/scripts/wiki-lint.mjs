#!/usr/bin/env node
// CLI entrypoint for maintain-wiki's `lint` verb (#150). Sits beside its own
// lib/, mirroring how audit-conventions/scripts/audit.mjs sits beside its own
// lib/ — this is the first non-pure file in this skill's scripts/ tree.
//
// Formatting and printing live here on purpose: checks.mjs and git-raw.mjs
// are pure (no writes, no process.exit, no console output) so they stay unit
// testable without a subprocess. This file's only job is to resolve config,
// call the pure checks, and render what they return.
//
// Usage:
//   node wiki-lint.mjs [repoPath]
//
// repoPath defaults to cwd, matching hygiene-probe.mjs's shape. No flags —
// there is nothing here to parametrize yet.
//
// --strict does not exist in this pass, deliberately, not as an oversight.
// OKF §11 forbids an OKF consumer from rejecting a bundle, and #150 states
// the `lint` verb itself as "advisory / non-zero-exit-neutral by default (it
// reports; it does not fail a build unless explicitly asked to)" — the
// "unless explicitly asked" half is a documented future seam (a --strict
// flag some caller could opt into), not something this task implements.
// This entrypoint always exits 0; see the bottom of this file.

import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';

import { lintWiki } from './lib/checks.mjs';
import { wikiAllMarkdown } from './lib/wiki-pages.mjs';
import { checkRawImmutability } from './lib/git-raw.mjs';

// The two "could not check" finding kinds the lib modules return, as
// distinct from a real, positive finding. checks.mjs's checkOrphanedPages
// and git-raw.mjs's checkRawImmutability each return exactly one of these
// (never mixed with real findings from the same check) when the check
// itself could not run at all — a missing wiki/index.md, git not installed,
// no git repo, or no history under rawDir/. Printing these findings exactly
// like any other would collapse "checked, found nothing" and "never ran"
// into the same "0 findings" reading, which is the defect this whole plan
// (ADR-0053's inapplicable-vs-passed distinction) exists to remove.
const SKIP_KINDS = new Set([
  'orphan-check-skipped',
  'raw-immutability-check-skipped',
  'link-check-skipped',
]);

function parseArgs(argv) {
  const args = { repoPath: undefined };
  for (const arg of argv) {
    if (!args.repoPath) args.repoPath = arg;
  }
  return args;
}

// Missing or unparseable .gvt-agent.json must not crash the CLI — it falls
// back to the wiki.wikiDir/wiki.rawDir defaults ('wiki'/'raw') and the
// caller is told so in `loaded`, which main() renders as a note.
async function loadWikiConfig(repoRoot) {
  try {
    const raw = await fs.readFile(join(repoRoot, '.gvt-agent.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return { wiki: parsed.wiki, loaded: true };
  } catch {
    return { wiki: undefined, loaded: false };
  }
}

// Renders one check-family's findings under a heading. Skip findings (see
// SKIP_KINDS) are always printed first and flagged distinctly, so a reader
// scanning the report sees "could not check" rather than mistaking it for a
// clean result. "checked — clean" is only ever printed when there is
// neither a real finding NOR a skip finding for this section.
function printGroup(title, findings) {
  const skipped = findings.filter((f) => SKIP_KINDS.has(f.kind));
  const real = findings.filter((f) => !SKIP_KINDS.has(f.kind));

  console.log(`### ${title}`);
  for (const f of skipped) {
    console.log(`  [SKIPPED — could not check] ${f.detail}`);
  }
  if (real.length === 0 && skipped.length === 0) {
    console.log('  checked — clean, 0 findings');
  } else if (real.length > 0) {
    console.log(`  ${real.length} finding${real.length === 1 ? '' : 's'}:`);
    for (const f of real) {
      console.log(`  - ${f.detail}`);
    }
  }
  console.log('');
}

async function main() {
  const { repoPath } = parseArgs(process.argv.slice(2));
  const repoRoot = resolve(repoPath ?? process.cwd());

  const { wiki, loaded } = await loadWikiConfig(repoRoot);
  const wikiDir = wiki?.wikiDir ?? 'wiki';
  const rawDir = wiki?.rawDir ?? 'raw';

  console.log('## wiki-lint');
  console.log('');
  console.log(`repo:    ${repoRoot}`);
  console.log(`wikiDir: ${wikiDir}${wiki?.wikiDir ? '' : ' (default)'}`);
  console.log(`rawDir:  ${rawDir}${wiki?.rawDir ? '' : ' (default)'}`);
  if (!loaded) {
    console.log(
      'note:    .gvt-agent.json is missing or could not be parsed — falling back to the defaults above',
    );
  }
  console.log('');

  // The three wiki checks, via the aggregate lintWiki(repoRoot, wikiDir)
  // rather than calling checkDeadLinks/checkOutOfBundleLinks/
  // checkOrphanedPages individually — there is no reason to run them
  // separately here, since grouping the returned findings by `kind` (below)
  // gives the same per-section report without three round trips.
  const wikiFindings = await lintWiki(repoRoot, wikiDir);
  const deadLinks = wikiFindings.filter((f) => f.kind === 'dead-link');
  const outOfBundle = wikiFindings.filter((f) => f.kind === 'out-of-bundle-link');
  const orphanFamily = wikiFindings.filter((f) =>
    ['orphaned-page', 'unreachable-subtree', 'orphan-check-skipped'].includes(f.kind),
  );

  // How many pages the link checks actually had to read. The two link checks
  // return findings, so an empty result from them is genuinely ambiguous —
  // it means "every link resolved" over a real corpus, and equally "there
  // were no pages at all" when <wikiDir>/ is absent, empty, or degenerate.
  // Rendering the second as "checked — clean" would assert a clean bill of
  // health over a bundle this run never opened, which is the same
  // scanned-nothing-versus-scanned-and-clean conflation the orphan and raw
  // checks each return an explicit skip finding to avoid. The count is the
  // only thing that separates them here, so the CLI reads it rather than
  // inferring health from an empty array.
  const pageCount = (await wikiAllMarkdown(repoRoot, wikiDir)).length;
  const emptyCorpusSkip = {
    kind: 'link-check-skipped',
    ok: false,
    severity: 'info',
    detail: `no markdown pages found under ${wikiDir}/ — nothing to link-check (the directory is absent, empty, or the configured wikiDir is unusable)`,
  };

  const deadLinksShown = pageCount === 0 ? [emptyCorpusSkip] : deadLinks;
  const outOfBundleShown = pageCount === 0 ? [emptyCorpusSkip] : outOfBundle;

  printGroup('Dead links', deadLinksShown);
  printGroup('Out-of-bundle links (advisory)', outOfBundleShown);
  printGroup('Orphaned pages / unreachable subtrees', orphanFamily);

  // checkRawImmutability is synchronous (see git-raw.mjs's header) — `await`
  // on its already-resolved array is transparent and simply hands it back,
  // so this composes with the async checks above without a `.then()`, which
  // would break on a non-Promise return.
  const rawFindings = await checkRawImmutability(repoRoot, rawDir);
  printGroup(`raw/ immutability (optional, rawDir=${rawDir})`, rawFindings);

  // Tally what was actually PRINTED, not what lintWiki returned — otherwise
  // the summary line and the sections above it can disagree, with the
  // sections showing two skips while the summary reports none.
  const allFindings = [
    ...deadLinksShown,
    ...outOfBundleShown,
    ...orphanFamily,
    ...rawFindings,
  ];
  const realCount = allFindings.filter((f) => !SKIP_KINDS.has(f.kind)).length;
  const skippedCount = allFindings.filter((f) => SKIP_KINDS.has(f.kind)).length;
  console.log(
    `## summary: ${realCount} finding${realCount === 1 ? '' : 's'}, ${skippedCount} check${
      skippedCount === 1 ? '' : 's'
    } could not run`,
  );
}

// Always exits 0. `lint` is advisory per OKF §11 and #150's own framing
// (see this file's header) — a wiki with findings, or even a wiki-lint run
// that hits an unexpected internal error, must never fail a caller's build.
// An unexpected error is still surfaced on stderr (so it isn't silently
// lost), it just doesn't change the exit code.
main()
  .catch((err) => {
    console.error('wiki-lint: unexpected error —', err);
  })
  .finally(() => {
    process.exitCode = 0;
  });
