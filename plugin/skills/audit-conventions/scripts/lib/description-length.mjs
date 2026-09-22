// Skill/agent description length check.
//
// The session skill listing truncates a component `description` at
// `skillListingMaxDescChars` (default 1536). An over-length description is
// silently cut off, degrading the very routing signal the description exists
// for — and nothing in `claude plugin validate` flags it, so descriptions drift
// over the cap (and regress after a trim) unnoticed. This module extracts the
// *rendered* description so the audit can warn the author before truncation bites.
//
// Parsing is delegated entirely to the shared frontmatter parser
// (`frontmatter.mjs`), which understands YAML block scalars (`>`, `>-`, `>+`,
// `|`, `|-`, `|+`) with chomping. `renderedDescription` is a thin adapter over
// it: it trims the parsed value, since the skill listing renders the
// description as a single line and a `clip`/`keep`-chomped block scalar can
// carry a trailing newline that a raw length count would otherwise include.

import { extractFrontmatter } from './frontmatter.mjs';

export const MAX_DESCRIPTION_CHARS = 1536;

// Extract the rendered description string from a skill/agent file's
// frontmatter, or null when there is no frontmatter or no description key.
export function renderedDescription(content) {
  return renderedDescriptionOf(extractFrontmatter(content));
}

// Length of the rendered description, or 0 when there is none.
export function descriptionLength(content) {
  const desc = renderedDescription(content);
  return desc ? desc.length : 0;
}

// Same rendering/trimming adapter as renderedDescription, but starting from
// an already-parsed frontmatter object rather than re-extracting it from raw
// content. renderedDescription is defined in terms of this function, so the
// two stay provably equivalent by construction rather than by duplicated
// logic. Lets a caller that already parsed frontmatter (component-walk.mjs)
// avoid a second parse of the same file.
export function renderedDescriptionOf(fm) {
  const description = fm?.description;
  return typeof description === 'string' ? description.trim() : null;
}

// Length equivalent of descriptionLength, but starting from an already-parsed
// frontmatter object (or null) instead of raw content.
export function descriptionLengthOf(fm) {
  const desc = renderedDescriptionOf(fm);
  return desc ? desc.length : 0;
}
