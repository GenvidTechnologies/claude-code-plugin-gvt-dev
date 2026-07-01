import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

import { planRenumber, applyRenumber } from '../renumber-adrs.mjs';

// ---------------------------------------------------------------------------
// Fixture builder
// ---------------------------------------------------------------------------

const ADR_NAMES = [
  'alpha', 'beta', 'gamma', 'delta', 'epsilon',
  'zeta', 'eta', 'theta', 'iota', 'kappa',
];

/**
 * Build a temp directory with 10 ADR files + src/foo.ts + docs/TOC.md.
 * git-init is optional (needed for apply tests that check clean-tree gate or
 * use git mv).
 */
function buildFixture({ gitInit = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'renumber-adrs-test-'));

  // Create decisions/ subdir to hold ADRs
  const decisionsDir = join(dir, 'decisions');
  mkdirSync(decisionsDir, { recursive: true });

  // Create ADR files 0001-alpha.md .. 0010-kappa.md
  for (let i = 0; i < 10; i++) {
    const num = i + 1;
    const padded = String(num).padStart(4, '0');
    const name = ADR_NAMES[i];
    const filename = `${padded}-${name}.md`;

    let body = `# ${padded}. ${name.charAt(0).toUpperCase() + name.slice(1)}\n\nStatus: Accepted\n`;

    // 0005-epsilon.md: one link to a file that won't move (0003-gamma.md)
    // and one link to a file that WILL move (0007-eta.md) when inserting at 6
    if (num === 5) {
      body += `\n[see also](0003-gamma.md)\n[later](0007-eta.md)\n`;
    }

    writeFileSync(join(decisionsDir, filename), body, 'utf8');
  }

  // src/foo.ts with ambiguous reference
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'foo.ts'), '// See ADR 0006\nexport const x = 1;\n', 'utf8');

  // docs/TOC.md with a TOC row for 0006-zeta.md
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(
    join(dir, 'docs', 'TOC.md'),
    '# Table of Contents\n\n## Decision Records\n\n- [`decisions/0006-zeta.md`](decisions/0006-zeta.md) — zeta\n',
    'utf8',
  );

  if (gitInit) {
    const opts = { cwd: dir, encoding: 'utf8', stdio: 'pipe' };
    spawnSync('git', ['init'], opts);
    spawnSync('git', ['config', 'user.email', 'test@example.com'], opts);
    spawnSync('git', ['config', 'user.name', 'Test'], opts);
    spawnSync('git', ['add', '-A'], opts);
    spawnSync('git', ['commit', '-m', 'initial'], opts);
  }

  return { dir, decisionsDir };
}

