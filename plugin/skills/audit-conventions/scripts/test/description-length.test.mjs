import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractDescription, descriptionLength, MAX_DESCRIPTION_CHARS } from '../lib/description-length.mjs';

test('extractDescription: no frontmatter returns null', () => {
  assert.equal(extractDescription('# Just markdown, no frontmatter'), null);
});

test('extractDescription: frontmatter without a description returns null', () => {
  const md = `---
name: some-skill
model: haiku
---
Body`;
  assert.equal(extractDescription(md), null);
});

test('extractDescription: plain single-line description', () => {
  const md = `---
name: s
description: A short one-line description.
---
Body`;
  assert.equal(extractDescription(md), 'A short one-line description.');
});

test('extractDescription: quoted single-line description strips quotes', () => {
  const md = `---
name: s
description: "Quoted: with a colon inside."
---`;
  assert.equal(extractDescription(md), 'Quoted: with a colon inside.');
});

test('extractDescription: folded block scalar (>-) joins lines with a space', () => {
  // This is the case the minimal frontmatter parser cannot handle — it would
  // return the literal ">-". The extractor must return the joined text.
  const md = `---
name: s
description: >-
  First line of the description
  wraps across two source lines.
metadata:
  expects: {}
---
Body`;
  assert.equal(
    extractDescription(md),
    'First line of the description wraps across two source lines.',
  );
});

test('extractDescription: folded block ends at the next sibling key, not the body', () => {
  const md = `---
name: s
description: >-
  Only this belongs to the description.
metadata:
  type: reference
---`;
  assert.equal(extractDescription(md), 'Only this belongs to the description.');
});

test('extractDescription: literal block scalar (|) preserves newlines', () => {
  const md = `---
name: s
description: |
  line one
  line two
---`;
  assert.equal(extractDescription(md), 'line one\nline two');
});

test('extractDescription: folded block with a keep-chomp indicator (>+) still folds', () => {
  const md = `---
name: s
description: >+
  keeps trailing newlines in real YAML
  but folds to one line here
metadata: {}
---`;
  assert.equal(
    extractDescription(md),
    'keeps trailing newlines in real YAML but folds to one line here',
  );
});

test('extractDescription: block body indented 4 spaces is stripped by its own indent', () => {
  const md = `---
name: s
description: >-
    four-space indented
    folded body
---`;
  assert.equal(extractDescription(md), 'four-space indented folded body');
});

test('extractDescription: literal block deeper-indented lines keep relative indentation', () => {
  const md = `---
name: s
description: |
  line one
    indented sub-line
---`;
  assert.equal(extractDescription(md), 'line one\n  indented sub-line');
});

test('extractDescription: CRLF line endings parse the same as LF', () => {
  const md = '---\r\nname: s\r\ndescription: >-\r\n  crlf folded\r\n  description body\r\n---\r\n';
  assert.equal(extractDescription(md), 'crlf folded description body');
});

test('extractDescription: a body line that looks like a key stays in the description', () => {
  const md = `---
name: s
description: >-
  Trigger on requests like "do X: then Y".
metadata: {}
---`;
  assert.equal(extractDescription(md), 'Trigger on requests like "do X: then Y".');
});

test('descriptionLength: measures the rendered folded length, not the raw block', () => {
  const md = `---
name: s
description: >-
  aaa
  bbb
---`;
  // Rendered: "aaa bbb" = 7 chars (not the raw multi-line block with indentation).
  assert.equal(descriptionLength(md), 7);
});

test('descriptionLength: zero when there is no description', () => {
  assert.equal(descriptionLength('# nothing here'), 0);
});

test('MAX_DESCRIPTION_CHARS matches the documented skillListingMaxDescChars cap', () => {
  assert.equal(MAX_DESCRIPTION_CHARS, 1536);
});
