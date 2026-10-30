// Grammar half of the issue-refs suite (#209, #636, #783). All fixtures are
// constructed (R11); none is a real issue body.
//
// Contract for extract(issue), chosen here where the design is silent:
//   input   { number, title, body, comments: [{ body, createdAt }] }
//           The body counts as earlier than every comment; comments are
//           ordered by createdAt (ISO-8601 strings).
//   output  { refs: Ref[], triggers: Trigger[] }
//   Ref     { source, origin, target, line, checked, retracted, unresolvable }
//     source        'statement' | 'title' | 'heading' | 'child-row' |
//                   'row-annotation' | 'deferral'
//     origin        'title' | 'body' | 'comment'
//     target        { repo, number } with repo null for a same-repo "#N",
//                   or null when the reference is unresolvable
//     line          the source line, trimmed (never the whole body)
//     checked       true/false for a child row, otherwise undefined
//     retracted     true once a later comment withdrew this same target
//                   (the ref stays in refs, flagged, so it can be counted)
//     unresolvable  the kind string (prose, repo-ambiguous, heading-detached),
//                   otherwise undefined
//     relation      (added: premise correction 19) for 'statement' and
//                   'heading' sources, one of 'blocked-by' | 'depends-on' |
//                   'blocks' | 'relates-to'; null for title, child-row,
//                   row-annotation and deferral sources (inherently blocking
//                   or child relations). Only 'blocked-by' and 'depends-on'
//                   can make the issue blocked.
//   Reference forms (added: premise correction 19): besides "#N" and
//   "owner/repo#N", a statement may give a URL
//   "https://github.com/<owner>/<repo>/issues/<N>" (or ".../pull/<N>", read
//   through the issues endpoint, so a PR lands as kind 'pr' after lookup),
//   equivalent to "owner/repo#N". When owner/repo equals the --repo
//   (case-insensitive; passed as extract(issue, { repo })) it is a same-repo
//   reference (repo null). A trailing
//   fragment such as "#issuecomment-123" is ignored. Only a URL on a
//   statement line is extracted.
//   Trigger { line, origin, measurement }
//     measurement is true when the text names a count, measure, probe,
//     benchmark or threshold. A trigger carrying a resolvable reference is
//     ALSO emitted in refs with source 'deferral' (R17).
// Titles start with the row id so the plan's --test-name-pattern blocks
// select them.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extract } from '../lib/refs-grammar.mjs';

const FENCE = '```';

function issue(body, extra = {}) {
  return { number: 1, title: 'Example issue', body, comments: [], ...extra };
}

function numbers(out) {
  return out.refs.filter((r) => r.target).map((r) => r.target.number);
}

function refTo(out, number) {
  return out.refs.find((r) => r.target && r.target.number === number);
}

// ---- R6: eight exclusions, each paired with a genuine statement ----

test('R6: a statement inside a fenced block is not extracted', () => {
  const out = extract(
    issue(
      [
        'Blocked by #10.',
        '',
        FENCE,
        'Blocked by #20',
        FENCE,
        '',
        '~~~',
        'Depends on #21',
        '~~~',
      ].join('\n'),
    ),
  );
  assert.ok(numbers(out).includes(10));
  assert.ok(!numbers(out).includes(20));
  assert.ok(!numbers(out).includes(21));
});

test('R6: a statement inside a blockquote is not extracted', () => {
  const out = extract(
    issue(['Blocked by #10.', '', '> Blocked by #20', '> Depends on #21'].join('\n')),
  );
  assert.ok(numbers(out).includes(10));
  assert.ok(!numbers(out).includes(20));
  assert.ok(!numbers(out).includes(21));
});

test('R6: a struck-through statement is not extracted', () => {
  const out = extract(
    issue(['Blocked by #10.', '', '~~Depends on #20.~~', '- ~~Blocked by #21~~'].join('\n')),
  );
  assert.ok(numbers(out).includes(10));
  assert.ok(!numbers(out).includes(20));
  assert.ok(!numbers(out).includes(21));
});

test('R6: a negated statement is not extracted', () => {
  const out = extract(
    issue(
      ['Blocked by #10.', '', 'Not blocked by #20.', 'No longer depends on #21.'].join('\n'),
    ),
  );
  assert.ok(numbers(out).includes(10));
  assert.ok(!numbers(out).includes(20));
  assert.ok(!numbers(out).includes(21));
});

test('R6: a mid-line (narrative) mention is not extracted', () => {
  const out = extract(
    issue(
      [
        'Blocked by #10.',
        '',
        'As discussed, this was blocked by #20 for a while.',
        'Both #21 and #22 carry the same Depends on #23 note.',
      ].join('\n'),
    ),
  );
  assert.ok(numbers(out).includes(10));
  for (const n of [20, 21, 22, 23]) assert.ok(!numbers(out).includes(n), `#${n}`);
});

test('R6: a checklist row under an Acceptance heading is not a child row', () => {
  const out = extract(
    issue(
      [
        '## Tasks',
        '- [ ] #10 the real child',
        '',
        '## Acceptance Criteria',
        '- [ ] #20 behaves as described',
        '- [x] #21 is covered by a test',
      ].join('\n'),
    ),
  );
  assert.ok(numbers(out).includes(10));
  assert.equal(refTo(out, 10).source, 'child-row');
  assert.ok(!numbers(out).includes(20));
  assert.ok(!numbers(out).includes(21));
});

test('R6: a checklist row with a comma right after the number is not a child row', () => {
  const out = extract(
    issue(['- [ ] #10 the real child', '- [ ] #20, then the remaining cleanup'].join('\n')),
  );
  assert.ok(numbers(out).includes(10));
  assert.equal(refTo(out, 10).source, 'child-row');
  assert.ok(!numbers(out).includes(20));
});

test('R6: a label inside inline code is not extracted', () => {
  const out = extract(
    issue(['Blocked by #10.', '', '`Blocked by #20`', 'Use `Depends on #21` as the label.'].join('\n')),
  );
  assert.ok(numbers(out).includes(10));
  assert.ok(!numbers(out).includes(20));
  assert.ok(!numbers(out).includes(21));
});

// ---- R7: retraction ----

test('R7: a later comment naming the same target retracts it', () => {
  const out = extract(
    issue('Blocked by #10.\nBlocked by #11.', {
      comments: [{ body: 'No longer blocked by #10.', createdAt: '2026-01-02T00:00:00Z' }],
    }),
  );
  assert.equal(refTo(out, 10).retracted, true);
  assert.notEqual(refTo(out, 11).retracted, true);
});

test('R7: a retraction naming a different target has no effect', () => {
  const out = extract(
    issue('Blocked by #10.', {
      comments: [{ body: '#12 is unblocked now.', createdAt: '2026-01-02T00:00:00Z' }],
    }),
  );
  assert.ok(refTo(out, 10));
  assert.notEqual(refTo(out, 10).retracted, true);
});

test('R7: a triage note is skipped for statements but honoured for retraction', () => {
  const out = extract(
    issue('Blocked by #10.', {
      comments: [
        {
          body: [
            'Triage verification note',
            'Blocked by #30.',
            'No longer blocked by #10: #10 closed.',
          ].join('\n'),
          createdAt: '2026-01-02T00:00:00Z',
        },
        { body: 'Blocked by #31.', createdAt: '2026-01-03T00:00:00Z' },
      ],
    }),
  );
  assert.ok(!numbers(out).includes(30));
  assert.ok(numbers(out).includes(31));
  assert.equal(refTo(out, 10).retracted, true);
});

// ---- AC-636-4: heading sections and cross-repo references ----

test('AC-636-4: a heading section yields the reference from a later line', () => {
  const out = extract(
    issue(
      [
        '## Depends on',
        '',
        'The upstream work that has to land first.',
        '',
        '- #40 the upstream fix',
        '- [ ] #41 a tracked child',
        '',
        '## Notes',
        'See #99 for history.',
        '',
        '## Blocked by',
        'Nothing written down yet.',
      ].join('\n'),
    ),
  );
  assert.equal(refTo(out, 40).source, 'heading');
  assert.equal(refTo(out, 41).source, 'child-row');
  assert.equal(refTo(out, 41).checked, false);
  assert.ok(!numbers(out).includes(99));
  assert.ok(out.refs.some((r) => r.unresolvable === 'heading-detached'));
});

test('AC-636-4: an owner/repo#N reference is cross-repo, in the body and the title', () => {
  const out = extract(
    issue('Blocked by example-org/example-lib#7.\nBlocked by #8.', {
      title: 'Adopt the new API (after example-org/example-lib#9)',
    }),
  );
  assert.deepEqual(refTo(out, 7).target, { repo: 'example-org/example-lib', number: 7 });
  assert.deepEqual(refTo(out, 8).target, { repo: null, number: 8 });
  const fromTitle = refTo(out, 9);
  assert.equal(fromTitle.origin, 'title');
  assert.deepEqual(fromTitle.target, { repo: 'example-org/example-lib', number: 9 });
});

// ---- R17: dependency-deferred ----

test('R17: "deferred because of" and "needs" triggers become deferral blockers', () => {
  const out = extract(
    issue(
      [
        'Deferral trigger: deferred because of #50.',
        '- **Deferral trigger**: needs #51 first.',
        'Deferral trigger: wait for the maintainers to agree.',
        'We deferred because of #52 earlier this year.',
      ].join('\n'),
    ),
  );
  assert.equal(refTo(out, 50).source, 'deferral');
  assert.equal(refTo(out, 51).source, 'deferral');
  assert.ok(!numbers(out).includes(52));
  // The reference-free trigger is still a trigger, and is not a blocker.
  assert.ok(out.triggers.some((t) => t.line.includes('maintainers')));
  assert.ok(!out.refs.some((r) => r.source === 'deferral' && r.line.includes('maintainers')));
});

// ---- AC-783-1: deferral-trigger lines ----

test('AC-783-1: each deferral label line is extracted, from body and comments', () => {
  const out = extract(
    issue(
      [
        'Deferral trigger: the cache layer is rewritten.',
        'Pick this up when the parser is stable.',
        '- **Revisit when** the API changes shape.',
        'Not urgent until the next quarter.',
        'Deferred until the vendor ships.',
        'Parked until the migration ends.',
        'Pick it up only when the queue is empty.',
      ].join('\n'),
      {
        comments: [
          { body: 'Revisit when the schema is frozen.', createdAt: '2026-01-02T00:00:00Z' },
        ],
      },
    ),
  );
  for (const fragment of [
    'cache layer',
    'parser is stable',
    'API changes shape',
    'next quarter',
    'vendor ships',
    'migration ends',
    'queue is empty',
  ]) {
    const hit = out.triggers.find((t) => t.line.includes(fragment));
    assert.ok(hit, fragment);
    assert.equal(hit.origin, 'body', fragment);
  }
  const fromComment = out.triggers.find((t) => t.line.includes('schema is frozen'));
  assert.ok(fromComment);
  assert.equal(fromComment.origin, 'comment');
});

test('AC-783-1: a label inside inline code is not a trigger', () => {
  const out = extract(
    issue(
      [
        'Revisit when the API changes shape.',
        '`Revisit when the cache is cold`',
        'The label `Deferral trigger: ignored` is documented elsewhere.',
      ].join('\n'),
    ),
  );
  assert.ok(out.triggers.some((t) => t.line.includes('API changes shape')));
  assert.ok(!out.triggers.some((t) => t.line.includes('cache is cold')));
  assert.ok(!out.triggers.some((t) => t.line.includes('ignored')));
});