function cleanup(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Test 1: insert-at-6 dry-run — correct moves (highest-down, 5 of them)
// ---------------------------------------------------------------------------

test('planRenumber: insert-at-6 produces exactly 5 moves, highest-down', () => {
  const { dir, decisionsDir } = buildFixture();
  try {
    const plan = planRenumber({ dir: decisionsDir, insertAt: 6 });

    assert.equal(plan.moves.length, 5, 'exactly 5 moves for insert-at-6 with 10 ADRs');

    // Moves must be highest-down: 0010->0011, 0009->0010, 0008->0009, 0007->0008, 0006->0007
    const expected = [
      { oldNum: 10, newNum: 11, oldName: '0010-kappa.md', newName: '0011-kappa.md' },
      { oldNum: 9,  newNum: 10, oldName: '0009-iota.md',  newName: '0010-iota.md'  },
      { oldNum: 8,  newNum: 9,  oldName: '0008-theta.md', newName: '0009-theta.md' },
      { oldNum: 7,  newNum: 8,  oldName: '0007-eta.md',   newName: '0008-eta.md'   },
      { oldNum: 6,  newNum: 7,  oldName: '0006-zeta.md',  newName: '0007-zeta.md'  },
    ];
    for (let i = 0; i < expected.length; i++) {
      assert.equal(plan.moves[i].oldNum, expected[i].oldNum, `move[${i}].oldNum`);
      assert.equal(plan.moves[i].newNum, expected[i].newNum, `move[${i}].newNum`);
      assert.equal(plan.moves[i].oldName, expected[i].oldName, `move[${i}].oldName`);
      assert.equal(plan.moves[i].newName, expected[i].newName, `move[${i}].newName`);
    }

    // 0001-0005 must NOT appear in moves
    for (const m of plan.moves) {
      assert.ok(m.oldNum >= 6, `only ADRs >= 6 are moved, got ${m.oldNum}`);
    }
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// Test 2: zero-pad preservation
// ---------------------------------------------------------------------------

test('planRenumber: output names are always 4-digit zero-padded', () => {
  const { dir, decisionsDir } = buildFixture();
  try {
    const plan = planRenumber({ dir: decisionsDir, insertAt: 6 });
    for (const m of plan.moves) {
      assert.match(m.oldName, /^\d{4}-/, `oldName ${m.oldName} must start with 4-digit prefix`);
      assert.match(m.newName, /^\d{4}-/, `newName ${m.newName} must start with 4-digit prefix`);
    }
    // Specifically: 0010 -> 0011 not 10 -> 11
    const last = plan.moves[0];
    assert.equal(last.oldName, '0010-kappa.md');
    assert.equal(last.newName, '0011-kappa.md');
    // 0009 -> 0010
    assert.equal(plan.moves[1].newName, '0010-iota.md');
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// Test 3: relative-link handling — moved target flagged, unmoved not flagged
// ---------------------------------------------------------------------------

test('planRenumber: [later](0007-eta.md) is unambiguous (target moves); [see also](0003-gamma.md) is NOT', () => {
  const { dir, decisionsDir } = buildFixture();
  try {
    const plan = planRenumber({ dir: decisionsDir, insertAt: 6 });

    // The link [later](0007-eta.md) — 0007 moves to 0008 — should be in unambiguous
    const laterFix = plan.unambiguous.find(
      (r) => r.kind === 'relative-link' && r.oldText === '0007-eta.md',
    );
    assert.ok(laterFix, '[later](0007-eta.md) must be in unambiguous bucket');
    assert.equal(laterFix.newText, '0008-eta.md', 'rewrite target must be 0008-eta.md');

    // The link [see also](0003-gamma.md) — 0003 does NOT move — must NOT appear in unambiguous
    const gammaFix = plan.unambiguous.find(
      (r) => r.kind === 'relative-link' && r.oldText === '0003-gamma.md',
    );
    assert.equal(gammaFix, undefined, '[see also](0003-gamma.md) must NOT appear in unambiguous bucket');
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// Test 4: ambiguous bucket — src/foo.ts `// See ADR 0006` reported, not rewritten
// ---------------------------------------------------------------------------

test('planRenumber: // See ADR 0006 in src/foo.ts is in ambiguous bucket (not unambiguous)', () => {
  const { dir, decisionsDir } = buildFixture();
  try {
    const plan = planRenumber({ dir: decisionsDir, insertAt: 6 });

    const ambig = plan.ambiguous.find(
      (r) => r.file.includes('foo.ts'),
    );
    assert.ok(ambig, 'src/foo.ts must appear in ambiguous report');
    assert.ok(ambig.lineText.includes('ADR 0006'), 'lineText must include ADR 0006');

    // Must NOT be in unambiguous
    const unambig = plan.unambiguous.find((r) => r.file.includes('foo.ts'));
    assert.equal(unambig, undefined, 'src/foo.ts must NOT appear in unambiguous bucket');
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// Test 5: append (insert-at == highest+1) — zero moves
// ---------------------------------------------------------------------------

test('planRenumber: insert-at == highest+1 produces zero moves (append / identity)', () => {
  const { dir, decisionsDir } = buildFixture();
  try {
    const plan = planRenumber({ dir: decisionsDir, insertAt: 11 }); // highest is 10
    assert.equal(plan.moves.length, 0, 'no moves for append position');
    assert.equal(plan.headingEdits.length, 0, 'no heading edits');
    assert.equal(plan.unambiguous.length, 0, 'no unambiguous refs');
  } finally {
    cleanup(dir);
  }
});

test('planRenumber: insert-at > highest also produces zero moves', () => {
  const { dir, decisionsDir } = buildFixture();
  try {
    const plan = planRenumber({ dir: decisionsDir, insertAt: 99 });
    assert.equal(plan.moves.length, 0, 'no moves when insertAt is way beyond highest');
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// Test 6: apply — file renames, heading edits, TOC rewrite, foo.ts untouched
// ---------------------------------------------------------------------------

test('applyRenumber: insert-at-6 renames files, rewrites headings and TOC, leaves foo.ts untouched', () => {
  const { dir, decisionsDir } = buildFixture({ gitInit: true });
  try {
    applyRenumber({ dir: decisionsDir, insertAt: 6 });

    // 0006-zeta.md -> 0007-zeta.md
    const zetaPath = join(decisionsDir, '0007-zeta.md');
    const zetaContent = readFileSync(zetaPath, 'utf8');
    assert.ok(zetaContent.startsWith('# 0007.'), `0007-zeta.md heading should start with "# 0007." got: ${zetaContent.slice(0, 30)}`);

    // 0007-eta.md -> 0008-eta.md
    const etaPath = join(decisionsDir, '0008-eta.md');
    const etaContent = readFileSync(etaPath, 'utf8');
    assert.ok(etaContent.startsWith('# 0008.'), `0008-eta.md heading should start with "# 0008." got: ${etaContent.slice(0, 30)}`);

    // TOC row should be rewritten
    const toc = readFileSync(join(dir, 'docs', 'TOC.md'), 'utf8');
    assert.ok(toc.includes('decisions/0007-zeta.md'), 'TOC must reference decisions/0007-zeta.md');
    assert.ok(!toc.includes('decisions/0006-zeta.md'), 'TOC must NOT reference the old decisions/0006-zeta.md');

    // src/foo.ts must be unchanged
    const foo = readFileSync(join(dir, 'src', 'foo.ts'), 'utf8');
    assert.ok(foo.includes('// See ADR 0006'), 'src/foo.ts must be unchanged (ambiguous ref)');

    // No dangling relative link: 0005-epsilon.md's [later] link must be rewritten
    const epsilonPath = join(decisionsDir, '0005-epsilon.md');
    const epsilonContent = readFileSync(epsilonPath, 'utf8');
    assert.ok(
      epsilonContent.includes('0008-eta.md'),
      `0005-epsilon.md [later] link must be rewritten to 0008-eta.md, got:\n${epsilonContent}`,
    );
    assert.ok(
      !epsilonContent.includes('0007-eta.md'),
      '0005-epsilon.md must NOT reference old 0007-eta.md link',
    );
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// Test 7: clean-tree gate — dirty worktree prevents apply
// ---------------------------------------------------------------------------

test('applyRenumber: exits non-zero when worktree is dirty, performs no moves', () => {
  const { dir, decisionsDir } = buildFixture({ gitInit: true });
  try {
    // Make a dirty change
    writeFileSync(join(dir, 'dirty.md'), 'unstaged file\n', 'utf8');

    let exitCode = null;
    const origExit = process.exit;
    process.exit = (code) => { exitCode = code; throw new Error(`process.exit(${code})`); };

    try {
      applyRenumber({ dir: decisionsDir, insertAt: 6 });
    } catch (e) {
      if (!e.message.startsWith('process.exit(')) throw e;
    } finally {
      process.exit = origExit;
    }

    assert.ok(exitCode !== 0, `expected non-zero exit code, got ${exitCode}`);

    // The original 0006-zeta.md must still be there (no moves applied)
    const zetaOld = join(decisionsDir, '0006-zeta.md');
    let exists = false;
    try { readFileSync(zetaOld, 'utf8'); exists = true; } catch { /* ok */ }
    assert.ok(exists, '0006-zeta.md must still exist (no moves applied on dirty tree)');
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// Test 8: heading edits use the correct old->new prefix
// ---------------------------------------------------------------------------

test('planRenumber: headingEdits map old prefix to new prefix correctly', () => {
  const { dir, decisionsDir } = buildFixture();
  try {
    const plan = planRenumber({ dir: decisionsDir, insertAt: 6 });

    // Find the heading edit for 0006->0007 (zeta)
    const zetaEdit = plan.headingEdits.find((e) => e.filename === '0007-zeta.md');
    assert.ok(zetaEdit, 'headingEdits must include an entry for 0007-zeta.md');
    assert.equal(zetaEdit.oldHeadingPrefix, '# 0006.', 'old heading prefix');
    assert.equal(zetaEdit.newHeadingPrefix, '# 0007.', 'new heading prefix');

    // 0010->0011 kappa
    const kappaEdit = plan.headingEdits.find((e) => e.filename === '0011-kappa.md');
    assert.ok(kappaEdit, 'headingEdits must include 0011-kappa.md');
    assert.equal(kappaEdit.oldHeadingPrefix, '# 0010.', 'old heading for kappa');
    assert.equal(kappaEdit.newHeadingPrefix, '# 0011.', 'new heading for kappa');
  } finally {
    cleanup(dir);
  }
});
