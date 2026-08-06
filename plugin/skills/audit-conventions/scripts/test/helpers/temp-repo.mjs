// Shared fixture helper for the audit.mjs wiring tests: builds a minimal
// STATE_MIGRATED temp repo (state is detected solely by the presence of
// .gvt-agent.json) with a minimal CLAUDE.md and an empty docs/ directory —
// present purely to dodge unrelated required-file errors (some components
// require CLAUDE.md; condense-lessons requires docs/TOC.md) that would
// otherwise pollute the assertions in callers built on this fixture.
//
// Callers pass a setup(dir) callback to add their own fixture files (e.g.
// docs/TOC.md, docs/example.md) or to override files this helper already
// wrote (e.g. replacing .gvt-agent.json to test a config override) — setup
// runs after the base fixture is in place, so later writes win.

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function withTempMigratedRepo(setup) {
  const dir = await mkdtemp(join(tmpdir(), 'audit-migrated-repo-test-'));
  try {
    await writeFile(
      join(dir, '.gvt-agent.json'),
      JSON.stringify({ project: { name: 'foo' }, commands: { validate: 'echo ok' } }, null, 2),
    );
    // Some components (commit-changes, create-pr, plan-task) require CLAUDE.md
    // — write a minimal one so exit-code assertions in callers are isolated to
    // the finding(s) under test rather than tripping on an unrelated
    // required-file error.
    await writeFile(join(dir, 'CLAUDE.md'), '# Test repo\n');
    await mkdir(join(dir, 'docs'), { recursive: true });
    if (setup) await setup(dir);
    return dir;
  } catch (err) {
    await rm(dir, { recursive: true, force: true });
    throw err;
  }
}
