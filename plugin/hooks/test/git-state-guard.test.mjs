import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Readable } from 'node:stream';

import { parse } from 'shell-quote';

import { classify } from '../lib/git-state-guard.mjs';
import { run } from '../git-state-guard.mjs';

const ENTRY_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'git-state-guard.mjs');

const IN_SCOPE = { agent_id: 'sub-1', agent_type: 'gvt-dev:ts-implementer' };

function classifyCommand(command, overrides = {}) {
  return classify({ ...IN_SCOPE, command, ...overrides }, parse);
}

function assertDeny(command, overrides = {}) {
  const result = classifyCommand(command, overrides);
  assert.equal(result.deny, true, `expected deny for: ${command}`);
  assert.match(result.reason, /#14/);
}

function assertAllow(command, overrides = {}) {
  const result = classifyCommand(command, overrides);
  assert.equal(result.deny, false, `expected allow for: ${command}`);
}

// T1 — stash forms denied.
test('T1: git stash forms are denied', () => {
  assertDeny('git stash');
  assertDeny('git stash -u');
  assertDeny('git stash push -m x');
  assertDeny('git stash pop');
  assertDeny('git stash apply');
  assertDeny('git stash drop');
});

// T2 — git stash list / show are the read-only exception.
test('T2: git stash list / show are allowed', () => {
  assertAllow('git stash list');
  assertAllow('git stash show');
});

// T3 — reset forms denied.
test('T3: git reset forms are denied', () => {
  assertDeny('git reset');
  assertDeny('git reset --hard HEAD~1');
  assertDeny('git reset -- f');
});

// T4 — checkout forms denied.
test('T4: git checkout forms are denied', () => {
  assertDeny('git checkout main');
  assertDeny('git checkout -- f');
  assertDeny('git checkout -b x');
  assertDeny('git checkout .');
});

// T5 — switch + restore denied, including --staged.
test('T5: git switch / restore forms are denied', () => {
  assertDeny('git switch main');
  assertDeny('git switch -c x');
  assertDeny('git restore f');
  assertDeny('git restore --staged f');
});

// T6 — clean denied, dry-run forms allowed.
test('T6: git clean is denied, dry-run forms are allowed', () => {
  assertDeny('git clean -fd');
  assertAllow('git clean -n');
  assertAllow('git clean --dry-run');
  assertAllow('git clean -nd');
});

// T7 — history-rewriting / remote-mutating subcommands denied.
test('T7: merge/rebase/cherry-pick/revert/pull/am are denied', () => {
  assertDeny('git merge branch');
  assertDeny('git rebase main');
  assertDeny('git cherry-pick abc123');
  assertDeny('git revert HEAD');
  assertDeny('git pull');
  assertDeny('git am patch.mbox');
});

// T8 — non-mutating / inspection subcommands allowed.
test('T8: add/mv/rm/commit/status/diff/show/log/worktree are allowed', () => {
  assertAllow('git add f');
  assertAllow('git mv a b');
  assertAllow('git rm f');
  assertAllow('git commit -m x');
  assertAllow('git status');
  assertAllow('git diff');
  assertAllow('git diff --staged');
  assertAllow('git show HEAD');
  assertAllow('git log');
  assertAllow('git worktree add ../x branch');
  assertAllow('git worktree list');
  assertAllow('git worktree remove ../x');
});

// T9 — global options are skipped, not mistaken for the subcommand.
test('T9: git global options are skipped before the subcommand', () => {
  assertDeny('git -C /x stash');
  assertDeny('git -c a=b reset');
  assertDeny('git --no-pager checkout x');
  assertAllow('git -C /x status');
});

// T10 — compound / chained shell commands.
test('T10: compound commands are split at every control operator', () => {
  assertDeny('cd x && git stash');
  assertDeny('echo a; git reset');
  assertAllow('git log | head');
  assertDeny('true | git stash');
  assertDeny('(git stash)');
  assertDeny('echo a\ngit stash');
});

// T11 — quoted mentions of a denied phrase never trigger.
test('T11: quoted mentions of git stash/reset are allowed', () => {
  assertAllow("grep -c 'git stash' f");
  assertAllow('echo "git reset --hard"');
  assertAllow('git commit -m "undo git reset"');
  // The cases above pass on their command word alone. These carry a control
  // operator *inside* the quotes, so only a quote-aware tokenizer allows them:
  // a splitter that ignores quotes cuts at the operator and sees `git stash`.
  assertAllow('echo "a && git stash"');
  assertAllow("echo 'x; git reset --hard'");
  assertAllow('git commit -m "wip | git checkout main"');
});

// T12 — scope: only an in-scope gvt-dev agent is ever denied.
test('T12: out-of-scope callers are always allowed', () => {
  assertAllow('git stash', { agent_id: undefined });
  assertAllow('git stash', { agent_id: '' });
  assertAllow('git stash', { agent_type: 'Explore' });
  assertAllow('git stash', { agent_type: 'other-plugin:x' });
  assert.equal(classify({}, parse).deny, false);
  assert.equal(classify(undefined, parse).deny, false);
});

// Env-var / assignment handling.
test('assignments and unexpanded variables', () => {
  assertDeny('FOO=1 git stash');
  assertDeny('env FOO=1 git stash');
  assertAllow('git show $REF:path');
  // If $SUBCMD were expanded to "stash" this would deny; classify must keep
  // it literal, so the (nonexistent) subcommand "$SUBCMD" is allowed.
  assertAllow('git $SUBCMD');
});

// T13 — entry script, spawned as a real subprocess.
test('T13: entry script exits 2 and blames #14 on deny, 0 on allow', () => {
  const denyPayload = JSON.stringify({
    ...IN_SCOPE,
    tool_input: { command: 'git stash' },
  });
  const denyResult = spawnSync(process.execPath, [ENTRY_SCRIPT], {
    input: denyPayload,
    encoding: 'utf8',
  });
  assert.equal(denyResult.status, 2);
  assert.match(denyResult.stderr, /#14/);

  const allowPayload = JSON.stringify({
    ...IN_SCOPE,
    tool_input: { command: 'git status' },
  });
  const allowResult = spawnSync(process.execPath, [ENTRY_SCRIPT], {
    input: allowPayload,
    encoding: 'utf8',
  });
  assert.equal(allowResult.status, 0);
});

// T14 — a broken/throwing parse loader fails open (exit 0), simulated via
// dependency injection rather than by removing node_modules.
test('T14: a throwing loadParse fails open', async () => {
  const denyPayload = JSON.stringify({
    ...IN_SCOPE,
    tool_input: { command: 'git stash' },
  });
  const code = await run({
    stdin: Readable.from(Buffer.from(denyPayload)),
    loadParse: async () => {
      throw new Error('shell-quote unavailable');
    },
    write: () => {},
  });
  assert.equal(code, 0);
});

test('malformed/missing input fails open', async () => {
  const notJson = await run({ stdin: Readable.from(Buffer.from('not json')), write: () => {} });
  assert.equal(notJson, 0);

  const noCommand = await run({
    stdin: Readable.from(Buffer.from(JSON.stringify({ ...IN_SCOPE, tool_input: {} }))),
    write: () => {},
  });
  assert.equal(noCommand, 0);
});
