// ADR-0015 §2: this module checks *presence* of the wiki practice only —
// never content health (dead links, staleness, orphaned pages). That check
// is a standalone maintain-wiki verb, deliberately never wired into the
// audit because it would risk a non-zero audit exit driven by wiki content
// issues rather than plugin-contract violations. Do not add directory
// listing or file-content calls, or import anything from maintain-wiki,
// here — presence only, via stat-style existence checks.

import { promises as fs } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_WIKI_DIR = 'wiki';
const DEFAULT_RAW_DIR = 'raw';
const SCHEMA_DOC = 'docs/wiki-schema.md';

export const VERDICT_ABSENT = 'absent';
export const VERDICT_PARTIAL = 'partial';
export const VERDICT_ADOPTED = 'adopted';

export async function detectWikiAdoption(repoRoot, config) {
  const wikiDir = config?.wiki?.wikiDir ?? DEFAULT_WIKI_DIR;
  const rawDir = config?.wiki?.rawDir ?? DEFAULT_RAW_DIR;

  const [wikiDirPresent, indexPresent, logPresent, rawDirPresent, schemaDocPresent] =
    await Promise.all([
      dirExists(join(repoRoot, wikiDir)),
      fileExists(join(repoRoot, wikiDir, 'index.md')),
      fileExists(join(repoRoot, wikiDir, 'log.md')),
      dirExists(join(repoRoot, rawDir)),
      fileExists(join(repoRoot, SCHEMA_DOC)),
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