test('AC-783-1: a mid-sentence form is not a trigger', () => {
  const out = extract(
    issue(
      [
        'Revisit when the API changes shape.',
        'We should revisit when we have more time.',
        'This is not urgent for the current release.',
        'It was parked until later, then forgotten.',
      ].join('\n'),
    ),
  );
  assert.ok(out.triggers.some((t) => t.line.includes('API changes shape')));
  assert.equal(out.triggers.length, 1);
});

// ---- AC-783-3: measurement flag ----

test('AC-783-3: a trigger that names a measurement is flagged, others are not', () => {
  const out = extract(
    issue(
      [
        'Deferral trigger: a benchmark shows more than 5 percent regression.',
        'Revisit when the API changes shape.',
      ].join('\n'),
    ),
  );
  const measured = out.triggers.find((t) => t.line.includes('benchmark'));
  const plain = out.triggers.find((t) => t.line.includes('API changes shape'));
  assert.ok(measured);
  assert.ok(plain);
  assert.equal(measured.measurement, true);
  assert.equal(plain.measurement, false);
});

// ---- URL and REL: reference forms and direction (premise correction 19) ----

test('URL: a github issue URL is a reference, cross-repo or same-repo, fragment ignored', () => {
  const out = extract(
    issue(
      [
        'Blocked by https://github.com/example-org/example-lib/issues/21',
        'Depends on https://github.com/example-org/example-repo/issues/22',
        'Blocked by https://github.com/example-org/example-lib/issues/23#issuecomment-123',
        'See https://github.com/example-org/example-lib/issues/24 for the background.',
      ].join('\n'),
    ),
    { repo: 'example-org/example-repo' },
  );
  assert.deepEqual(refTo(out, 21).target, { repo: 'example-org/example-lib', number: 21 });
  assert.deepEqual(refTo(out, 22).target, { repo: null, number: 22 });
  assert.deepEqual(refTo(out, 23).target, { repo: 'example-org/example-lib', number: 23 });
  assert.ok(!numbers(out).includes(24));
});

test('REL: extract tags relation for each statement verb', () => {
  const out = extract(
    issue(
      [
        'Blocked by #31.',
        'Depends on #32.',
        'Blocks #33.',
        'Relates to #34.',
        '- [ ] #35 a child',
        'Deferral trigger: needs #36 first.',
      ].join('\n'),
    ),
    { repo: 'example-org/example-repo' },
  );
  assert.equal(refTo(out, 31).relation, 'blocked-by');
  assert.equal(refTo(out, 32).relation, 'depends-on');
  assert.equal(refTo(out, 33).relation, 'blocks');
  assert.equal(refTo(out, 34).relation, 'relates-to');
  assert.equal(refTo(out, 35).relation, null);
  assert.equal(refTo(out, 36).relation, null);
});

// ===========================================================================
// Resolve half (#209, #230, #607, #636, #775, #783). Constructed fixtures only.
//
// Contract for plan() and resolve(), chosen here where the design is silent.
// Anything the design names (outcomes, kinds, tags, labels) is used verbatim.
//
// Modules: plan and resolve come from lib/refs-resolve.mjs and call extract
// from lib/refs-grammar.mjs themselves, so these tests feed raw issues.
//
//   plan(input, options)    -> Entry[]
//   resolve(input, options) -> Record[]   (ascending issue number)
//
// input (the data the caller saved, already parsed):
//   open        [{ number, title, body }]  actionQuery output, every open issue
//   comments    [{ number, comments: [{ body, createdAt }] }]  commentsQuery
//   structure   [{ number, parent: { number } | null,
//                  subIssuesSummary: { total, completed, percentCompleted } }]
//               structureQuery, one row per open issue. Absent or null means
//               "no data" (R41).
//   comparison  [{ number, state: 'OPEN' | 'CLOSED' }]  analyst only
//   lookups     { [key]: text }  the raw text of each <key>.json the caller
//               wrote: stdout and stderr of the printed command, together
//
// options:
//   repo           'owner/repo' of the tracker (must match ^[\w.-]+/[\w.-]+$,
//                  otherwise plan and resolve throw an Error naming "repo")
//   limit          the -L of the open query; open.length >= limit means the
//                  open list is truncated
//   cap            maximum state lookups per run
//   registryCap    maximum npm packages checked per run (default 5)
//   order          number[] of issue numbers, ranked; lookups follow it, and
//                  issues not listed follow in ascending order
//   stateTemplate  bugTracker.refStateQuery, {repo} and {id} substituted
//   root           directory holding package.json and/or .gitmodules; with no
//                  root, no manifest is read. CLI: --root <dir>.
//   nonInteractive true under --non-interactive
//
// plan() entries, JSON lines on the CLI:
//   { key, command }          a command for the caller to run
//   { key, skipped: 'cap' }   a lookup the cap cut
// key is filename-safe (^[\w.-]+$), unique per target, and the caller saves
// the command's output to <dir>/<key>.json. An entry whose key is already in
// input.lookups is omitted, so plan() returns [] once everything is saved.
// Default order is ascending referencing-issue number, then order of
// appearance; ties break by target key. One entry per distinct target.
// Round 1 asks for issue state (cross-repo, absent from the data in hand, or
// open list truncated). Round 2 appears only once a cross-repo target is
// known closed and its consumption is found in the manifests: two commands,
// "npm view <dep> repository.url --prefer-online" and
// "npm view <dep> time --json --prefer-online".
//
// Record:
//   number
//   refs          extract()'s Ref fields, plus
//     state       'open' | 'not-open' | 'closed' | 'pr' | 'nonexistent' | null
//     outcome     'live' | 'not-open' | 'cleared' | 'closed-unreleased'
//                 | 'closed-release-unverified' | 'ticked-open'
//                 | 'unticked-closed' | 'unticked-not-open' | 'retracted'
//                 | 'unresolvable'
//     kind        for 'unresolvable': prose, repo-ambiguous, cross-repo-unread,
//                 absent, pr, nonexistent, heading-detached, truncated, or
//                 lookup-failed (not in the design: a lookup whose output is
//                 not a state and not a 404)
//     via         for 'cleared': 'same-repo' | 'source-consumed'
//                 | 'released (version check only)'
//     latest      for 'closed-unreleased': the newest published version
//     provenance  'in hand' | 'lookup' | 'registry'
//     skipped     'cap' when the lookup was cut by the cap
//   triggers      extract()'s triggers, plus fired (boolean) and
//                 firedBy ('reference' | 'comment' | null)
//   banner        { line } | null
//   native        { status: 'data' | 'no-data', parent: number | null,
//                   total: number | null, completed: number | null }
//   commentsTruncated  true when the bulk comment array holds >= 100 entries
//   retractedCount     number of refs whose outcome is 'retracted'
//   notes         string[]; carries 'native structure: no data' and
//                 'comments possibly truncated' where they apply
//   readiness
//     state       'ready' | 'ready-caveat' | 'blocked' | 'umbrella'
//                 | 'done-but-unclosed' | 'banner-no-open-child' | 'deferred'
//     rankable    true only for ready, ready-caveat and blocked
//     reason      one line that names each deciding target as #N or owner/repo#N
//     blockedBy   targets of uncleared blockers ({ repo, number })
//     openChildren  number[] ascending, the union of native and checklist
//     routedTo    the lowest-numbered open child that is itself ready, or null
//     decidedBy   [{ source, provenance, target?, outcome? }] with source one
//                 of 'title' | 'body' | 'comment' | 'deferral' | 'native'
//                 | 'checklist' | 'banner'
//     disagreements  string[], one per tick-versus-state or native-versus-
//                 checklist mismatch
//
// Silent in the design, chosen here: a closed or looked-up PR is
// unresolvable with kind 'pr' (the taxonomy lists 'pr' as a kind; a closed PR
// is never cleared); a same-repo target absent from an untruncated open list
// has state 'not-open' and outcome 'not-open', and the readiness is 'ready'.
//
// CLI (spawned by the tests, protocol of the design):
//   plan    --open f [--comments f] [--structure f] [--comparison f]
//           --repo r --limit n --cap n [--order f] [--lookups dir]
//           --state-template t [--root dir]        JSON lines of Entry
//   resolve the same flags, plus --non-interactive  JSON lines of Record
//   extract --single <readOne.json>                 one JSON object
//           { refs, triggers }
// A bad usage or an unsafe --repo exits 2 with the reason on stderr.
// Titles start with the row id so the plan's --test-name-pattern blocks
// select them. The prefixes SAFE:, 404:, TRUNC:, KIND:, ROW:, RETRACT:,
// NONINT:, NPM:, SRC:, REG: and CLI: are hardening outside the row floors.
// ===========================================================================

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { resolve, plan } from '../lib/refs-resolve.mjs';

const CLI = fileURLToPath(new URL('../issue-refs.mjs', import.meta.url));
const REPO = 'example-org/example-repo';
const LIB = 'example-org/lib';
const TEMPLATE =
  "gh api repos/{repo}/issues/{id} --jq '{number,state,state_reason,closed_at,pull_request:(.pull_request != null),sub_issues_summary}'";
const OPTS = { repo: REPO, limit: 500, cap: 20, stateTemplate: TEMPLATE };

function issueOf(number, body, extra = {}) {
  return { number, title: `Issue ${number}`, body, ...extra };
}

function dataOf(issues, extra = {}) {
  const { comments, ...rest } = extra;
  const out = { open: issues, ...rest };
  if (comments) {
    out.comments = Object.entries(comments).map(([n, list]) => ({
      number: Number(n),
      comments: list,
    }));
  }
  return out;
}

function cm(body, day = 2) {
  return { body, createdAt: `2026-01-${String(day).padStart(2, '0')}T00:00:00Z` };
}

function srow(number, parent, total, completed) {
  return {
    number,
    parent: parent === null ? null : { number: parent },
    subIssuesSummary: {
      total,
      completed,
      percentCompleted: total === 0 ? 0 : Math.round((100 * completed) / total),
    },
  };
}

// One structure row per open issue, with overrides keyed by issue number.
function structureOf(issues, rows = {}) {
  return issues.map((i) => rows[i.number] || srow(i.number, null, 0, 0));
}

function stJson(number, state, extra = {}) {
  const closed = state === 'closed';
  return JSON.stringify({
    number,
    state,
    state_reason: closed ? 'completed' : null,
    closed_at: closed ? '2026-10-10T10:00:00Z' : null,
    pull_request: false,
    sub_issues_summary: null,
    ...extra,
  });
}

function keyFor(planOut, repo, number) {
  const hit = planOut.find(
    (e) => e.command && e.command.includes(`repos/${repo}/issues/${number} `),
  );
  assert.ok(hit, `no lookup planned for ${repo}#${number}`);
  return hit.key;
}

// Save an answer for each "owner/repo#N" in answers, keyed from the plan.
function withState(data, options, answers) {
  const p = plan(data, options);
  const lookups = { ...(data.lookups || {}) };
  for (const [ref, text] of Object.entries(answers)) {
    const [repo, number] = ref.split('#');
    lookups[keyFor(p, repo, number)] = text;
  }
  return { ...data, lookups };
}

