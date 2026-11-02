// Drift test for blocks that are mirrored verbatim into many files.
// Each table entry names a canonical file and the files that must carry the
// same line, found by a lead string at the start of the line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const BLOCKS = [
  {
    id: 'writing-style',
    lead: '**Write technical text in the gvt-dev writing style.**',
    canonical: 'plugin/docs/writing-style.md',
    files: [
      'plugin/agents/tech-writer.md',
      'plugin/agents/ts-implementer.md',
      'plugin/agents/code-reviewer.md',
      'plugin/agents/issue-triage-analyst.md',
      'plugin/agents/analyst.md',
      'plugin/agents/designer.md',
      'plugin/agents/planner.md',
      'plugin/agents/validator.md',
      'plugin/skills/plan-task/SKILL.md',
      'plugin/skills/plan-next-issue/SKILL.md',
      'plugin/skills/triage-issues/SKILL.md',
      'plugin/skills/create-adr/SKILL.md',
      'plugin/skills/maintain-wiki/SKILL.md',
      'plugin/skills/run-retro/SKILL.md',
      'plugin/skills/condense-lessons/SKILL.md',
      'plugin/skills/cleanup-initiative/SKILL.md',
      'plugin/skills/commit-changes/SKILL.md',
      'plugin/skills/create-pr/SKILL.md',
      'plugin/skills/release-plugin/SKILL.md',
      'plugin/skills/release-npm-package/SKILL.md',
      'plugin/skills/reconcile-mcp-pin/SKILL.md',
      'plugin/skills/split-branch/SKILL.md',
      'plugin/skills/build-probe/SKILL.md',
    ],
  },
];

// Returns 0 when a and b are identical, else the 1-based column of the first difference.
export function firstDiffColumn(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return i + 1;
  }
  return a.length === b.length ? 0 : n + 1;
}

function leadLines(relPath, lead) {
  const text = readFileSync(join(ROOT, relPath), 'utf8');
  return text
    .split('\n')
    .filter((l) => l.startsWith(lead))
    .map((l) => l.replace(/\r$/, ''));
}

function walkMarkdown(dir, out) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walkMarkdown(p, out);
    else if (e.isFile() && e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

function canonicalText(block) {
  const lines = leadLines(block.canonical, block.lead);
  assert.equal(
    lines.length,
    1,
    `${block.canonical}: ${lines.length} lines start with the lead, expected 1`,
  );
  return lines[0];
}

for (const block of BLOCKS) {
  test(`shared block: ${block.id} canonical appears once`, () => {
    canonicalText(block);
  });

  for (const file of block.files) {
    test(`shared block: ${block.id} ${file}`, () => {
      const canon = canonicalText(block);
      const lines = leadLines(file, block.lead);
      if (lines.length === 0) {
        assert.fail(`${file}: no line starts with the lead`);
      }
      if (lines.length > 1) {
        assert.fail(`${file}: ${lines.length} lines start with the lead, expected 1`);
      }
      const col = firstDiffColumn(canon, lines[0]);
      assert.equal(col, 0, `${file}: differs from canonical at column ${col}`);
    });
  }

  test(`shared block: ${block.id} closed set`, () => {
    const allowed = new Set([block.canonical, ...block.files]);
    const offenders = [];
    for (const p of walkMarkdown(join(ROOT, 'plugin'), [])) {
      const rel = relative(ROOT, p).split(sep).join('/');
      if (allowed.has(rel)) continue;
      const text = readFileSync(p, 'utf8');
      if (text.split('\n').some((l) => l.startsWith(block.lead))) offenders.push(rel);
    }
    assert.deepEqual(offenders, [], `files outside the set carry the block: ${offenders.join(', ')}`);
  });
}

test('shared block: comparison reports a one-character change at the right column', () => {
  const canon = BLOCKS[0].lead + ' Some body text for the comparison.';
  assert.equal(firstDiffColumn(canon, canon), 0);
  const mid = 40;
  const changed = canon.slice(0, mid) + (canon[mid] === 'x' ? 'y' : 'x') + canon.slice(mid + 1);
  assert.equal(firstDiffColumn(canon, changed), mid + 1);
  assert.equal(firstDiffColumn(canon, canon + 'z'), canon.length + 1);
});
