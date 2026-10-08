// Expands a metadata.expects `files` entry into the ordered list of locations
// that may satisfy it (ADR-0070). Pure — no fs access; callers probe the list.
//
//   - A `paths` override for the declared path wins outright: the list is the
//     override alone, existing or not (CONVENTIONS "Runtime path resolution").
//   - Otherwise an entry's optional `prefer` location is probed first, then
//     the declared `path`. The declared path stays the override key.
//
// `<wikiDir>` is the one placeholder `prefer` recognises, resolved from
// `wiki.wikiDir` with maintain-wiki's own default (`wiki`). That default
// deliberately differs from the hygiene scanners' "no wikiDir, no wiki":
// `prefer` mirrors where maintain-wiki itself looks.

import { resolveExpectationPath } from './path-overrides.mjs';

export const DEFAULT_WIKI_DIR = 'wiki';
const WIKI_DIR_TOKEN = '<wikiDir>';

export function expandPrefer(prefer, wikiDir) {
  if (typeof prefer !== 'string' || prefer.trim() === '') return null;
  const dir = typeof wikiDir === 'string' && wikiDir.trim() !== '' ? wikiDir : DEFAULT_WIKI_DIR;
  return prefer.split(WIKI_DIR_TOKEN).join(dir);
}

export function expectationCandidates(entry, { paths, wikiDir } = {}) {
  const resolved = resolveExpectationPath(paths, entry.path);
  const overridden = paths != null && typeof paths === 'object' && Object.hasOwn(paths, entry.path) && resolved === paths[entry.path];
  if (overridden) return { overridden: true, candidates: [resolved] };
  const prefer = expandPrefer(entry.prefer, wikiDir);
  const candidates = prefer != null && prefer !== entry.path ? [prefer, entry.path] : [entry.path];
  return { overridden: false, candidates };
}
