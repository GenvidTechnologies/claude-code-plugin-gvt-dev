// ADR-0015 §2: this module checks *presence* of the wiki practice only —
// never content health (dead links, staleness, orphaned pages). That check
// is a standalone maintain-wiki verb, deliberately never wired into the
// audit because it would risk a non-zero audit exit driven by wiki content
// issues rather than plugin-contract violations. Do not add directory
// listing or file-content calls, or import anything from maintain-wiki,
// here — presence only, via stat-style existence checks. The imports are
// ./expect-prefer.mjs, a pure path-list helper (ADR-0070) that expands an
// expectation into the locations to stat and reads nothing; the two
// presence probes (fileExists, dirExists) from audit-core; and
// ./candidate-resolution.mjs, the shared candidate rule (ADR-0070, ADR-0077),
// whose only audit-core import is probePath, which runs stat then lstat and
// never lists a directory or reads a file. No frontmatter or walking
// machinery is imported.

import { join } from 'node:path';

import { fileExists, dirExists } from '#audit-core';
import { expectationCandidates } from './expect-prefer.mjs';
import { resolveCandidate } from './candidate-resolution.mjs';

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
      schemaPresent(repoRoot, config, wikiDir),
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

// True only when the candidate the audit would accept holds a file, so this
// signal agrees with the audit's own finding (ADR-0070 names a
// detector/audit disagreement as the defect it closed). The candidate list
// encodes the order and the override's no-fallthrough rule; the shared
// resolver then decides each candidate:
//   - a candidate that cannot be examined stops the chain and reads as not
//     present, as the audit reports it;
//   - a wrong-kind or other candidate that is not the last falls through to
//     the next one;
//   - a wrong-kind last candidate gives false.
async function schemaPresent(repoRoot, config, wikiDir) {
  const { candidates } = expectationCandidates(SCHEMA_EXPECTATION, { paths: config?.paths, wikiDir });
  return (await resolveCandidate(repoRoot, SCHEMA_EXPECTATION.path, candidates)).satisfied;
}
