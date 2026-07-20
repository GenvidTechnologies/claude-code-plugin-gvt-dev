import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkReadmeInventory } from '../lib/readme-inventory.mjs';

// A minimal README with both a Skills table and an Agents list, plus a trailing
// **Hook:** section (whose backtick tokens must NOT leak into the agents scan)
// and a Purpose cell that mentions a non-skill backtick token (`triaged`, which
// must NOT be mistaken for a listed skill).
function readme({ skills, agents }) {
  const rows = skills.map((s) => `| \`${s.name}\` | ${s.purpose ?? 'does a thing'} |`).join('\n');
  const agentList = agents.map((a) => `\`${a}\``).join(', ');
  return [
    '# plugin',
    '',
    '**Skills** (invoked as `/gvt-dev:<name>`):',
    '',
    '| Skill | Purpose |',
    '|-------|---------|',
    rows,
    '',
    '**Agents** (dispatched via `subagent_type`):',
    '',
    `${agentList}.`,
    '',
    '**Hook:** `pre-commit-lint` runs `commands.lint`; see `plan-task` and `code-review`.',
    '',
    '## Next section',
    '',
    'Body mentioning `create-pr` outside any inventory section.',
    '',
  ].join('\n');
}

test('checkReadmeInventory: in-sync README yields no findings', () => {
  const content = readme({
    skills: [{ name: 'plan-task' }, { name: 'triage-issues', purpose: 'stamp `triaged`' }],
    agents: ['analyst', 'issue-triage-analyst'],
  });
  const findings = checkReadmeInventory(content, ['plan-task', 'triage-issues'], ['analyst', 'issue-triage-analyst']);
  assert.deepEqual(findings, []);
});

test('checkReadmeInventory: a skill on disk but missing from the table is flagged', () => {
  const content = readme({ skills: [{ name: 'plan-task' }], agents: ['analyst'] });
  const findings = checkReadmeInventory(content, ['plan-task', 'triage-issues'], ['analyst']);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'readme-inventory');
  assert.equal(findings[0].severity, 'warning');
  assert.match(findings[0].detail, /plugin\/skills\/triage-issues is present but missing from the README skills table/);
});

test('checkReadmeInventory: a table row with no matching skill on disk is flagged as stale', () => {
  const content = readme({ skills: [{ name: 'plan-task' }, { name: 'removed-skill' }], agents: ['analyst'] });
  const findings = checkReadmeInventory(content, ['plan-task'], ['analyst']);
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /README skills table lists `removed-skill`, which has no matching plugin\/skills\/ entry/);
});

test('checkReadmeInventory: a Purpose-column backtick token is NOT mistaken for a listed skill', () => {
  // The `triaged` token lives in the Purpose cell, not the first column — it
  // must not be parsed as a listed skill (which would flag it as stale).
  const content = readme({ skills: [{ name: 'triage-issues', purpose: 'dedup, stamp `triaged`' }], agents: ['analyst'] });
  const findings = checkReadmeInventory(content, ['triage-issues'], ['analyst']);
  assert.deepEqual(findings, []);
});

test('checkReadmeInventory: a missing agent is flagged', () => {
  const content = readme({ skills: [{ name: 'plan-task' }], agents: ['analyst'] });
  const findings = checkReadmeInventory(content, ['plan-task'], ['analyst', 'issue-triage-analyst']);
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /plugin\/agents\/issue-triage-analyst is present but missing from the README agents list/);
});

test('checkReadmeInventory: the trailing **Hook:** section does not pollute the agents scan', () => {
  // `pre-commit-lint`, `plan-task`, `code-review` appear in the Hook line right
  // after the agents list — they must not be read as agents (which would flag
  // them as stale agent entries).
  const content = readme({ skills: [{ name: 'plan-task' }], agents: ['analyst'] });
  const findings = checkReadmeInventory(content, ['plan-task'], ['analyst']);
  assert.deepEqual(findings, []);
});

test('checkReadmeInventory: null README (absent) yields no findings', () => {
  assert.deepEqual(checkReadmeInventory(null, ['plan-task'], ['analyst']), []);
});

test('checkReadmeInventory: a README without Skills/Agents markers is tolerated (no findings)', () => {
  const content = '# plugin\n\nNo inventory sections here.\n';
  assert.deepEqual(checkReadmeInventory(content, ['plan-task'], ['analyst']), []);
});

test('checkReadmeInventory: only one section present is checked; the absent one is skipped', () => {
  const content = ['# plugin', '', '**Skills** (x):', '', '| Skill | Purpose |', '|--|--|', '| `plan-task` | p |', '', '## end', ''].join('\n');
  // Agents list absent → agents half skipped even though agentNames is non-empty.
  const findings = checkReadmeInventory(content, ['plan-task'], ['analyst', 'designer']);
  assert.deepEqual(findings, []);
});