function cmdKey(planOut, command) {
  const hit = planOut.find((e) => e.command === command);
  assert.ok(hit, `not planned: ${command}`);
  return hit.key;
}

function recOf(out, number) {
  const rec = out.find((r) => r.number === number);
  assert.ok(rec, `no record for #${number}`);
  return rec;
}

function refOf(rec, number, repo = null) {
  const ref = rec.refs.find(
    (r) => r.target && r.target.number === number && r.target.repo === repo,
  );
  assert.ok(ref, `no ref to ${repo || ''}#${number} in #${rec.number}`);
  return ref;
}

function kindOf(rec, kind) {
  const ref = rec.refs.find((r) => r.kind === kind);
  assert.ok(ref, `no ref of kind ${kind} in #${rec.number}`);
  return ref;
}

function withTmp(fn) {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'issue-refs-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeIn(dir, files) {
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
}

function pkgJson(deps) {
  return JSON.stringify({ name: 'example-consumer', dependencies: deps });
}

const REPO_URL = (r) => `git+https://github.com/${r}.git\n`;

function timeJson(versions) {
  return JSON.stringify({
    created: '2026-01-01T00:00:00Z',
    modified: '2026-10-20T00:00:00Z',
    ...versions,
  });
}

// Drive one closed cross-repo blocker through both rounds: issue state, then
// the two npm commands. Returns the data with every lookup saved.
function throughRegistry(dataIn, options, target, dep, { repoUrl, times }) {
  const number = Number(target.split('#')[1]);
  const d1 = withState(dataIn, options, { [target]: stJson(number, 'closed') });
  const p2 = plan(d1, options);
  const lookups = { ...d1.lookups };
  lookups[cmdKey(p2, `npm view ${dep} repository.url --prefer-online`)] = repoUrl;
  lookups[cmdKey(p2, `npm view ${dep} time --json --prefer-online`)] = times;
  return { ...d1, lookups };
}

const NOT_FOUND_BODY =
  '{"message":"Not Found","documentation_url":"https://docs.github.com/rest/issues/issues#get-an-issue","status":"404"}';
const NOT_FOUND = `${NOT_FOUND_BODY}\ngh: Not Found (HTTP 404)\n`;

// ---- R5: open-only precision ----

test('R5: absence from an untruncated open list is not-open, never closed', () => {
  const out = resolve(dataOf([issueOf(1, 'Blocked by #77.'), issueOf(2, 'Other work.')]), OPTS);
  const rec = recOf(out, 1);
  const ref = refOf(rec, 77);
  assert.equal(ref.state, 'not-open');
  assert.notEqual(ref.state, 'closed');
  assert.equal(ref.outcome, 'not-open');
  assert.notEqual(ref.outcome, 'cleared');
  assert.equal(ref.provenance, 'in hand');
  assert.equal(rec.readiness.state, 'ready');
});

test('R5: an open list at its limit makes absence truncated, and plan asks for the lookup', () => {
  const issues = [issueOf(1, 'Blocked by #77.'), issueOf(2, 'Other work.')];
  const options = { ...OPTS, limit: 2 };
  const ref = refOf(recOf(resolve(dataOf(issues), options), 1), 77);
  assert.equal(ref.outcome, 'unresolvable');
  assert.equal(ref.kind, 'truncated');
  assert.notEqual(ref.state, 'not-open');
  const p = plan(dataOf(issues), options);
  assert.ok(p.some((e) => e.command && e.command.includes(`repos/${REPO}/issues/77 `)));
});

// ---- AC-209-1: a stated blocker naming a closed issue ----

test('AC-209-1: a body blocker naming a closed issue is cleared via same-repo', () => {
  const d = withState(dataOf([issueOf(1, 'Blocked by #12.')]), OPTS, {
    [`${REPO}#12`]: stJson(12, 'closed'),
  });
  const rec = recOf(resolve(d, OPTS), 1);
  const ref = refOf(rec, 12);
  assert.equal(ref.origin, 'body');
  assert.equal(ref.state, 'closed');
  assert.equal(ref.outcome, 'cleared');
  assert.equal(ref.via, 'same-repo');
  assert.equal(ref.provenance, 'lookup');
  assert.equal(rec.readiness.state, 'ready');
});

test('AC-209-1: a comment blocker given only by a URL naming a closed issue is cleared too', () => {
  const d = dataOf([issueOf(1, 'Plain description.')], {
    comments: {
      1: [cm('Blocked by https://github.com/example-org/example-repo/issues/13')],
    },
    comparison: [
      { number: 1, state: 'OPEN' },
      { number: 13, state: 'CLOSED' },
    ],
  });
  const ref = refOf(recOf(resolve(d, OPTS), 1), 13);
  assert.equal(ref.origin, 'comment');
  assert.equal(ref.outcome, 'cleared');
  assert.equal(ref.via, 'same-repo');
  assert.equal(ref.provenance, 'in hand');
});

// ---- AC-209-2: seven unresolvable kinds ----

test('AC-209-2: a label with no reference is unresolvable, kind prose', () => {
  const rec = recOf(resolve(dataOf([issueOf(1, 'Blocked by the vendor review.')]), OPTS), 1);
  const ref = kindOf(rec, 'prose');
  assert.equal(ref.outcome, 'unresolvable');
  assert.equal(rec.readiness.state, 'blocked');
});

test('AC-209-2: a slashless name#N is unresolvable, kind repo-ambiguous', () => {
  const rec = recOf(resolve(dataOf([issueOf(1, 'Blocked by lib#5.')]), OPTS), 1);
  assert.equal(kindOf(rec, 'repo-ambiguous').outcome, 'unresolvable');
});

test('AC-209-2: a number in neither the open list nor the comparison set is absent', () => {
  const d = dataOf([issueOf(1, 'Blocked by #88.'), issueOf(2, 'Other work.')], {
    comparison: [
      { number: 1, state: 'OPEN' },
      { number: 2, state: 'OPEN' },
    ],
  });
  const ref = refOf(recOf(resolve(d, OPTS), 1), 88);
  assert.equal(ref.outcome, 'unresolvable');
  assert.equal(ref.kind, 'absent');
});

test('AC-209-2: a pull request target is unresolvable, kind pr', () => {
  const d = withState(dataOf([issueOf(1, 'Blocked by #5.')]), OPTS, {
    [`${REPO}#5`]: stJson(5, 'open', { pull_request: true }),
  });
  const ref = refOf(recOf(resolve(d, OPTS), 1), 5);
  assert.equal(ref.outcome, 'unresolvable');
  assert.equal(ref.kind, 'pr');
});

test('AC-209-2: a 404 lookup is unresolvable, kind nonexistent', () => {
  const d = withState(dataOf([issueOf(1, 'Blocked by #99999.')]), OPTS, {
    [`${REPO}#99999`]: NOT_FOUND,
  });
  const ref = refOf(recOf(resolve(d, OPTS), 1), 99999);
  assert.equal(ref.outcome, 'unresolvable');
  assert.equal(ref.kind, 'nonexistent');
});

test('AC-209-2: a heading with no reference is unresolvable, kind heading-detached', () => {
  const rec = recOf(
    resolve(dataOf([issueOf(1, '## Blocked by\n\nNothing written down yet.')]), OPTS),
    1,
  );
  assert.equal(kindOf(rec, 'heading-detached').outcome, 'unresolvable');
});

test('AC-209-2: an absent number on a limit-sized open list is unresolvable, kind truncated', () => {
  const issues = [issueOf(1, 'Blocked by #77.'), issueOf(2, 'Other work.')];
  const rec = recOf(resolve(dataOf(issues), { ...OPTS, limit: 2 }), 1);
  assert.equal(kindOf(rec, 'truncated').outcome, 'unresolvable');
  assert.equal(rec.readiness.state, 'blocked');
});

// ---- AC-209-3: epic checklist against real state, both directions ----

test('AC-209-3: a ticked row whose child is open is ticked-open and stays routable', () => {
  const issues = [
    issueOf(20, '- [x] #21 first step\n- [ ] #22 second step'),
    issueOf(21, 'First step.'),
    issueOf(22, 'Second step.'),
  ];
  const rec = recOf(resolve(dataOf(issues), OPTS), 20);
  assert.equal(refOf(rec, 21).outcome, 'ticked-open');
  assert.equal(refOf(rec, 22).outcome, 'live');
  assert.equal(rec.readiness.state, 'umbrella');
  assert.deepEqual(rec.readiness.openChildren, [21, 22]);
  assert.equal(rec.readiness.routedTo, 21);
});

test('AC-209-3: an unticked row whose child is closed is unticked-closed, never a routing target', () => {
  const issues = [
    issueOf(30, '- [ ] #31 done upstream\n- [ ] #32 still to do'),
    issueOf(32, 'Still to do.'),
  ];
  const d = dataOf(issues, {
    comparison: [
      { number: 30, state: 'OPEN' },
      { number: 31, state: 'CLOSED' },
      { number: 32, state: 'OPEN' },
    ],
  });
  const rec = recOf(resolve(d, OPTS), 30);
  assert.equal(refOf(rec, 31).outcome, 'unticked-closed');
  assert.equal(refOf(rec, 32).outcome, 'live');
  assert.deepEqual(rec.readiness.openChildren, [32]);
  assert.equal(rec.readiness.routedTo, 32);
  assert.ok(rec.readiness.disagreements.length >= 1);
});

// ---- AC-209-x: a closed blocker is not an open dependency ----

test('AC-209-x: a closed Depends on blocker is not an open dependency, and the reason names it', () => {
  const d = withState(dataOf([issueOf(1, 'Depends on #30.')]), OPTS, {
    [`${REPO}#30`]: stJson(30, 'closed'),
  });
  const rec = recOf(resolve(d, OPTS), 1);
  assert.equal(rec.readiness.state, 'ready');
  assert.deepEqual(rec.readiness.blockedBy, []);
  assert.ok(rec.readiness.reason.includes('#30'));
  assert.ok(
    rec.readiness.decidedBy.some(
      (x) => x.target && x.target.number === 30 && x.outcome === 'cleared',
    ),
  );
});

// ---- AC-636-1: title forms ----

test('AC-636-1: a title "(after #N)" with an open target blocks, source title', () => {
  const issues = [
    issueOf(1, 'Description.', { title: 'Adopt the loader (after #10)' }),
    issueOf(10, 'The prerequisite.'),
  ];
  const rec = recOf(resolve(dataOf(issues), OPTS), 1);
  const ref = refOf(rec, 10);
  assert.equal(ref.source, 'title');
  assert.equal(ref.origin, 'title');
  assert.equal(rec.readiness.state, 'blocked');
  assert.deepEqual(rec.readiness.blockedBy, [{ repo: null, number: 10 }]);
  assert.ok(rec.readiness.decidedBy.some((x) => x.source === 'title'));
});

test('AC-636-1: a title "(after owner/repo#N)" with an open target blocks, source title', () => {
  const issues = [issueOf(1, 'Description.', { title: `Switch the client (after ${LIB}#9)` })];
  const o = { ...OPTS };
  const d = withState(dataOf(issues), o, { [`${LIB}#9`]: stJson(9, 'open') });
  const rec = recOf(resolve(d, o), 1);
  const ref = refOf(rec, 9, LIB);
  assert.equal(ref.source, 'title');
  assert.equal(ref.outcome, 'live');
  assert.equal(rec.readiness.state, 'blocked');
  assert.deepEqual(rec.readiness.blockedBy, [{ repo: LIB, number: 9 }]);
});

