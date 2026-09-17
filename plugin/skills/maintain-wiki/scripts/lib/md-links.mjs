// Markdown link extraction + OKF §6.1 resolution, for maintain-wiki's `lint`
// verb and its mechanical conformance checker (#150).
//
// Deliberate duplication, not an oversight: the fence-skipping and
// inline-code-masking helpers below re-implement the same rules
// audit-conventions' own plugin/skills/audit-conventions/scripts/lib/md-scan.mjs
// already provides (iterateUnfencedLines, maskInlineCode). They are NOT
// imported from there. There are currently zero cross-skill imports anywhere
// in this plugin — a published skill is a self-contained unit, and importing
// across skills would couple two independently-versioned surfaces. If the
// masking rules ever need a fix, apply it to both copies by hand.
//
// Pure, except for the existence checks in resolveLink/scanPageLinks (an
// `fs.stat` read). No writes, no process.exit, no console output — callers
// (the `lint` verb, #150's conformance checker) own all reporting.

import { promises as fs } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

// ---- fence + inline-code masking (deliberately duplicated, see header) -----

// Yields every line of `content` that sits OUTSIDE a fenced code block, as
// `{ lineNumber, text }` with a 1-based lineNumber and the raw (untrimmed)
// line text. A line whose trimmed form starts with ``` or ~~~ toggles the
// fence state and is itself never yielded; an unterminated fence at EOF
// simply suppresses the remaining lines.
export function* iterateUnfencedLines(content) {
  const lines = content.split('\n');
  let inFence = false;
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const trimmed = line.trim();
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFence = !inFence;
      continue; // fence delimiter line itself is never scannable content
    }
    if (inFence) continue;

    yield { lineNumber: idx + 1, text: line };
  }
}

// Blanks out backtick-delimited inline code spans on a single line so a
// link-shaped example shown inside them isn't mistaken for a real link.
// Replaces each span with an equal-length run of spaces, so column offsets
// into the returned line still line up with the original.
export function maskInlineCode(line) {
  return line.replace(/(`+)[\s\S]*?\1/g, (span) => ' '.repeat(span.length));
}

// ---- link extraction --------------------------------------------------------

const LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;

// Extracts every wiki-link candidate from a page's `content`. Fenced blocks
// and inline code spans are masked out first (via the two helpers above), so
// a doc that *shows* a link as a documentation example — e.g.
// wiki-schema.template.md's own link-format examples — is never reported.
// External URLs (http:, https:, mailto:) and bare #anchor fragments are
// skipped, since neither is a wiki-link. Pure — no fs access.
//
// Returns `{ lineNumber, rawTarget, target }[]`:
//   - rawTarget: exactly what was written between the parens, fragment
//     included — kept for reporting.
//   - target: rawTarget with a trailing #section fragment stripped and
//     trimmed, ready to hand to resolveLink.
export function extractLinks(content) {
  const links = [];
  for (const { lineNumber, text } of iterateUnfencedLines(content)) {
    const masked = maskInlineCode(text);
    LINK_RE.lastIndex = 0;
    let match;
    while ((match = LINK_RE.exec(masked))) {
      const rawTarget = match[1].trim();
      if (!rawTarget) continue;
      if (rawTarget.startsWith('#')) continue; // bare anchor, not a wiki-link
      if (/^https?:/i.test(rawTarget) || /^mailto:/i.test(rawTarget)) continue; // external

      const target = rawTarget.split('#')[0].trim(); // drop trailing #section
      if (!target) continue; // e.g. "#section" alone — already caught above, but be safe

      links.push({ lineNumber, rawTarget, target });
    }
  }
  return links;
}

// ---- OKF §6.1 resolution -----------------------------------------------------

async function pathExists(absPath) {
  try {
    await fs.stat(absPath);
    return true;
  } catch {
    return false;
  }
}

// True when `childAbs` is `parentAbs` itself, or nested inside it.
// Containment via path.relative, never a substring test — a substring test
// on e.g. '.../wiki' would also match a sibling '.../wiki2/'.
function isWithin(parentAbs, childAbs) {
  const rel = relative(parentAbs, childAbs);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

// Resolves one link `target` (already fragment-stripped — see extractLinks)
// cited from the page at `pageRelPath` (repo-relative, forward-slash),
// per OKF §6.1:
//
//   - A leading '/' is BUNDLE-absolute: resolve against
//     `<repoRoot>/<wikiDir>/`, never the filesystem root. This is the exact
//     failure mode a naive resolver falls into (see this skill's own
//     SKILL.md §6.1 quote, and the "not the filesystem root" note there) —
//     treating it as filesystem-absolute instead.
//   - `./x.md`, `x.md`, `../<subdir>/x.md` are ordinary relative paths,
//     resolved against the LINKING PAGE's own directory — not the bundle
//     root, not repoRoot.
//
// Returns `{ resolvedRelPath, insideBundle, exists }`:
//   - resolvedRelPath: the resolved target, repo-relative, forward-slash.
//   - insideBundle: whether the resolved path is `<wikiDir>/` itself, or
//     nested inside it.
//   - exists: whether the resolved path exists on disk (`fs.stat`, so a
//     directory target counts as existing too).
//
// insideBundle and exists are reported independently, as two separate
// booleans, precisely so a caller can tell OKF §6.1's three relevant cases
// apart without this module collapsing any of them: inside+exists (a good
// link), inside+missing (a dead link), and outside the bundle (a separate
// advisory category — legal per §6.1, but unresolvable to an external OKF
// consumer that receives only the bundle). Whether an outside-bundle target
// also fails to exist on disk is a judgment left to that caller (#150's
// out-of-bundle check), not decided here.
export async function resolveLink(repoRoot, wikiDir, pageRelPath, target) {
  const bundleAbs = resolve(repoRoot, wikiDir);
  const pageDirAbs = dirname(resolve(repoRoot, pageRelPath));

  const resolvedAbs = target.startsWith('/')
    ? resolve(bundleAbs, target.slice(1))
    : resolve(pageDirAbs, target);

  const insideBundle = isWithin(bundleAbs, resolvedAbs);
  const exists = await pathExists(resolvedAbs);
  const resolvedRelPath = relative(repoRoot, resolvedAbs).split('\\').join('/');

  return { resolvedRelPath, insideBundle, exists };
}

// Convenience: extractLinks + resolveLink for every link on one page, in a
// single pass. `content` is the page's already-read text; `pageRelPath`
// locates the page for relative-link resolution and is echoed back in each
// result for reporting.
//
// Returns `{ lineNumber, rawTarget, target, resolvedRelPath, insideBundle,
// exists }[]` — one entry per extracted link, in document order.
export async function scanPageLinks(repoRoot, wikiDir, pageRelPath, content) {
  const links = extractLinks(content);
  const results = [];
  for (const link of links) {
    const resolved = await resolveLink(repoRoot, wikiDir, pageRelPath, link.target);
    results.push({ ...link, ...resolved });
  }
  return results;
}
