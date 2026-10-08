// ADR-0015 §2: this module checks *presence* of the wiki practice only —
// never content health (dead links, staleness, orphaned pages). That check
// is a standalone maintain-wiki verb, deliberately never wired into the
// audit because it would risk a non-zero audit exit driven by wiki content
// issues rather than plugin-contract violations. Do not add directory
// listing or file-content calls, or import anything from maintain-wiki,
// here — presence only, via stat-style existence checks. The one sibling
// import is ./expect-prefer.mjs, a pure path-list helper (ADR-0070): it
// expands an expectation into the locations to stat and reads nothing.

import { promises as fs } from 'node:fs';
import { join } from 'node:path';

import { expectationCandidates } from './expect-prefer.mjs';

const DEFAULT_WIKI_DIR = 'wiki';
const DEFAULT_RAW_DIR = 'raw';
// The schema expectation exactly as maintain-wiki's SKILL.md frontmatter
// declares it (ADR-0070). practice-detect.test.mjs pins this object against
// that frontmatter, so the two cannot drift apart silently.
export const SCHEMA_EXPECTATION = Object.freeze({ path: 'docs/wiki-schema.md', prefer: '<wikiDir>/schema.md' });

export const VERDICT_ABSENT = 'absent';
export const VERDICT_PARTIAL = 'partial';
export const VERDICT_ADOPTED = 'adopted';

export async function detectWikiAdoption(repoRoot, config) {
  // A blank wikiDir means the default, as it does for the schema candidates
  // (expect-prefer), so every signal below probes the same directory.
  const configured = config?.wiki?.wikiDir;
  const wikiDir = typeof configured === 'string' && configured.trim() !== '' ? configured : DEFAULT_WIKI_DIR;
  const rawDir = config?.wiki?.rawDir ?? DEFAULT_RAW_DIR;

  const [wikiDirPresent, indexPresent, logPresent, rawDirPresent, schemaDocPresent] =
    await Promise.all([
      dirExists(join(repoRoot, wikiDir)),
      fileExists(join(repoRoot, wikiDir, 'index.md')),
      fileExists(join(repoRoot, wikiDir, 'log.md')),
      dirExists(join(repoRoot, rawDir)),
      firstExisting(repoRoot, expectationCandidates(SCHEMA_EXPECTATION, { paths: config?.paths, wikiDir }).candidates),
    ]);

  const signals = {
    wikiDir: wikiDirPresent,
    index: indexPresent,
    log: logPresent,
    rawDir: rawDirPresent,
    schemaDoc: schemaDocPresent,
    configBlock: config?.wiki !== undefined,
  };

  const presentCount = Object.values(signals).filter(Boolean).length;
  const verdict =
    presentCount === 0
      ? VERDICT_ABSENT
      : presentCount === Object.keys(signals).length
        ? VERDICT_ADOPTED
        : VERDICT_PARTIAL;

  return { signals, verdict };
}

// True when any candidate exists. The candidate list already encodes the
// order and the override's no-fallthrough rule, so presence is all this needs.
async function firstExisting(repoRoot, candidates) {
  for (const candidate of candidates) {
    if (await fileExists(join(repoRoot, candidate))) return true;
  }
  return false;
}

async function fileExists(path) {
  try {
    const s = await fs.stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

async function dirExists(path) {
  try {
    const s = await fs.stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}