test('AC-636-1: a title "blocked by #N" with a closed target is cleared and named', () => {
  const issues = [issueOf(1, 'Description.', { title: 'Wire the loader, blocked by #11' })];
  const d = withState(dataOf(issues), OPTS, { [`${REPO}#11`]: stJson(11, 'closed') });
  const rec = recOf(resolve(d, OPTS), 1);
  const ref = refOf(rec, 11);
  assert.equal(ref.source, 'title');
  assert.equal(ref.outcome, 'cleared');
  assert.equal(rec.readiness.state, 'ready');
  assert.ok(rec.readiness.reason.includes('#11'));
  assert.ok(
    rec.readiness.decidedBy.some(
      (x) => x.source === 'title' && x.outcome === 'cleared' && x.target.number === 11,
    ),
  );
});

test('AC-636-1: a title "depends on #N" clears when closed and blocks when open', () => {
  const issues = [
    issueOf(1, 'Description.', { title: 'Port the parser, depends on #12' }),
    issueOf(2, 'Description.', { title: 'Port the printer, depends on #13' }),
    issueOf(13, 'The prerequisite.'),
  ];
  const d = dataOf(issues, {
    comparison: [
      { number: 1, state: 'OPEN' },
      { number: 2, state: 'OPEN' },
      { number: 12, state: 'CLOSED' },
      { number: 13, state: 'OPEN' },
    ],
  });
  const out = resolve(d, OPTS);
  assert.equal(refOf(recOf(out, 1), 12).source, 'title');
  assert.equal(refOf(recOf(out, 1), 12).outcome, 'cleared');
  assert.equal(recOf(out, 1).readiness.state, 'ready');
  assert.equal(refOf(recOf(out, 2), 13).source, 'title');
  assert.equal(recOf(out, 2).readiness.state, 'blocked');
});

// ---- AC-636-2: release-unverified ----

test('AC-636-2: a closed cross-repo blocker with unknown consumption is closed-release-unverified', () => {
  withTmp((dir) => {
    // The dependency name does not match the repo name, so consumption is unknown.
    const root = writeIn(dir, { 'package.json': pkgJson({ '@example/lib': '^1.0.0' }) });
    const o = { ...OPTS, root };
    const issues = [issueOf(1, 'Blocked by example-org/example-lib#12.')];
    const d = withState(dataOf(issues), o, { 'example-org/example-lib#12': stJson(12, 'closed') });
    assert.deepEqual(plan(d, o), []);
    const rec = recOf(resolve(d, o), 1);
    const ref = refOf(rec, 12, 'example-org/example-lib');
    assert.equal(ref.outcome, 'closed-release-unverified');
    assert.notEqual(ref.outcome, 'cleared');
    assert.equal(rec.readiness.state, 'ready-caveat');
  });
});

// ---- AC-636-3: bounded, deduped, deterministic lookups ----

test('AC-636-3: one lookup per distinct reference, across issues and mentions', () => {
  const issues = [
    issueOf(1, 'Blocked by #50.\nDepends on #50.\nBlocked by example-org/example-lib#7.'),
    issueOf(2, 'Description.', { title: 'Epic (after #50)' }),
    issueOf(3, 'Description.'),
  ];
  const d = dataOf(issues, { comments: { 3: [cm('Blocked by example-org/example-lib#7.')] } });
  const p = plan(d, OPTS);
  const commands = p.filter((e) => e.command);
  assert.equal(commands.length, 2);
  assert.equal(new Set(commands.map((e) => e.key)).size, 2);
  assert.equal(new Set(commands.map((e) => e.command)).size, 2);
  assert.ok(commands.some((e) => e.command.includes(`repos/${REPO}/issues/50 `)));
  assert.ok(commands.some((e) => e.command.includes('repos/example-org/example-lib/issues/7 ')));
});

test('AC-636-3: the cap is respected, the overflow is listed, and order is honoured', () => {
  const idOf = (e) => Number(/issues\/(\d+) /.exec(e.command)[1]);
  const issues = [
    issueOf(1, 'Blocked by #60.\nBlocked by #61.\nBlocked by #62.'),
    issueOf(2, 'Blocked by #63.\nBlocked by #64.'),
  ];
  const d = dataOf(issues);
  const o = { ...OPTS, cap: 3 };
  const p = plan(d, o);
  assert.deepEqual(p.filter((e) => e.command).map(idOf), [60, 61, 62]);
  const skipped = p.filter((e) => e.skipped);
  assert.equal(skipped.length, 2);
  for (const e of skipped) {
    assert.equal(e.skipped, 'cap');
    assert.equal(typeof e.key, 'string');
  }
  const ranked = plan(d, { ...o, order: [2, 1] });
  assert.deepEqual(ranked.filter((e) => e.command).map(idOf), [63, 64, 60]);
  // The cut references are flagged in resolve; the ones looked up are not.
  const lookups = {};
  for (const e of p.filter((x) => x.command)) lookups[e.key] = stJson(idOf(e), 'open');
  const rec = recOf(resolve({ ...d, lookups }, o), 1);
  assert.equal(refOf(rec, 60).skipped, undefined);
  assert.equal(refOf(recOf(resolve({ ...d, lookups }, o), 2), 63).skipped, 'cap');
});

test('AC-636-3: output is identical across runs and across input permutations', () => {
  const issues = [
    issueOf(1, 'Blocked by #50.\nBlocked by example-org/example-lib#7.'),
    issueOf(2, '- [ ] #3 child\n- [x] #4 child', { title: 'Epic (after #51)' }),
    issueOf(3, 'Child three.'),
    issueOf(4, 'Child four.'),
  ];
  const d = dataOf(issues, {
    comments: {
      1: [cm('Blocked by #52.', 3), cm('No longer blocked by #50.', 4)],
      3: [cm('Depends on #4.', 2), cm('Depends on #53.', 5)],
    },
    structure: structureOf(issues, { 2: srow(2, null, 2, 1), 3: srow(3, 2, 0, 0) }),
    comparison: [
      { number: 1, state: 'OPEN' },
      { number: 2, state: 'OPEN' },
      { number: 3, state: 'OPEN' },
      { number: 4, state: 'OPEN' },
      { number: 53, state: 'CLOSED' },
    ],
  });
  const permute = (x) => ({
    ...x,
    open: [...x.open].reverse(),
    comments: [...x.comments].reverse().map((c) => ({ ...c, comments: [...c.comments].reverse() })),
    structure: [...x.structure].reverse(),
    comparison: [...x.comparison].reverse(),
  });
  const p = plan(d, OPTS);
  assert.ok(p.length >= 3);
  assert.equal(JSON.stringify(plan(d, OPTS)), JSON.stringify(p));
  assert.equal(JSON.stringify(plan(permute(d), OPTS)), JSON.stringify(p));
  const lookups = {};
  for (const e of p) {
    const m = /issues\/(\d+) /.exec(e.command || '');
    if (m) lookups[e.key] = stJson(Number(m[1]), 'open');
  }
  const full = { ...d, lookups };
  const first = JSON.stringify(resolve(full, OPTS));
  assert.equal(JSON.stringify(resolve(full, OPTS)), first);
  assert.equal(JSON.stringify(resolve(permute(full), OPTS)), first);
});

// ---- AC-783-2: deferral ----

test('AC-783-2: an unfired trigger is deferred, with its text', () => {
  const rec = recOf(
    resolve(dataOf([issueOf(1, 'Revisit when the parser is stable.')]), OPTS),
    1,
  );
  assert.equal(rec.triggers.length, 1);
  assert.equal(rec.triggers[0].fired, false);
  assert.equal(rec.readiness.state, 'deferred');
  assert.equal(rec.readiness.rankable, false);
  assert.ok(rec.readiness.reason.includes('parser is stable'));
  assert.ok(rec.readiness.decidedBy.some((x) => x.source === 'deferral' && x.provenance));
});

test('AC-783-2: a trigger whose reference is cleared has fired', () => {
  const d = withState(dataOf([issueOf(1, 'Deferral trigger: needs #70 first.')]), OPTS, {
    [`${REPO}#70`]: stJson(70, 'closed'),
  });
  const rec = recOf(resolve(d, OPTS), 1);
  assert.equal(refOf(rec, 70).source, 'deferral');
  assert.equal(refOf(rec, 70).outcome, 'cleared');
  assert.equal(rec.triggers[0].fired, true);
  assert.equal(rec.triggers[0].firedBy, 'reference');
  assert.equal(rec.readiness.state, 'ready');
});

test('AC-783-2: a later confirming comment means the trigger has fired', () => {
  const d = dataOf([issueOf(1, 'Deferral trigger: the parser is stable.')], {
    comments: { 1: [cm('Trigger fired: the parser is stable now.', 3)] },
  });
  const rec = recOf(resolve(d, OPTS), 1);
  assert.equal(rec.triggers[0].fired, true);
  assert.equal(rec.triggers[0].firedBy, 'comment');
  assert.equal(rec.readiness.state, 'ready');
});

// ---- AC-775-1 / AC-775-2: comments and native structure, in hand ----

test('AC-775-1: a comment blocker and the native parent are read from the bulk data, with no lookup', () => {
  const issues = [issueOf(80, 'Description.'), issueOf(81, 'The prerequisite.')];
  const d = dataOf(issues, {
    comments: { 80: [cm('Blocked by #81.')] },
    structure: structureOf(issues, { 80: srow(80, 5, 0, 0) }),
  });
  const rec = recOf(resolve(d, OPTS), 80);
  assert.equal(rec.native.status, 'data');
  assert.equal(rec.native.parent, 5);
  assert.equal(rec.readiness.state, 'blocked');
  assert.ok(
    rec.readiness.decidedBy.some(
      (x) =>
        x.source === 'comment' &&
        x.provenance === 'in hand' &&
        x.target &&
        x.target.number === 81,
    ),
  );
  assert.deepEqual(plan(d, OPTS), []);
});

test('AC-775-2: an open blocker found in a comment is blocked, with the unblocker named', () => {
  const issues = [issueOf(82, 'Description.'), issueOf(83, 'The prerequisite.')];
  const d = dataOf(issues, { comments: { 82: [cm('Depends on #83.')] } });
  const rec = recOf(resolve(d, OPTS), 82);
  assert.equal(rec.readiness.state, 'blocked');
  assert.deepEqual(rec.readiness.blockedBy, [{ repo: null, number: 83 }]);
  assert.ok(rec.readiness.reason.includes('#83'));
});

test('AC-775-2: open native sub-issues make an umbrella, routed to the next ready open child', () => {
  const issues = [
    issueOf(90, 'Umbrella for the loader work.'),
    issueOf(91, 'Blocked by #93.'),
    issueOf(92, 'Child two.'),
    issueOf(93, 'A prerequisite.'),
  ];
  const d = dataOf(issues, {
    structure: structureOf(issues, {
      90: srow(90, null, 3, 1),
      91: srow(91, 90, 0, 0),
      92: srow(92, 90, 0, 0),
    }),
  });
  const rec = recOf(resolve(d, OPTS), 90);
  assert.equal(rec.readiness.state, 'umbrella');
  assert.equal(rec.readiness.rankable, false);
  assert.deepEqual(rec.readiness.openChildren, [91, 92]);
  assert.equal(rec.readiness.routedTo, 92);
  assert.equal(recOf(resolve(d, OPTS), 91).readiness.state, 'blocked');
});

