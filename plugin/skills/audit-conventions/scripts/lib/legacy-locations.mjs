// Finds documents that sit at a 5.x `docs/` location the wiki default replaced.
//
// A declared `docs/...` expectation is looked up at its wiki-derived location
// when the repo sets no override (lib/path-overrides.mjs, wikiDerivedDefault).
// A repo that kept its documents at the declared `docs/` path would otherwise
// see them go unread without a word. legacyLocations lists those paths;
// legacyLocationFindings turns them into one warning each.
//
// Presence only, like the rest of the audit: each location is examined with
// resolveCandidate (lib/candidate-resolution.mjs), the probe the expectation
// check uses, so "exists" means "exists with the expected kind".

import { resolveDeclaredPath } from './path-overrides.mjs';
import { resolveCandidate } from './candidate-resolution.mjs';

const holdsExpectedKind = async (repoRoot, declaredPath, location) =>
  (await resolveCandidate(repoRoot, declaredPath, [location])).satisfied;

// `entries` are the declared `files` expectation entries ({ path, prefer, ... }).
// The kind (file or directory) is the declared path's trailing slash, as in
// resolveCandidate. Returns [{ declared, derived, derivedExists }], one per
// declared path, in first-seen order.
export async function legacyLocations(repoRoot, config, entries) {
  const found = [];
  const seen = new Set();
  for (const entry of entries ?? []) {
    const declared = entry?.path;
    if (typeof declared !== 'string' || !declared.startsWith('docs/') || seen.has(declared)) continue;
    seen.add(declared);

    // 'wiki-default' only: an override, a `prefer` entry, and a derived path
    // equal to the declared one all resolve to something else.
    const resolved = resolveDeclaredPath(config, declared, { prefer: entry.prefer });
    if (resolved.from !== 'wiki-default') continue;
    if (!(await holdsExpectedKind(repoRoot, declared, declared))) continue;

    found.push({
      declared,
      derived: resolved.path,
      derivedExists: await holdsExpectedKind(repoRoot, declared, resolved.path),
    });
  }
  return found;
}

// One `legacy-location` warning per path. The finding is self-contained: the
// report prints `detail` as it is.
export function legacyLocationFindings(locations) {
  return locations.map(({ declared, derived, derivedExists }) => {
    const resolution =
      `Set paths['${declared}'] to "${declared}" in .gvt-agent.json to keep the 5.x location, ` +
      `or move the content to \`${derived}\`.`;
    const detail = derivedExists
      ? `\`${declared}\` and \`${derived}\` both hold content: the wiki-derived location \`${derived}\` is used; \`${declared}\` is no longer read. ${resolution}`
      : `\`${declared}\` holds content at the 5.x location, but the wiki-derived location \`${derived}\` is what the audit reads. ${resolution}`;
    return { kind: 'legacy-location', ok: false, severity: 'warning', detail, declared, derived };
  });
}
