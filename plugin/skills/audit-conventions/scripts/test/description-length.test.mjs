import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderedDescription, descriptionLength, MAX_DESCRIPTION_CHARS } from '../lib/description-length.mjs';

test('renderedDescription: no frontmatter returns null', () => {
  assert.equal(renderedDescription('# Just markdown, no frontmatter'), null);
});

test('renderedDescription: frontmatter without a description returns null', () => {
  const md = `---
name: some-skill
model: haiku
---
Body`;
  assert.equal(renderedDescription(md), null);
});

test('renderedDescription: plain single-line description', () => {
  const md = `---
name: s
description: A short one-line description.
---
Body`;
  assert.equal(renderedDescription(md), 'A short one-line description.');
});

test('renderedDescription: quoted single-line description strips quotes', () => {
  const md = `---
name: s
description: "Quoted: with a colon inside."
---`;
  assert.equal(renderedDescription(md), 'Quoted: with a colon inside.');
});

test('renderedDescription: folded block scalar (>-) joins lines with a space', () => {
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
    renderedDescription(md),
    'First line of the description wraps across two source lines.',
  );
});

test('renderedDescription: folded block ends at the next sibling key, not the body', () => {
  const md = `---
name: s
description: >-
  Only this belongs to the description.
metadata:
  type: reference
---`;
  assert.equal(renderedDescription(md), 'Only this belongs to the description.');
});

test('renderedDescription: literal block scalar (|) preserves newlines', () => {
  const md = `---
name: s
description: |
  line one
  line two
---`;
  assert.equal(renderedDescription(md), 'line one\nline two');
});

test('renderedDescription: folded block with a keep-chomp indicator (>+) still folds', () => {
  const md = `---
name: s
description: >+
  keeps trailing newlines in real YAML
  but folds to one line here
metadata: {}
---`;
  assert.equal(
    renderedDescription(md),
    'keeps trailing newlines in real YAML but folds to one line here',
  );
});

test('renderedDescription: block body indented 4 spaces is stripped by its own indent', () => {
  const md = `---
name: s
description: >-
    four-space indented
    folded body
---`;
  assert.equal(renderedDescription(md), 'four-space indented folded body');
});

test('renderedDescription: literal block deeper-indented lines keep relative indentation', () => {
  const md = `---
name: s
description: |
  line one
    indented sub-line
---`;
  assert.equal(renderedDescription(md), 'line one\n  indented sub-line');
});

test('renderedDescription: CRLF line endings parse the same as LF', () => {
  const md = '---\r\nname: s\r\ndescription: >-\r\n  crlf folded\r\n  description body\r\n---\r\n';
  assert.equal(renderedDescription(md), 'crlf folded description body');
});

test('renderedDescription: a body line that looks like a key stays in the description', () => {
  const md = `---
name: s
description: >-
  Trigger on requests like "do X: then Y".
metadata: {}
---`;
  assert.equal(renderedDescription(md), 'Trigger on requests like "do X: then Y".');
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