// ---- AC-230: native sub-issues ----

test('AC-230-1: all native sub-issues closed is done-but-unclosed, and not ranked', () => {
  const issues = [issueOf(100, '- [x] #101 first step\n- [x] #102 second step')];
  const d = dataOf(issues, {
    structure: structureOf(issues, { 100: srow(100, null, 2, 2) }),
    comparison: [
      { number: 100, state: 'OPEN' },
      { number: 101, state: 'CLOSED' },
      { number: 102, state: 'CLOSED' },
    ],
  });
  const rec = recOf(resolve(d, OPTS), 100);
  assert.equal(rec.readiness.state, 'done-but-unclosed');
  assert.equal(rec.readiness.rankable, false);
  assert.ok(rec.readiness.decidedBy.some((x) => x.source === 'native' && x.provenance === 'in hand'));
});

test('AC-230-2: done-but-unclosed holds on a fixture with zero checklist rows', () => {
  const issues = [issueOf(103, 'Track the migration to the new loader.')];
  const d = dataOf(issues, {
    structure: structureOf(issues, { 103: srow(103, null, 3, 3) }),
  });
  const rec = recOf(resolve(d, OPTS), 103);
  assert.equal(rec.refs.filter((r) => r.source === 'child-row').length, 0);
  assert.equal(rec.readiness.state, 'done-but-unclosed');
  assert.equal(rec.readiness.rankable, false);
});

test('AC-230-3: one open native child routes to it', () => {
  const issues = [issueOf(110, 'Umbrella.'), issueOf(111, 'The one open child.')];
  const d = dataOf(issues, {
    structure: structureOf(issues, { 110: srow(110, null, 2, 1), 111: srow(111, 110, 0, 0) }),
  });
  const rec = recOf(resolve(d, OPTS), 110);
  assert.equal(rec.readiness.state, 'umbrella');
  assert.deepEqual(rec.readiness.openChildren, [111]);
  assert.equal(rec.readiness.routedTo, 111);
});

test('AC-230-4: an issue with no sub-issues is unaffected, and plan emits no lookup for it', () => {
  const issues = [issueOf(112, 'A plain piece of work with no references.')];
  const d = dataOf(issues, { structure: structureOf(issues) });
  const rec = recOf(resolve(d, OPTS), 112);
  assert.equal(rec.native.status, 'data');
  assert.equal(rec.native.total, 0);
  assert.equal(rec.readiness.state, 'ready');
  assert.deepEqual(plan(d, OPTS), []);
});

// ---- R41: no structure data ----

test('R41: absent structure data is no-data, never "no children" or done', () => {
  const issues = [issueOf(113, 'A plain piece of work.')];
  const out = resolve(dataOf(issues), OPTS);
  const rec = recOf(out, 113);
  assert.equal(rec.native.status, 'no-data');
  assert.equal(rec.native.total, null);
  assert.notEqual(rec.readiness.state, 'done-but-unclosed');
  assert.equal(rec.readiness.state, 'ready');
  assert.ok(rec.notes.includes('native structure: no data'));
});

// ---- SD9: umbrella banners ----

test('SD9: a banner in a blockquote with an open child routes the umbrella', () => {
  const issues = [
    issueOf(120, '> This issue is the umbrella and the record of the analysis.\n\nDescription.'),
    issueOf(121, 'The open child.'),
  ];
  const d = dataOf(issues, {
    structure: structureOf(issues, { 120: srow(120, null, 1, 0), 121: srow(121, 120, 0, 0) }),
  });
  const rec = recOf(resolve(d, OPTS), 120);
  assert.ok(rec.banner);
  assert.ok(rec.banner.line.includes('umbrella'));
  assert.equal(rec.readiness.state, 'umbrella');
  assert.equal(rec.readiness.routedTo, 121);
});

test('SD9: a banner with no open child is banner-no-open-child', () => {
  const issues = [issueOf(122, '> This issue is the umbrella and the record of the analysis.')];
  const d = dataOf(issues, { structure: structureOf(issues) });
  const rec = recOf(resolve(d, OPTS), 122);
  assert.ok(rec.banner);
  assert.equal(rec.readiness.state, 'banner-no-open-child');
  assert.equal(rec.readiness.rankable, false);
});

test('SD9: a child naming its parent as the analysis of record is not a banner', () => {
  const issues = [
    issueOf(
      131,
      [
        '#130 remains the umbrella and the analysis of record.',
        'Kept as the umbrella; see #130 for the analysis of record.',
      ].join('\n'),
    ),
    issueOf(130, 'Parent.'),
  ];
  const d = dataOf(issues, {
    structure: structureOf(issues, { 130: srow(130, null, 1, 0), 131: srow(131, 130, 0, 0) }),
  });
  const rec = recOf(resolve(d, OPTS), 131);
  assert.equal(rec.banner, null);
  assert.notEqual(rec.readiness.state, 'banner-no-open-child');
  assert.notEqual(rec.readiness.state, 'umbrella');
});

// ---- PREC: state from the tracker, membership from the union ----

test('PREC: native all closed but a checklist row names an open child is not done, and is routed to it', () => {
  const issues = [issueOf(140, '- [ ] #141 the remaining step'), issueOf(141, 'The remaining step.')];
  const d = dataOf(issues, {
    structure: structureOf(issues, { 140: srow(140, null, 2, 2) }),
  });
  const rec = recOf(resolve(d, OPTS), 140);
  assert.notEqual(rec.readiness.state, 'done-but-unclosed');
  assert.equal(rec.readiness.state, 'umbrella');
  assert.equal(rec.readiness.routedTo, 141);
  assert.ok(rec.readiness.disagreements.length >= 1);
  const sources = rec.readiness.decidedBy.map((x) => x.source);
  assert.ok(sources.includes('native'));
  assert.ok(sources.includes('checklist'));
  for (const x of rec.readiness.decidedBy) {
    assert.equal(typeof x.source, 'string');
    assert.equal(typeof x.provenance, 'string');
  }
});

// ---- PROP-607: closed versus released ----

test('PROP-607-1: closed upstream with a publish after the close is cleared, released (version check only)', () => {
  withTmp((dir) => {
    const root = writeIn(dir, { 'package.json': pkgJson({ '@example/lib': '^1.0.0' }) });
    const o = { ...OPTS, root };
    const base = dataOf([issueOf(1, `Blocked by ${LIB}#12.`)]);
    assert.ok(!plan(base, o).some((e) => /npm/.test(e.command || '')));
    const d = throughRegistry(base, o, `${LIB}#12`, '@example/lib', {
      repoUrl: REPO_URL(LIB),
      times: timeJson({ '1.0.0': '2026-01-01T00:00:00Z', '1.1.0': '2026-10-12T00:00:00Z' }),
    });
    assert.deepEqual(plan(d, o), []);
    const rec = recOf(resolve(d, o), 1);
    const ref = refOf(rec, 12, LIB);
    assert.equal(ref.outcome, 'cleared');
    assert.equal(ref.via, 'released (version check only)');
    assert.equal(ref.provenance, 'registry');
    assert.equal(rec.readiness.state, 'ready');
  });
});

test('PROP-607-2: no publish after the close is closed-unreleased, carrying latest is X', () => {
  withTmp((dir) => {
    const root = writeIn(dir, { 'package.json': pkgJson({ '@example/lib': '^1.0.0' }) });
    const o = { ...OPTS, root };
    const d = throughRegistry(dataOf([issueOf(1, `Blocked by ${LIB}#12.`)]), o, `${LIB}#12`, '@example/lib', {
      repoUrl: REPO_URL(LIB),
      times: timeJson({ '1.0.0': '2026-01-01T00:00:00Z' }),
    });
    const rec = recOf(resolve(d, o), 1);
    const ref = refOf(rec, 12, LIB);
    assert.equal(ref.outcome, 'closed-unreleased');
    assert.equal(ref.latest, '1.0.0');
    assert.equal(rec.readiness.state, 'blocked');
    assert.ok(rec.readiness.reason.includes('not yet released'));
    assert.ok(rec.readiness.reason.includes('latest is 1.0.0'));
  });
});

test('PROP-607-3: a closed same-repo blocker clears via same-repo, whatever the manifests say', () => {
  withTmp((dir) => {
    // A dependency named after this very repo must not trigger a registry check.
    const root = writeIn(dir, { 'package.json': pkgJson({ '@example/example-repo': '^1.0.0' }) });
    const o = { ...OPTS, root };
    const d = withState(dataOf([issueOf(1, 'Blocked by #12.')]), o, {
      [`${REPO}#12`]: stJson(12, 'closed'),
    });
    assert.deepEqual(plan(d, o), []);
    const ref = refOf(recOf(resolve(d, o), 1), 12);
    assert.equal(ref.outcome, 'cleared');
    assert.equal(ref.via, 'same-repo');
  });
});

test('PROP-607-3: a closed blocker consumed from a submodule clears via source-consumed, with no registry check', () => {
  withTmp((dir) => {
    // The package.json also names the repo; the submodule wins, so no npm command.
    const root = writeIn(dir, {
      '.gitmodules': `[submodule "vendor/lib"]\n\tpath = vendor/lib\n\turl = https://github.com/${LIB}.git\n`,
      'package.json': pkgJson({ '@example/lib': '^1.0.0' }),
    });
    const o = { ...OPTS, root };
    const d = withState(dataOf([issueOf(1, `Blocked by ${LIB}#12.`)]), o, {
      [`${LIB}#12`]: stJson(12, 'closed'),
    });
    assert.deepEqual(plan(d, o), []);
    const rec = recOf(resolve(d, o), 1);
    const ref = refOf(rec, 12, LIB);
    assert.equal(ref.outcome, 'cleared');
    assert.equal(ref.via, 'source-consumed');
    assert.equal(rec.readiness.state, 'ready');
  });
});

// ---- CLI: AC-775-3 and AC-783-4 ----

function runCli(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

function writeJson(dir, name, value) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(value));
  return file;
}

function jsonLines(text) {
  return text
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l));
}

function cliArgsFor(dir, issues, extra = {}) {
  const args = [
    '--open',
    writeJson(dir, 'open.json', issues),
    '--repo',
    REPO,
    '--limit',
    '500',
    '--cap',
    '20',
    '--state-template',
    TEMPLATE,
  ];
  if (extra.comments) args.push('--comments', writeJson(dir, 'comments.json', extra.comments));
  if (extra.structure) args.push('--structure', writeJson(dir, 'structure.json', extra.structure));
  return args;
}

