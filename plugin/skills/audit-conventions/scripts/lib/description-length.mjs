// Skill/agent description length check.
//
// The session skill listing truncates a component `description` at
// `skillListingMaxDescChars` (default 1536). An over-length description is
// silently cut off, degrading the very routing signal the description exists
// for — and nothing in `claude plugin validate` flags it, so descriptions drift
// over the cap (and regress after a trim) unnoticed. This module extracts the
// *rendered* description so the audit can warn the author before truncation bites.
//
// It has its own extractor because the minimal frontmatter parser
// (`frontmatter.mjs`) deliberately does not handle YAML block scalars — for a
// `description: >-` folded block it returns the literal `">-"`, not the text.

export const MAX_DESCRIPTION_CHARS = 1536;

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

// Extract the rendered description string from a skill/agent file's frontmatter,
// or null when there is no frontmatter description. Handles a plain/quoted
// single-line value and YAML block scalars (`>`, `>-`, `>+`, `|`, `|-`, `|+`).
// Folded (`>`) blocks join their lines with a single space, matching how the
// listing measures the collapsed one-line string; literal (`|`) blocks preserve
// newlines. Leading block indentation is stripped either way.
export function extractDescription(content) {
  const fm = content.match(FRONTMATTER_RE);
  if (!fm) return null;

  const lines = fm[1].split(/\r?\n/);
  const idx = lines.findIndex((l) => /^description\s*:/.test(l));
  if (idx === -1) return null;

  const header = lines[idx].replace(/^description\s*:/, '').trim();
  const isBlock = /^[|>][-+]?$/.test(header);
  if (!isBlock) return stripQuotes(header);

  const literal = header[0] === '|';

  // Collect the block body: subsequent lines more-indented than the key. The
  // block's indentation is set by its first non-blank line (YAML rule); strip
  // exactly that many leading spaces from each line, so any indent width works
  // (not just the plugin's 2-space convention). A non-blank line at column 0 is
  // the next sibling key, and a dedent below the block indent likewise ends it.
  const body = [];
  let blockIndent = null;
  for (let i = idx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') {
      body.push('');
      continue;
    }
    const indent = line.length - line.trimStart().length;
    if (indent === 0) break; // next sibling key
    if (blockIndent === null) blockIndent = indent;
    if (indent < blockIndent) break; // dedent ends the block
    body.push(line.slice(blockIndent));
  }
  while (body.length && body[body.length - 1].trim() === '') body.pop();

  return literal
    ? body.join('\n')
    : body.join(' ').replace(/\s+/g, ' ').trim();
}

// Length of the rendered description, or 0 when there is none.
export function descriptionLength(content) {
  const desc = extractDescription(content);
  return desc ? desc.length : 0;
}

function stripQuotes(text) {
  const t = text.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}
