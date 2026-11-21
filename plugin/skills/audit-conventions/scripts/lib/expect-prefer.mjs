// Expands a metadata.expects `files` entry into the ordered list of locations
// that may satisfy it (ADR-0070). Pure — no fs access; callers probe the list.
//
//   - A `paths` override for the declared path wins outright: the list is the
//     override alone, existing or not (CONVENTIONS "Runtime path resolution").
//   - Otherwise an entry's optional `prefer` location is probed first, then
//     the declared `path`. The declared path stays the override key.
//   - An entry with no override and no `prefer` is looked up at its wiki-derived
//     default (`docs/TOC.md` -> `<wikiDir>/index.md`, `docs/<rest>` ->
//     `<wikiDir>/<rest>`; see wikiDerivedDefault). The result carries
//     `derived: true` only when that default differs from the declared path.
//   - Which candidate answers, and the stop/pass-over rule, is
//     lib/candidate-resolution.mjs (ADR-0077).
//
// `<wikiDir>` is the one placeholder `prefer` recognises, resolved from
// `wiki.wikiDir` with gvt-wiki's maintain-wiki default (`wiki`). That default
// deliberately differs from the hygiene scanners' "no wikiDir, no wiki":
// `prefer` mirrors where gvt-wiki's maintain-wiki looks.

import { resolveExpectationPath, effectiveWikiDir, wikiDerivedDefault } from './path-overrides.mjs';

const WIKI_DIR_TOKEN = '<wikiDir>';

export function expandPrefer(prefer, wikiDir) {
  if (typeof prefer !== 'string' || prefer.trim() === '') return null;
  // effectiveWikiDir drops a trailing separator, which would print as
  // `wiki//schema.md` in the audit report.
  return prefer.split(WIKI_DIR_TOKEN).join(effectiveWikiDir({ wiki: { wikiDir } }));
}

export function expectationCandidates(entry, { paths, wikiDir } = {}) {
  const resolved = resolveExpectationPath(paths, entry.path);
  const overridden = paths != null && typeof paths === 'object' && Object.hasOwn(paths, entry.path) && resolved === paths[entry.path];
  if (overridden) return { overridden: true, candidates: [resolved] };
  if (entry.prefer === undefined) {
    const derived = wikiDerivedDefault(entry.path, effectiveWikiDir({ wiki: { wikiDir } }));
    if (derived !== entry.path) return { overridden: false, derived: true, candidates: [derived] };
    return { overridden: false, candidates: [entry.path] };
  }
  const prefer = expandPrefer(entry.prefer, wikiDir);
  const candidates = prefer != null && prefer !== entry.path ? [prefer, entry.path] : [entry.path];
  return { overridden: false, candidates };
}