test('AC-775-3: resolve prints extracted lines only, never body text (sentinel)', () => {
  withTmp((dir) => {
    const issues = [
      issueOf(
        1,
        [
          'SENTINEL_BODY_5f3a narrative text that must never be echoed.',
          'Blocked by #2.',
          'More prose, SENTINEL_TAIL_77b0, follows.',
        ].join('\n'),
        { title: 'Example title' },
      ),
      issueOf(2, 'Prerequisite.'),
    ];
    const comments = [
      { number: 1, comments: [cm('SENTINEL_COMMENT_9c1d chatter that must never be echoed.')] },
      { number: 2, comments: [] },
    ];
    const structure = [srow(1, null, 0, 0), srow(2, null, 0, 0)];
    const r = runCli(['resolve', ...cliArgsFor(dir, issues, { comments, structure })]);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!r.stdout.includes('SENTINEL'));
    const rec = recOf(jsonLines(r.stdout), 1);
    assert.ok(rec.refs.some((x) => x.line.includes('Blocked by #2')));
    assert.equal(rec.readiness.state, 'blocked');
  });
});

test('AC-783-4: extract --single reads a readOne file and prints refs and triggers only', () => {
  withTmp((dir) => {
    const readOne = {
      number: 7,
      title: 'Example title',
      body: [
        'Revisit when the parser is stable.',
        'Blocked by #3.',
        'SENTINEL_BODY_aa11 prose that must never be echoed.',
      ].join('\n'),
      labels: [],
      comments: [{ body: 'SENTINEL_COMMENT_bb22 chatter.', createdAt: '2026-01-02T00:00:00Z' }],
    };
    const file = writeJson(dir, 'one.json', readOne);
    const r = runCli(['extract', '--single', file]);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!r.stdout.includes('SENTINEL'));
    const out = JSON.parse(r.stdout);
    assert.ok(out.triggers.some((t) => t.line.includes('parser is stable')));
    assert.ok(out.refs.some((x) => x.target && x.target.number === 3));
  });
});

// ---- SAFE: untrusted issue text never reaches a printed command ----

const TEMPLATE_RE = (() => {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const [head, rest] = TEMPLATE.split('{repo}');
  const [mid, tail] = rest.split('{id}');
  return new RegExp(`^${esc(head)}([\\w.-]+/[\\w.-]+)${esc(mid)}(\\d+)${esc(tail)}$`);
})();
const NPM_RE = /^npm view (@?[\w.-]+(?:\/[\w.-]+)?) (?:repository\.url|time --json) --prefer-online$/;

function assertSafe(planOut) {
  for (const e of planOut) {
    assert.match(e.key, /^[\w.-]+$/);
    assert.ok(!e.key.includes('..'), e.key);
    if (e.command !== undefined) {
      assert.ok(
        TEMPLATE_RE.test(e.command) || NPM_RE.test(e.command),
        `unsafe command: ${e.command}`,
      );
    }
  }
}

test('SAFE: shell metacharacters in a repo name taken from issue text never reach a command', () => {
  const hostile = [
    'Blocked by evil;touch/pwned#5.',
    'Blocked by a$(whoami)/b#6.',
    'Blocked by `x`/y#7.',
    'Blocked by own er/repo#8.',
    'Blocked by ../../etc/passwd#9.',
    'Blocked by a|b/c#10.',
    'Blocked by a&b/c#11.',
    'Blocked by a>b/c#12.',
    'Blocked by a"b/c#13.',
    "Blocked by a'b/c#14.",
  ];
  const issues = [
    issueOf(1, [...hostile, 'Blocked by example-org/example-lib#99.'].join('\n'), {
      title: 'Hostile title (after a;b/c#15)',
    }),
    issueOf(2, 'Description.'),
  ];
  const d = dataOf(issues, { comments: { 2: [cm('Blocked by x y/z#16.\nDepends on $(id)/w#17.')] } });
  const p = plan(d, OPTS);
  assertSafe(p);
  assert.ok(p.some((e) => e.command && e.command.includes('repos/example-org/example-lib/issues/99 ')));
  assert.doesNotThrow(() => resolve(d, OPTS));
});

test('SAFE: a non-numeric id never reaches a command', () => {
  const issues = [
    issueOf(
      1,
      [
        'Blocked by example-org/example-lib#5x.',
        'Blocked by example-org/example-lib#abc.',
        'Blocked by #1e3.',
        'Blocked by #-1.',
        'Blocked by #12;ls.',
        'Blocked by example-org/example-lib#98.',
      ].join('\n'),
    ),
  ];
  const p = plan(dataOf(issues), OPTS);
  assertSafe(p);
  assert.ok(p.some((e) => e.command && e.command.includes('repos/example-org/example-lib/issues/98 ')));
  assert.doesNotThrow(() => resolve(dataOf(issues), OPTS));
});

test('SAFE: a hostile dependency name from package.json never reaches an npm command', () => {
  withTmp((dir) => {
    const root = writeIn(dir, {
      'package.json': pkgJson({
        '@bad;touch/lib': '^1.0.0',
        '$(x)/lib2': '^1.0.0',
        '@ok/lib3': '^1.0.0',
      }),
    });
    const o = { ...OPTS, root };
    const issues = [
      issueOf(1, 'Blocked by example-org/lib#1.\nBlocked by example-org/lib2#1.\nBlocked by example-org/lib3#1.'),
    ];
    const answers = {};
    for (const n of ['lib', 'lib2', 'lib3']) answers[`example-org/${n}#1`] = stJson(1, 'closed');
    const d1 = withState(dataOf(issues), o, answers);
    const p2 = plan(d1, o);
    assertSafe(p2);
    assert.ok(p2.some((e) => e.command === 'npm view @ok/lib3 repository.url --prefer-online'));
    assert.ok(!p2.some((e) => /bad|touch|\$\(/.test(e.command || '')));
    const lookups = { ...d1.lookups };
    lookups[cmdKey(p2, 'npm view @ok/lib3 repository.url --prefer-online')] = REPO_URL('example-org/lib3');
    lookups[cmdKey(p2, 'npm view @ok/lib3 time --json --prefer-online')] = timeJson({
      '1.0.0': '2026-10-12T00:00:00Z',
    });
    const d2 = { ...d1, lookups };
    assert.deepEqual(plan(d2, o), []);
    const rec = recOf(resolve(d2, o), 1);
    assert.equal(refOf(rec, 1, 'example-org/lib3').outcome, 'cleared');
    assert.equal(refOf(rec, 1, 'example-org/lib').outcome, 'closed-release-unverified');
    assert.equal(refOf(rec, 1, 'example-org/lib2').outcome, 'closed-release-unverified');
  });
});

test('SAFE: every key is filename-safe and unique per target', () => {
  withTmp((dir) => {
    const root = writeIn(dir, { 'package.json': pkgJson({ '@example/lib': '^1.0.0' }) });
    const o = { ...OPTS, root, cap: 3 };
    const issues = [
      issueOf(1, `Blocked by #60.\nBlocked by ${LIB}#61.\nBlocked by example-org/other#60.\nBlocked by #62.\nBlocked by #63.`),
    ];
    const d1 = withState(dataOf(issues), { ...o, cap: 20 }, { [`${LIB}#61`]: stJson(61, 'closed') });
    const p2 = plan(d1, o);
    const p1 = plan(dataOf(issues), o);
    assertSafe(p1);
    assertSafe(p2);
    assert.ok(p1.some((e) => e.skipped));
    assert.ok(p2.some((e) => e.command && e.command.startsWith('npm view')));
    const keys = p1.map((e) => e.key);
    assert.equal(new Set(keys).size, keys.length);
    assert.ok(keys.length >= 4);
  });
});

test('SAFE: a repo option outside owner/repo form is refused', () => {
  const d = dataOf([issueOf(1, 'Blocked by #5.')]);
  assert.throws(() => plan(d, { ...OPTS, repo: 'a;b' }), /repo/i);
  assert.throws(() => resolve(d, { ...OPTS, repo: '$(id)/x' }), /repo/i);
});

// ---- 404: gh's output for a missing target, and other failures ----

test('404: gh 404 output (JSON body on stdout, message on stderr) resolves as nonexistent', () => {
  const d = withState(dataOf([issueOf(1, 'Blocked by #99999.')]), OPTS, {
    [`${REPO}#99999`]: NOT_FOUND,
  });
  const ref = refOf(recOf(resolve(d, OPTS), 1), 99999);
  assert.equal(ref.state, 'nonexistent');
  assert.equal(ref.outcome, 'unresolvable');
  assert.equal(ref.kind, 'nonexistent');
});

test('404: either stream alone is enough to read a 404', () => {
  for (const text of [NOT_FOUND_BODY, 'gh: Not Found (HTTP 404)\n']) {
    const d = withState(dataOf([issueOf(1, 'Blocked by #99999.')]), OPTS, {
      [`${REPO}#99999`]: text,
    });
    assert.equal(refOf(recOf(resolve(d, OPTS), 1), 99999).kind, 'nonexistent', text);
  }
});

test('404: any other failure is unresolvable, lookup-failed, never nonexistent', () => {
  const failures = [
    '{"message":"Bad credentials","documentation_url":"https://docs.github.com/rest","status":"401"}\ngh: Bad credentials (HTTP 401)\n',
    '{"message":"API rate limit exceeded for user.","status":"403"}\ngh: API rate limit exceeded (HTTP 403)\n',
    'gh: Server Error (HTTP 500)\n',
    '',
    'this is not a state at all',
  ];
  for (const text of failures) {
    const d = withState(dataOf([issueOf(1, 'Blocked by #5.')]), OPTS, { [`${REPO}#5`]: text });
    const rec = recOf(resolve(d, OPTS), 1);
    const ref = refOf(rec, 5);
    assert.equal(ref.outcome, 'unresolvable', text);
    assert.equal(ref.kind, 'lookup-failed', text);
    assert.notEqual(ref.state, 'nonexistent', text);
    assert.equal(rec.readiness.state, 'blocked', text);
  }
});

test('404: a closed pull request target (pull_request true, no sub-issue summary) is pr, never cleared', () => {
  const d = withState(dataOf([issueOf(1, 'Blocked by #5.')]), OPTS, {
    [`${REPO}#5`]: stJson(5, 'closed', { pull_request: true, sub_issues_summary: null }),
  });
  const ref = refOf(recOf(resolve(d, OPTS), 1), 5);
  assert.equal(ref.outcome, 'unresolvable');
  assert.equal(ref.kind, 'pr');
  assert.notEqual(ref.outcome, 'cleared');
});

// ---- TRUNC: bulk comments may be cut at the page size ----

function manyComments(count) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    out.push({
      body: `Chatter number ${i}.`,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
    });
  }
  return out;
}

test('TRUNC: a bulk comment array of 100 or more entries is reported as possibly truncated', () => {
  const issues = [issueOf(1, 'Blocked by #2.'), issueOf(2, 'Prerequisite.')];
  const at100 = recOf(resolve(dataOf(issues, { comments: { 1: manyComments(100) } }), OPTS), 1);
  assert.equal(at100.commentsTruncated, true);
  assert.ok(at100.notes.includes('comments possibly truncated'));
  const at99 = recOf(resolve(dataOf(issues, { comments: { 1: manyComments(99) } }), OPTS), 1);
  assert.equal(at99.commentsTruncated, false);
  assert.ok(!at99.notes.includes('comments possibly truncated'));
});

// ---- KIND, ROW, RETRACT, NONINT, NPM, SRC, REG: hardening of the taxonomy ----

test('KIND: a cross-repo reference with no lookup saved is unresolvable, cross-repo-unread', () => {
  const rec = recOf(resolve(dataOf([issueOf(1, 'Blocked by example-org/example-lib#7.')]), OPTS), 1);
  const ref = refOf(rec, 7, 'example-org/example-lib');
  assert.equal(ref.outcome, 'unresolvable');
  assert.equal(ref.kind, 'cross-repo-unread');
  assert.equal(rec.readiness.state, 'blocked');
});

