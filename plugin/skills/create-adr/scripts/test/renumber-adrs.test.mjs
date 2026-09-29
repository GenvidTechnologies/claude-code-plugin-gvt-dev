import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

import { planRenumber, applyRenumber } from '../renumber-adrs.mjs';
import { discoverAdrs, buildTokenRewriter, isFrozenPath } from '../renumber-adrs.mjs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

// ---------------------------------------------------------------------------
// #581 — themed fixture builder + small D/E fixtures, and the CLI script path
// ---------------------------------------------------------------------------

const SCRIPT_PATH = fileURLToPath(new URL('../renumber-adrs.mjs', import.meta.url));

function writeFileAt(base, relPath, content) {
  const full = join(base, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

function gitInitAt(dir) {
  const opts = { cwd: dir, encoding: 'utf8', stdio: 'pipe' };
  spawnSync('git', ['init', '-q'], opts);
  spawnSync('git', ['config', 'user.email', 'test@example.com'], opts);
  spawnSync('git', ['config', 'user.name', 'Test'], opts);
  spawnSync('git', ['config', 'core.autocrlf', 'false'], opts);
  spawnSync('git', ['add', '-A'], opts);
  spawnSync('git', ['commit', '-q', '-m', 'initial'], opts);
}

/**
 * Themed fixture: two themes (alpha, beta) plus an empty theme, a
 * decisions/index.md, theme index.md's, a README.md, a date-named notes
 * file, every link form (sibling, cross-theme, bundle-absolute, theme-index,
 * root TOC, backtick bare pointer, backtick path pointer), boundary traps
 * (a filename prefix and a filename-plus-extension lookalike), a slug that
 * embeds another ADR's whole filename, a .json and a .mjs reference, the 5
 * frozen paths, a shared-slug pair across themes, and ADR-NNNN mentions
 * (moved, unmoved, and a space-separated non-hyphen form).
 *
 * One sequence 0001..0007 across both themes (highest = 7); 0001 never
 * moves under insert-at 2 and is used throughout as the "stays unchanged"
 * control.
 */
function buildThemedFixture() {
  const root = mkdtempSync(join(tmpdir(), 'renumber-adrs-themed-'));
  const decisionsDir = join(root, 'decisions');

  writeFileAt(root, 'decisions/index.md', '# Decisions\n\n- [alpha](alpha/index.md)\n- [beta](beta/index.md)\n');
  writeFileAt(root, 'decisions/alpha/index.md', '# alpha\n\n- [0001](0001-a.md)\n- [0003](0003-c.md)\n');
  writeFileAt(root, 'decisions/alpha/README.md', '# readme\n');
  writeFileAt(root, 'decisions/empty/index.md', '# empty theme\n');
  writeFileAt(root, 'decisions/2026-09-28-notes.md', '# notes\n');
  writeFileAt(root, 'decisions/beta/index.md', '# beta\n\n- [0002](0002-b.md)\n- [0004](0004-d.md)\n');
  writeFileAt(
    root,
    'decisions/alpha/0001-a.md',
    '# 0001. A\n\nSibling [C](0003-c.md). Cross [B](../beta/0002-b.md). Abs [D](/decisions/beta/0004-d.md).\n',
  );
  writeFileAt(
    root,
    'decisions/alpha/0003-c.md',
    '# 0003. C\n\nCross [D](../beta/0004-d.md). Self `' + '0003-c.md' + ':' + '3' + '`.\n',
  );
  writeFileAt(
    root,
    'decisions/alpha/0005-x.md',
    '# 0005. X\n\nSame slug other theme [X6](../beta/0006-x.md).\n',
  );
  writeFileAt(
    root,
    'decisions/alpha/0007-supersedes-0003-c.md',
    '# 0007. S\n\nSupersedes [C](0003-c.md).\n',
  );
  writeFileAt(
    root,
    'decisions/beta/0002-b.md',
    '# 0002. B\n\nSibling [D](0004-d.md). Cross [A](../alpha/0001-a.md). Pointer `' + '0003-c.md' + ':' + '12' + '`. ADR-0004 discussed here.\n',
  );
  writeFileAt(root, 'decisions/beta/0004-d.md', '# 0004. D\n\nCross [C](../alpha/0003-c.md).\n');
  writeFileAt(root, 'decisions/beta/0006-x.md', '# 0006. X\n\nSame slug [X5](../alpha/0005-x.md).\n');
  writeFileAt(
    root,
    'docs/TOC.md',
    '- [`decisions/alpha/0001-a.md`](decisions/alpha/0001-a.md)\n- [`decisions/beta/0002-b.md`](decisions/beta/0002-b.md)\n',
  );
  writeFileAt(
    root,
    'notes.md',
    'Backticked: `' + 'decisions/alpha/0003-c.md' + ':' + '7' + '`.\nFull name: 0007-supersedes-0003-c.md is superseded further.\n',
  );
  writeFileAt(root, 'shared.md', 'First [X6a](0006-x.md) then [X6b](0006-x.md) again.\n');
  writeFileAt(root, 'traps.md', 'x0003-c.md and 0003-c.md.bak and (0003-c.md)\n');
  writeFileAt(root, 'test/fx.json', '{ "file": "decisions/alpha/0003-c.md" }\n');
  writeFileAt(root, 'test/t.mjs', "const F = 'decisions/alpha/0003-c.md';\n");
  writeFileAt(root, 'CHANGELOG.md', '- shipped: decisions/alpha/0003-c.md\n');
  writeFileAt(root, 'raw/r.md', 'raw decisions/alpha/0003-c.md\n');
  writeFileAt(root, 'wiki/log.md', 'log decisions/alpha/0003-c.md\n');
  writeFileAt(root, 'docs/superpowers/s.md', 'sp decisions/alpha/0003-c.md\n');
  writeFileAt(root, '.pointer-baseline.json', '{ "file": "decisions/alpha/0003-c.md" }\n');
  writeFileAt(root, 'src/a.ts', '// ADR-0003 moved\n// ADR-0001 unmoved\n// ADR 0002 moved\n');

  gitInitAt(root);

  return { root, decisionsDir };
}

/**
 * Duplicate-number-across-themes fixture (D): 0002-b.md in alpha and
 * 0002-z.md in beta share the number 2.
 */
function buildDuplicateFixture() {
  const root = mkdtempSync(join(tmpdir(), 'renumber-adrs-dup-'));
  const decisionsDir = join(root, 'decisions');
  writeFileAt(root, 'decisions/alpha/0001-a.md', '# 0001. A\n');
  writeFileAt(root, 'decisions/alpha/0002-b.md', '# 0002. B\n');
  writeFileAt(root, 'decisions/beta/0002-z.md', '# 0002. Z\n');
  gitInitAt(root);
  return { root, decisionsDir };
}

/**
 * No-ADRs fixture (E): a decisions/ dir that exists but holds no ADR files.
 */
function buildEmptyFixture() {
  const root = mkdtempSync(join(tmpdir(), 'renumber-adrs-empty-'));
  const decisionsDir = join(root, 'decisions');
  writeFileAt(root, 'decisions/index.md', '# none\n');
  gitInitAt(root);
  return { root, decisionsDir };
}

// ---------------------------------------------------------------------------
// #581 tests 1-6 — discovery / errors / CLI validation → task 2 (F1)
// ---------------------------------------------------------------------------

test('#581 discovery recursive-across-themes', () => {
  const { root, decisionsDir } = buildThemedFixture();
  try {
    const plan = planRenumber({ dir: decisionsDir, insertAt: 2 });
    assert.equal(plan.moves.length, 6, 'moves across both themes for insert-at 2 (highest 7, one sequence)');

    const byOldNum = new Map(plan.moves.map((m) => [m.oldNum, m]));
    const seven = byOldNum.get(7);
    assert.equal(seven?.relDir, 'alpha', 'relDir is preserved for the alpha-theme move');
    assert.equal(seven?.oldPath, 'alpha/0007-supersedes-0003-c.md', 'oldPath is the pre-move path relative to dir');
    assert.equal(seven?.newPath, 'alpha/0008-supersedes-0003-c.md', 'newPath is the post-move path relative to dir');

    const six = byOldNum.get(6);
    assert.equal(six?.relDir, 'beta', 'relDir is preserved for the beta-theme move');

    for (const m of plan.moves) {
      assert.ok(m.oldNum >= 2, `only ADRs >= 2 are moved, got ${m.oldNum}`);
    }
  } finally {
    cleanup(root);
  }
});

test('#581 index/README/date-named excluded', () => {
  const { root, decisionsDir } = buildThemedFixture();
  try {
    const plan = planRenumber({ dir: decisionsDir, insertAt: 1 });
    assert.equal(plan.highest, 7, 'index.md, README.md and the date-named file are excluded from discovery');

    // Supplementary direct check of the pure helper itself.
    const { adrs, duplicates } = discoverAdrs(decisionsDir);
    assert.equal(adrs.length, 7, 'discoverAdrs finds all 7 themed ADRs directly');
    assert.equal(duplicates.size, 0, 'no duplicate numbers in the themed fixture');
  } finally {
    cleanup(root);
  }
});

test('#581 empty theme', () => {
  const { root, decisionsDir } = buildThemedFixture();
  try {
    const plan = planRenumber({ dir: decisionsDir, insertAt: 8 });
    assert.equal(plan.highest, 7, 'an empty theme directory contributes no ADRs and no error');
    assert.equal(plan.moves.length, 0, 'insert-at beyond highest is a no-op even with an empty theme present');
  } finally {
    cleanup(root);
  }
});

test('#581 duplicate throws before change', () => {
  const { root, decisionsDir } = buildDuplicateFixture();
  try {
    assert.throws(
      () => planRenumber({ dir: decisionsDir, insertAt: 2 }),
      (err) => {
        assert.equal(err.code, 'EDUPLICATE', 'duplicate ADR number raises EDUPLICATE');
        assert.match(err.message, /0002-b\.md/, 'error names the first duplicate path');
        assert.match(err.message, /0002-z\.md/, 'error names the second duplicate path');
        return true;
      },
    );

    const status = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
    assert.equal(status.stdout.trim(), '', 'no change is made before the duplicate is raised');
  } finally {
    cleanup(root);
  }
});

test('#581 insert-at 0/-1/non-integer rejected (CLI rc 1, no node:internal in stderr)', () => {
  const { root, decisionsDir } = buildThemedFixture();
  try {
    for (const bad of ['0', '-1', '3abc']) {
      const result = spawnSync(
        process.execPath,
        [SCRIPT_PATH, '--dir', decisionsDir, '--insert-at', bad],
        { encoding: 'utf8' },
      );
      assert.equal(result.status, 1, `--insert-at ${bad} must exit 1`);
      assert.doesNotMatch(result.stderr, /node:internal/, `--insert-at ${bad} must not print a stack trace`);
      const lines = result.stderr.trim().split('\n').filter(Boolean);
      assert.equal(lines.length, 1, `--insert-at ${bad} must print exactly one stderr line, got:\n${result.stderr}`);
    }
  } finally {
    cleanup(root);
  }
});

test('#581 no ADRs is an error', () => {
  const { root, decisionsDir } = buildEmptyFixture();
  try {
    const result = spawnSync(
      process.execPath,
      [SCRIPT_PATH, '--dir', decisionsDir, '--insert-at', '1'],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 1, 'no ADRs in dir must exit 1');

    const missingDir = join(root, 'decisions', 'does-not-exist');
    const result2 = spawnSync(
      process.execPath,
      [SCRIPT_PATH, '--dir', missingDir, '--insert-at', '1'],
      { encoding: 'utf8' },
    );
    assert.equal(result2.status, 1, 'a missing dir must also exit 1');
  } finally {
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// #581 tests 7-12, 15 — token rewrite, moved-file links, shared slug,
// boundaries, .json/.mjs, frozen paths, staging → task 3 (F2)
// ---------------------------------------------------------------------------

test('#581 per-link-form positive controls', () => {
  const { root, decisionsDir } = buildThemedFixture();
  try {
    applyRenumber({ dir: decisionsDir, insertAt: 2 });

    const alphaOne = readFileSync(join(decisionsDir, 'alpha', '0001-a.md'), 'utf8');
    assert.match(alphaOne, /Sibling \[C\]\(0004-c\.md\)/, 'sibling link rewritten');
    assert.match(alphaOne, /Cross \[B\]\(\.\.\/beta\/0003-b\.md\)/, 'cross-theme link rewritten');
    assert.match(alphaOne, /Abs \[D\]\(\/decisions\/beta\/0005-d\.md\)/, 'bundle-absolute link rewritten');

    const alphaIndex = readFileSync(join(decisionsDir, 'alpha', 'index.md'), 'utf8');
    assert.match(alphaIndex, /\[0003\]\(0004-c\.md\)/, 'theme index link rewritten');
    assert.match(alphaIndex, /\[0001\]\(0001-a\.md\)/, 'unmoved 0001-a.md reference is a control and stays unchanged');

    const toc = readFileSync(join(root, 'docs', 'TOC.md'), 'utf8');
    assert.match(toc, /decisions\/beta\/0003-b\.md/, 'root TOC backtick-path link rewritten');
    assert.match(toc, /decisions\/alpha\/0001-a\.md/, 'unmoved TOC row is a control and stays unchanged');

    const notes = readFileSync(join(root, 'notes.md'), 'utf8');
    assert.match(notes, /decisions\/alpha\/0004-c\.md:7/, 'backtick bare pointer rewritten');
  } finally {
    cleanup(root);
  }
});

test('#581 links inside moved files', () => {
  const { root, decisionsDir } = buildThemedFixture();
  try {
    applyRenumber({ dir: decisionsDir, insertAt: 2 });

    const movedC = readFileSync(join(decisionsDir, 'alpha', '0004-c.md'), 'utf8');
    assert.match(movedC, /Cross \[D\]\(\.\.\/beta\/0005-d\.md\)/, 'moved file cross-link rewritten to new target');
    assert.match(movedC, /Self `0004-c\.md:3`/, "moved file self-pointer rewritten to its own new name");

    const movedB = readFileSync(join(decisionsDir, 'beta', '0003-b.md'), 'utf8');
    assert.match(movedB, /Sibling \[D\]\(0005-d\.md\)/, 'moved file sibling link rewritten');
    assert.match(
      movedB,
      /Cross \[A\]\(\.\.\/alpha\/0001-a\.md\)/,
      'unmoved cross-link inside a moved file is a control and stays unchanged',
    );
    assert.match(movedB, /Pointer `0004-c\.md:12`/, 'moved file cross-pointer rewritten');
  } finally {
    cleanup(root);
  }
});

test('#581 shared slug once', () => {
  const { root, decisionsDir } = buildThemedFixture();
  try {
    applyRenumber({ dir: decisionsDir, insertAt: 2 });

    const movedX5 = readFileSync(join(decisionsDir, 'alpha', '0006-x.md'), 'utf8');
    assert.match(
      movedX5,
      /Same slug other theme \[X6\]\(\.\.\/beta\/0007-x\.md\)/,
      'shared-slug cross-theme link maps to its own new number, not the sibling slug pair',
    );

    const movedX6 = readFileSync(join(decisionsDir, 'beta', '0007-x.md'), 'utf8');
    assert.match(
      movedX6,
      /Same slug \[X5\]\(\.\.\/alpha\/0006-x\.md\)/,
      'shared-slug cross-theme link maps to its own new number',
    );

    const shared = readFileSync(join(root, 'shared.md'), 'utf8');
    assert.match(
      shared,
      /First \[X6a\]\(0007-x\.md\) then \[X6b\]\(0007-x\.md\) again\./,
      'both mentions of the same old filename map once, no double shift',
    );
  } finally {
    cleanup(root);
  }
});

test('#581 token boundaries', () => {
  const { root, decisionsDir } = buildThemedFixture();
  try {
    applyRenumber({ dir: decisionsDir, insertAt: 2 });

    const traps = readFileSync(join(root, 'traps.md'), 'utf8');
    assert.equal(
      traps,
      'x0003-c.md and 0003-c.md.bak and (0004-c.md)\n',
      'only the bare parenthesized token is rewritten; the x-prefixed and .bak-suffixed lookalikes are untouched',
    );

    const notes = readFileSync(join(root, 'notes.md'), 'utf8');
    assert.match(
      notes,
      /Full name: 0008-supersedes-0003-c\.md is superseded further\./,
      "the moved file's whole old filename is rewritten in one shot; the embedded 0003-c.md tail is not separately rewritten",
    );

    const supersedes = readFileSync(join(decisionsDir, 'alpha', '0008-supersedes-0003-c.md'), 'utf8');
    assert.match(supersedes, /Supersedes \[C\]\(0004-c\.md\)/, 'the link inside the renamed file is rewritten');

    // Supplementary direct check of the pure helper itself.
    const rewriter = buildTokenRewriter(
      new Map([
        ['0003-c.md', '0004-c.md'],
        ['0007-supersedes-0003-c.md', '0008-supersedes-0003-c.md'],
      ]),
    );
    const probe = rewriter('x0003-c.md and 0003-c.md.bak and (0003-c.md) and 0007-supersedes-0003-c.md');
    assert.equal(
      probe.text,
      'x0003-c.md and 0003-c.md.bak and (0004-c.md) and 0008-supersedes-0003-c.md',
      'buildTokenRewriter itself respects filename-token boundaries (longest-first, lookbehind/lookahead)',
    );
  } finally {
    cleanup(root);
  }
});

test('#581 .json+.mjs follow', () => {
  const { root, decisionsDir } = buildThemedFixture();
  try {
    applyRenumber({ dir: decisionsDir, insertAt: 2 });

    const json = readFileSync(join(root, 'test', 'fx.json'), 'utf8');
    assert.match(json, /"file": "decisions\/alpha\/0004-c\.md"/, '.json references follow the rename');

    const mjs = readFileSync(join(root, 'test', 't.mjs'), 'utf8');
    assert.match(mjs, /const F = 'decisions\/alpha\/0004-c\.md';/, '.mjs references follow the rename');
  } finally {
    cleanup(root);
  }
});

test('#581 frozen paths untouched and listed', () => {
  const { root, decisionsDir } = buildThemedFixture();
  try {
    const plan = applyRenumber({ dir: decisionsDir, insertAt: 2 });

    const frozenFiles = ['CHANGELOG.md', 'raw/r.md', 'wiki/log.md', 'docs/superpowers/s.md', '.pointer-baseline.json'];
    for (const rel of frozenFiles) {
      const content = readFileSync(join(root, rel), 'utf8');
      assert.match(content, /0003-c\.md/, `${rel} keeps referencing the old ADR name (frozen, never rewritten)`);
      assert.doesNotMatch(content, /0004-c\.md/, `${rel} must not be rewritten`);
    }

    assert.equal(plan.excluded?.length, 5, 'plan.excluded lists exactly the 5 frozen files');
    for (const rel of frozenFiles) {
      assert.ok(plan.excluded?.includes(rel), `plan.excluded must list ${rel}`);
    }

    // Supplementary direct check of the pure helper itself.
    for (const rel of frozenFiles) {
      assert.equal(isFrozenPath(rel, {}), true, `isFrozenPath(${rel}) is true with default raw/wiki dirs`);
    }
    assert.equal(isFrozenPath('decisions/alpha/0003-c.md', {}), false, 'a non-frozen ADR path is not frozen (control)');
  } finally {
    cleanup(root);
  }
});

test('#581 apply stages everything', () => {
  const { root, decisionsDir } = buildThemedFixture();
  try {
    applyRenumber({ dir: decisionsDir, insertAt: 2 });

    const status = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
    const lines = status.stdout.split('\n').filter(Boolean);
    assert.ok(lines.length > 0, 'apply must produce a non-empty set of changes');

    const dirty = lines.filter((l) => l[1] !== ' ');
    assert.equal(dirty.length, 0, `every change must be staged; dirty entries:\n${dirty.join('\n')}`);

    const rewrittenAlphaOne = lines.some((l) => l.includes('alpha/0001-a.md'));
    assert.ok(rewrittenAlphaOne, 'the unmoved-but-rewritten alpha/0001-a.md content change must be staged');
  } finally {
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// #581 tests 13-14 — ADR-NNNN moved-only report, post-move reportFile
// → task 4 (F3)
// ---------------------------------------------------------------------------

test('#581 ADR-NNNN moved-only, report-only', () => {
  const { root, decisionsDir } = buildThemedFixture();
  try {
    const before = readFileSync(join(root, 'src', 'a.ts'), 'utf8');
    const plan = applyRenumber({ dir: decisionsDir, insertAt: 2 });

    const after = readFileSync(join(root, 'src', 'a.ts'), 'utf8');
    assert.equal(after, before, 'ADR-NNNN mentions are report-only; file content is never rewritten');

    const hits = plan.ambiguous.filter((r) => r.file.includes('a.ts'));
    assert.ok(hits.some((r) => /ADR-0003/.test(r.lineText)), 'moved number 3 (hyphen form) is reported');
    assert.ok(!hits.some((r) => /ADR-0001\b/.test(r.lineText)), 'unmoved ADR-0001 is a control and must not be reported');
    assert.ok(!hits.some((r) => /ADR 0002/.test(r.lineText)), 'space-separated form is not the ADR-NNNN pattern and must not be reported');
  } finally {
    cleanup(root);
  }
});

test('#581 report cites post-move path', () => {
  const { root, decisionsDir } = buildThemedFixture();
  try {
    const plan = applyRenumber({ dir: decisionsDir, insertAt: 2 });

    const hit = plan.ambiguous.find((r) => /ADR-0004/.test(r.lineText));
    assert.ok(hit, 'the ADR-0004 mention inside the moved beta file is reported');
    assert.equal(hit.reportFile, 'decisions/beta/0003-b.md', 'reportFile cites the post-move path, not the pre-move 0002-b.md');
    assert.ok(!hit.reportFile.includes('0002-b.md'), 'reportFile must not cite the stale pre-move name');
  } finally {
    cleanup(root);
  }
});
