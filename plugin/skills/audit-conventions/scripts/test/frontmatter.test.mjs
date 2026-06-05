import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractFrontmatter, parseYaml } from '../lib/frontmatter.mjs';

test('extractFrontmatter: missing frontmatter returns null', () => {
  assert.equal(extractFrontmatter('# Just a markdown file'), null);
});

test('extractFrontmatter: parses simple top-level keys', () => {
  const md = `---
name: validate-changes
description: A test description
model: haiku
---

# Body
`;
  const fm = extractFrontmatter(md);
  assert.equal(fm.name, 'validate-changes');
  assert.equal(fm.description, 'A test description');
  assert.equal(fm.model, 'haiku');
});

test('parseYaml: nested object', () => {
  const yaml = `metadata:
  type: feedback
  scope: global`;
  const out = parseYaml(yaml);
  assert.deepEqual(out, { metadata: { type: 'feedback', scope: 'global' } });
});

test('parseYaml: array of objects in metadata.expects.files', () => {
  const yaml = `metadata:
  expects:
    files:
      - path: CLAUDE.md
        reason: Project context lives here
      - path: docs/TOC.md
        required: false
        reason: Used if present`;
  const out = parseYaml(yaml);
  assert.deepEqual(out, {
    metadata: {
      expects: {
        files: [
          { path: 'CLAUDE.md', reason: 'Project context lives here' },
          { path: 'docs/TOC.md', required: false, reason: 'Used if present' },
        ],
      },
    },
  });
});

test('parseYaml: full skill frontmatter shape', () => {
  const yaml = `name: plan-task
description: A multi-paragraph description that mentions things like "config keys" and (parentheses).
metadata:
  expects:
    files:
      - path: CLAUDE.md
        reason: project context
    config:
      - key: commands.validate
        in: .genvid-agent.json
        required: false
        reason: optional config
    tools:
      - command: git
        reason: branch operations`;
  const out = parseYaml(yaml);
  assert.equal(out.name, 'plan-task');
  assert.ok(out.description.startsWith('A multi-paragraph'));
  assert.deepEqual(out.metadata.expects.files, [{ path: 'CLAUDE.md', reason: 'project context' }]);
  assert.deepEqual(out.metadata.expects.config, [
    { key: 'commands.validate', in: '.genvid-agent.json', required: false, reason: 'optional config' },
  ]);
  assert.deepEqual(out.metadata.expects.tools, [{ command: 'git', reason: 'branch operations' }]);
});

test('parseYaml: boolean values', () => {
  const yaml = `a: true
b: false`;
  const out = parseYaml(yaml);
  assert.equal(out.a, true);
  assert.equal(out.b, false);
});

test('parseYaml: quoted strings preserve content', () => {
  const yaml = `description: "value with: colon"
title: 'single quoted'`;
  const out = parseYaml(yaml);
  assert.equal(out.description, 'value with: colon');
  assert.equal(out.title, 'single quoted');
});

test('parseYaml: ignores comments and blank lines', () => {
  const yaml = `# top comment
name: foo

# middle comment
value: 42`;
  const out = parseYaml(yaml);
  assert.equal(out.name, 'foo');
  assert.equal(out.value, 42);
});