test('REL: Blocks and Relates to never make the issue blocked', () => {
  const issues = [
    issueOf(1, 'Blocks #5.\nRelates to #6.'),
    issueOf(2, 'Blocked by #7.'),
    issueOf(5, 'Open.'),
    issueOf(6, 'Open.'),
    issueOf(7, 'Open.'),
  ];
  const out = resolve(dataOf(issues), OPTS);
  assert.equal(recOf(out, 1).readiness.state, 'ready');
  assert.deepEqual(recOf(out, 1).readiness.blockedBy, []);
  assert.equal(recOf(out, 2).readiness.state, 'blocked');
});

test('ROW: an unticked row absent from the open list is unticked-not-open, not unticked-closed', () => {
  const issues = [issueOf(1, '- [ ] #40 a step that left the open list')];
  const ref = refOf(recOf(resolve(dataOf(issues), OPTS), 1), 40);
  assert.equal(ref.outcome, 'unticked-not-open');
  assert.notEqual(ref.outcome, 'unticked-closed');
});

test('RETRACT: a retracted blocker has no effect on readiness and is counted', () => {
  const issues = [issueOf(1, 'Blocked by #10.'), issueOf(10, 'The prerequisite, still open.')];
  const d = dataOf(issues, { comments: { 1: [cm('No longer blocked by #10.')] } });
  const rec = recOf(resolve(d, OPTS), 1);
  assert.equal(refOf(rec, 10).outcome, 'retracted');
  assert.equal(rec.retractedCount, 1);
  assert.equal(rec.readiness.state, 'ready');
  assert.deepEqual(rec.readiness.blockedBy, []);
});

test('NONINT: a release-unverified blocker is blocked under --non-interactive, ready-caveat otherwise', () => {
  const issues = [issueOf(1, 'Blocked by example-org/example-lib#12.')];
  const d = withState(dataOf(issues), OPTS, { 'example-org/example-lib#12': stJson(12, 'closed') });
  assert.equal(recOf(resolve(d, OPTS), 1).readiness.state, 'ready-caveat');
  assert.equal(recOf(resolve(d, { ...OPTS, nonInteractive: true }), 1).readiness.state, 'blocked');
});

test('NPM: a registry repository.url that names another repo is closed-release-unverified', () => {
  withTmp((dir) => {
    const root = writeIn(dir, { 'package.json': pkgJson({ '@example/lib': '^1.0.0' }) });
    const o = { ...OPTS, root };
    const d = throughRegistry(dataOf([issueOf(1, `Blocked by ${LIB}#12.`)]), o, `${LIB}#12`, '@example/lib', {
      repoUrl: REPO_URL('example-org/other'),
      times: timeJson({ '1.1.0': '2026-10-12T00:00:00Z' }),
    });
    const ref = refOf(recOf(resolve(d, o), 1), 12, LIB);
    assert.equal(ref.outcome, 'closed-release-unverified');
  });
});

test('SRC: a package.json git or GitHub dependency spec is source-consumed', () => {
  for (const spec of [
    'github:example-org/lib#main',
    'git+https://github.com/example-org/lib.git#main',
  ]) {
    withTmp((dir) => {
      const root = writeIn(dir, { 'package.json': pkgJson({ 'lib-from-git': spec }) });
      const o = { ...OPTS, root };
      const d = withState(dataOf([issueOf(1, `Blocked by ${LIB}#12.`)]), o, {
        [`${LIB}#12`]: stJson(12, 'closed'),
      });
      assert.deepEqual(plan(d, o), [], spec);
      const ref = refOf(recOf(resolve(d, o), 1), 12, LIB);
      assert.equal(ref.outcome, 'cleared', spec);
      assert.equal(ref.via, 'source-consumed', spec);
    });
  }
});

test('REG: at most five packages are checked per run, and the overflow is listed', () => {
  withTmp((dir) => {
    const names = ['lib1', 'lib2', 'lib3', 'lib4', 'lib5', 'lib6'];
    const deps = {};
    for (const n of names) deps[`@example/${n}`] = '^1.0.0';
    const root = writeIn(dir, { 'package.json': pkgJson(deps) });
    const o = { ...OPTS, root };
    const body = names.map((n) => `Blocked by example-org/${n}#1.`).join('\n');
    const answers = {};
    for (const n of names) answers[`example-org/${n}#1`] = stJson(1, 'closed');
    const d1 = withState(dataOf([issueOf(1, body)]), o, answers);
    const p2 = plan(d1, o);
    const commands = p2.filter((e) => e.command);
    const packages = new Set(commands.map((e) => /^npm view (\S+) /.exec(e.command)[1]));
    assert.equal(packages.size, 5);
    const skipped = p2.filter((e) => e.skipped);
    assert.ok(skipped.length >= 1);
    for (const e of skipped) assert.equal(e.skipped, 'cap');
  });
});

// ---- CLI: usage and the plan, lookups-directory, resolve loop ----

