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