test('CLI: plan then resolve over a lookups directory follows the protocol', () => {
  withTmp((dir) => {
    const common = cliArgsFor(dir, [issueOf(1, 'Blocked by #50.')]);
    const p1 = runCli(['plan', ...common]);
    assert.equal(p1.status, 0, p1.stderr);
    const entries = jsonLines(p1.stdout);
    assert.equal(entries.length, 1);
    assert.ok(entries[0].command.includes(`repos/${REPO}/issues/50 `));
    const lookups = path.join(dir, 'lookups');
    fs.mkdirSync(lookups);
    fs.writeFileSync(path.join(lookups, `${entries[0].key}.json`), stJson(50, 'closed'));
    const p2 = runCli(['plan', ...common, '--lookups', lookups]);
    assert.equal(p2.status, 0, p2.stderr);
    assert.deepEqual(jsonLines(p2.stdout), []);
    const r = runCli(['resolve', ...common, '--lookups', lookups]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(refOf(recOf(jsonLines(r.stdout), 1), 50).outcome, 'cleared');
  });
});

test('CLI: plan without --open exits 2 and names the flag', () => {
  const r = runCli(['plan', '--repo', REPO, '--limit', '500', '--cap', '20']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--open/);
  assert.equal(r.stdout, '');
});

test('CLI: a --repo outside owner/repo form is refused with exit 2', () => {
  withTmp((dir) => {
    const args = cliArgsFor(dir, [issueOf(1, 'Blocked by #5.')]);
    args[args.indexOf('--repo') + 1] = 'a;b';
    const r = runCli(['plan', ...args]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /repo/i);
    assert.equal(r.stdout, '');
  });
});

// ---- EPIC: the epic: / tracking: title prefix is an umbrella signal ----

test('EPIC: an epic: or tracking: title prefix makes an umbrella, and only that prefix does', () => {
  const issues = [
    issueOf(150, '- [ ] #151 the child', { title: 'epic: x' }),
    issueOf(151, 'The child.'),
    issueOf(152, 'No children.', { title: 'Tracking: y' }),
    issueOf(153, 'Plain.', { title: 'epicenter: z' }),
    issueOf(154, 'Plain.', { title: 'fix: epic bug' }),
  ];
  const out = resolve(dataOf(issues), OPTS);
  const withChild = recOf(out, 150);
  assert.equal(withChild.readiness.state, 'umbrella');
  assert.equal(withChild.readiness.routedTo, 151);
  assert.ok(withChild.readiness.decidedBy.some((x) => x.source === 'title-prefix'));
  const bare = recOf(out, 152);
  assert.equal(bare.readiness.state, 'umbrella');
  assert.equal(bare.readiness.rankable, false);
  assert.equal(bare.readiness.routedTo, null);
  assert.ok(bare.readiness.reason.includes('umbrella title prefix, no open child found'));
  assert.equal(recOf(out, 153).readiness.state, 'ready');
  assert.equal(recOf(out, 154).readiness.state, 'ready');
});

// ---- BANNER: a banner wins over native all-closed ----

test('BANNER: a banner with every native sub-issue closed is banner-no-open-child, not done-but-unclosed', () => {
  const banner = '> Kept as the umbrella and the analysis of record.';
  const withBanner = [issueOf(160, banner)];
  const without = [issueOf(161, 'Track the migration.')];
  const rowsOf = (n) => ({ [n]: srow(n, null, 2, 2) });
  const a = recOf(
    resolve(dataOf(withBanner, { structure: structureOf(withBanner, rowsOf(160)) }), OPTS),
    160,
  );
  assert.equal(a.readiness.state, 'banner-no-open-child');
  assert.equal(a.readiness.rankable, false);
  const b = recOf(
    resolve(dataOf(without, { structure: structureOf(without, rowsOf(161)) }), OPTS),
    161,
  );
  assert.equal(b.readiness.state, 'done-but-unclosed');
});

// ---- SELF: an issue never references itself ----

const SELF_REPO = 'example-org/example-repo';

test('SELF: a same-repo #N naming the issue itself is not emitted, a sibling on the line is', () => {
  const out = extract(
    issue('Relates to #51 (adjacent: #50 owns detection, #51 owns lint).', { number: 50 }),
    { repo: SELF_REPO },
  );
  assert.deepEqual(numbers(out), [51]);
});

test('SELF: a same-repo URL naming the issue itself is not emitted, a sibling URL is', () => {
  const base = `https://github.com/${SELF_REPO}/issues`;
  const out = extract(issue(`Blocked by ${base}/50 and ${base}/52`, { number: 50 }), {
    repo: SELF_REPO,
  });
  assert.deepEqual(numbers(out), [52]);
});

test('SELF: owner/repo#N naming --repo and the issue itself is not emitted, a sibling is', () => {
  const out = extract(
    issue(`Depends on ${SELF_REPO}#50, ${SELF_REPO}#53`, { number: 50 }),
    { repo: SELF_REPO },
  );
  assert.deepEqual(numbers(out), [53]);
});

test('SELF: the same number in another repo is a real reference', () => {
  const out = extract(issue('Blocked by example-org/example-lib#50', { number: 50 }), {
    repo: SELF_REPO,
  });
  assert.deepEqual(numbers(out), [50]);
});

// ---- SPACE: the "name #N" form applies to reference items only ----

test('SPACE: "Blocked by audit-core #12" is repo-ambiguous', () => {
  const out = extract(issue('Blocked by audit-core #12'));
  assert.equal(out.refs.length, 1);
  assert.equal(out.refs[0].target, null);
  assert.equal(out.refs[0].unresolvable, 'repo-ambiguous');
});

test('SPACE: "Depends on mcp-utils #35, c3source #9" gives one repo-ambiguous ref per item', () => {
  const out = extract(issue('Depends on mcp-utils #35, c3source #9'));
  assert.equal(out.refs.length, 2);
  for (const r of out.refs) {
    assert.equal(r.target, null);
    assert.equal(r.unresolvable, 'repo-ambiguous');
  }
});

test('SPACE: a word after "and" starts an item', () => {
  const out = extract(issue('Blocked by audit-core #12 and mcp-utils #35'));
  assert.equal(out.refs.filter((r) => r.unresolvable === 'repo-ambiguous').length, 2);
});

test('SPACE: "its split #740" is a plain same-repo reference', () => {
  const out = extract(issue('Relates to #737 and its split #740'));
  assert.deepEqual(numbers(out), [737, 740]);
  assert.ok(out.refs.every((r) => r.unresolvable === undefined));
});

test('SPACE: "sub-issues #189–#192" gives #189 and #192 as plain references', () => {
  const out = extract(issue('Relates to #183 and its sub-issues #189–#192'));
  assert.deepEqual(numbers(out), [183, 189, 192]);
  assert.ok(out.refs.every((r) => r.unresolvable === undefined));
});

// ---- MUT: strengthenings found by the mutation run (task 12). Each fixture puts
// the excluded text where nothing but its own rule can keep it out: a line that
// does not start with a statement verb, so the mid-line anchor cannot mask it. ----

test('MUT blockquote: a quoted reference under a Blocked by heading, and a quoted retraction, have no effect', () => {
  const out = extract(
    issue(['## Blocked by', '> #20 quoted from an older thread', '- #10'].join('\n'), {
      comments: [{ body: '> #10 is unblocked now.', createdAt: '2026-01-02T00:00:00Z' }],
    }),
  );
  assert.ok(numbers(out).includes(10));
  assert.ok(!numbers(out).includes(20));
  assert.notEqual(refTo(out, 10).retracted, true);
});

test('MUT struck: a struck reference in a statement or under a Blocked by heading, and a struck retraction, have no effect', () => {
  const out = extract(
    issue(
      ['Blocked by ~~#20~~ and #10.', '', '## Depends on', '- ~~#21~~ done', '- #11'].join('\n'),
      { comments: [{ body: '~~#10 is unblocked~~', createdAt: '2026-01-02T00:00:00Z' }] },
    ),
  );
  assert.deepEqual(numbers(out).sort((a, b) => a - b), [10, 11]);
  assert.notEqual(refTo(out, 10).retracted, true);
});

test('MUT inline code: a reference in code inside a statement, a heading section or a trigger is not extracted', () => {
  const out = extract(
    issue(
      [
        'Blocked by `#20` and #10.',
        '',
        '## Blocked by',
        '- `#21` the label, not a target',
        '- #11',
        '',
        'Deferral trigger: waits on `#22` and #12.',
      ].join('\n'),
    ),
  );
  assert.deepEqual(numbers(out).sort((a, b) => a - b), [10, 11, 12]);
});

test('MUT sameTarget repo: a retraction naming the same number in another repo has no effect, a case-different repo does', () => {
  const out = extract(
    issue('Blocked by #10.\nBlocked by Example-Org/Lib#11.', {
      comments: [
        {
          body: 'No longer blocked by example-org/other#10.\nNo longer blocked by example-org/lib#11.',
          createdAt: '2026-01-02T00:00:00Z',
        },
      ],
    }),
  );
  assert.notEqual(refTo(out, 10).retracted, true);
  assert.equal(refTo(out, 11).retracted, true);
});

test('MUT retraction order: a retraction withdraws only earlier references, not a later comment restating the blocker', () => {
  const out = extract(
    issue('Blocked by #10.', {
      comments: [
        { body: 'No longer blocked by #10.', createdAt: '2026-01-02T00:00:00Z' },
        { body: 'Blocked by #10.', createdAt: '2026-01-03T00:00:00Z' },
      ],
    }),
  );
  const refs = out.refs.filter((r) => r.target && r.target.number === 10);
  assert.equal(refs.length, 2);
  assert.equal(refs.find((r) => r.origin === 'body').retracted, true);
  assert.equal(refs.find((r) => r.origin === 'comment').retracted, false);
});

test('MUT retraction child row: a retraction never withdraws a checklist child row', () => {
  const out = extract(
    issue('- [ ] #10 the child step', {
      comments: [{ body: 'The blocker #10 is unblocked now.', createdAt: '2026-01-02T00:00:00Z' }],
    }),
  );
  assert.equal(refTo(out, 10).source, 'child-row');
  assert.equal(refTo(out, 10).retracted, false);
});

test('MUT banner Do not plan: the "Do not plan this issue" form is a self-declared banner', () => {
  const issues = [issueOf(170, 'Do not plan this issue; the work is tracked elsewhere.')];
  const rec = recOf(resolve(dataOf(issues, { structure: structureOf(issues) }), OPTS), 170);
  assert.ok(rec.banner);
  assert.equal(rec.readiness.state, 'banner-no-open-child');
});

test('MUT SAFE target: a repo with a dots-only segment never reaches a command and is repo-ambiguous', () => {
  const issues = [
    issueOf(1, 'Blocked by ../lib#5.\nBlocked by example-org/..#6.\nBlocked by example-org/example-lib#98.'),
  ];
  const d = dataOf(issues);
  const p = plan(d, OPTS);
  assert.deepEqual(
    p.map((e) => e.command).filter(Boolean).map((c) => /issues\/(\d+) /.exec(c)[1]),
    ['98'],
  );
  assert.ok(!p.some((e) => /\.\.\/|\/\.\./.test(e.command || '')));
  const rec = recOf(resolve(d, OPTS), 1);
  assert.equal(rec.refs.find((r) => r.target && r.target.number === 5).kind, 'repo-ambiguous');
  assert.equal(rec.refs.find((r) => r.target && r.target.number === 6).kind, 'repo-ambiguous');
});

test('MUT SAFE number: issue number 0 never reaches a command and is nonexistent', () => {
  const issues = [issueOf(1, 'Blocked by example-org/example-lib#0.\nBlocked by example-org/example-lib#98.')];
  const d = dataOf(issues);
  const p = plan(d, OPTS);
  assert.ok(!p.some((e) => /issues\/0 /.test(e.command || '')));
  assert.ok(p.some((e) => /issues\/98 /.test(e.command || '')));
  const rec = recOf(resolve(d, OPTS), 1);
  assert.equal(rec.refs.find((r) => r.target && r.target.number === 0).kind, 'nonexistent');
});

// ---- BULKTRUNC: the bulk comments and structure lists may be cut at -L ----

const CUT_NOTE_COMMENTS = 'comments: truncated (bulk list at its limit)';
const CUT_NOTE_STRUCTURE = 'native structure: truncated (bulk list at its limit)';

function bulkCommentsIssues() {
  return [
    issueOf(1, 'Prerequisite.'),
    issueOf(2, 'Prerequisite.'),
    issueOf(3, 'Prerequisite.'),
    issueOf(4, 'Blocked by #5.', { comments: [cm('No longer blocked by #5.')] }),
    issueOf(5, 'Prerequisite.'),
  ];
}

function bulkCommentsData() {
  return dataOf(bulkCommentsIssues(), {
    comments: { 1: [cm('Hello.')], 2: [cm('Hello.')], 3: [cm('Hello.')] },
  });
}

test('BULKTRUNC: an issue missing from a bulk comments list at its limit is flagged and its comments are unknown', () => {
  const out = resolve(bulkCommentsData(), { ...OPTS, limit: 3 });
  const missing = recOf(out, 4);
  assert.ok(missing.notes.includes(CUT_NOTE_COMMENTS));
  assert.notEqual(refOf(missing, 5).retracted, true);
  assert.notEqual(refOf(missing, 5).outcome, 'retracted');
  assert.equal(missing.retractedCount, 0);
  assert.ok(!recOf(out, 1).notes.includes(CUT_NOTE_COMMENTS));
  assert.ok(!recOf(out, 3).notes.includes(CUT_NOTE_COMMENTS));
});

test('BULKTRUNC: control, the same comments fixture under a larger limit carries no note', () => {
  const out = resolve(bulkCommentsData(), { ...OPTS, limit: 10 });
  assert.ok(!recOf(out, 4).notes.includes(CUT_NOTE_COMMENTS));
  assert.equal(recOf(out, 4).retractedCount, 1);
});

function bulkStructureData() {
  const issues = [
    issueOf(1, 'Prerequisite.'),
    issueOf(2, 'Prerequisite.'),
    issueOf(3, 'Prerequisite.'),
    issueOf(4, 'Prerequisite.'),
  ];
  return dataOf(issues, { structure: structureOf(issues.slice(0, 3)) });
}

test('BULKTRUNC: an issue missing from a bulk structure list at its limit is no-data, never no sub-issues', () => {
  const out = resolve(bulkStructureData(), { ...OPTS, limit: 3 });
  const missing = recOf(out, 4);
  assert.equal(missing.native.status, 'no-data');
  assert.ok(missing.notes.includes(CUT_NOTE_STRUCTURE));
  assert.ok(!missing.notes.includes('native structure: no data'));
  assert.notEqual(missing.readiness.state, 'done-but-unclosed');
  assert.equal(recOf(out, 1).native.status, 'data');
  assert.ok(!recOf(out, 1).notes.includes(CUT_NOTE_STRUCTURE));
});

test('BULKTRUNC: control, the same structure fixture under a larger limit gets the plain no-data note', () => {
  const missing = recOf(resolve(bulkStructureData(), { ...OPTS, limit: 10 }), 4);
  assert.equal(missing.native.status, 'no-data');
  assert.ok(missing.notes.includes('native structure: no data'));
  assert.ok(!missing.notes.includes(CUT_NOTE_STRUCTURE));
});

// ---- NOCOMM: no comments input at all is "no data", never "no comments" ----

const NO_COMMENT_NOTE = 'comments: no data';

function noCommentIssues(extra = {}) {
  return [
    issueOf(1, 'Prerequisite.', extra),
    issueOf(2, 'Blocked by #1.', extra),
  ];
}

test('NOCOMM: no comments input and issues without a comments field get the note and no comment-sourced conclusion', () => {
  const out = resolve({ open: noCommentIssues() }, OPTS);
  for (const n of [1, 2]) {
    assert.ok(recOf(out, n).notes.includes(NO_COMMENT_NOTE));
    assert.ok(!recOf(out, n).notes.includes(CUT_NOTE_COMMENTS));
  }
  // Body references still resolve normally.
  assert.equal(refOf(recOf(out, 2), 1).target.number, 1);
  assert.equal(recOf(out, 2).retractedCount, 0);
});

test('NOCOMM: a retraction that would sit in comments is not concluded when no comments were given', () => {
  const issues = [issueOf(1, 'Prerequisite.'), issueOf(2, 'Blocked by #1.')];
  const withData = resolve(
    dataOf(issues, { comments: { 2: [cm('No longer blocked by #1.')] } }),
    OPTS,
  );
  assert.equal(recOf(withData, 2).retractedCount, 1);
  const without = resolve({ open: issues }, OPTS);
  assert.equal(recOf(without, 2).retractedCount, 0);
  assert.ok(recOf(without, 2).notes.includes(NO_COMMENT_NOTE));
});

test('NOCOMM: control, the same issues each carrying comments: [] get no note', () => {
  const out = resolve({ open: noCommentIssues({ comments: [] }) }, OPTS);
  for (const n of [1, 2]) assert.ok(!recOf(out, n).notes.includes(NO_COMMENT_NOTE));
});

test('NOCOMM: control, a bulk comments array present carries no note', () => {
  const out = resolve(dataOf(noCommentIssues(), { comments: { 1: [cm('Hello.')] } }), OPTS);
  for (const n of [1, 2]) assert.ok(!recOf(out, n).notes.includes(NO_COMMENT_NOTE));
});
