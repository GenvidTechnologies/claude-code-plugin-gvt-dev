import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

import {
  checkDeadLinks,
  checkOutOfBundleLinks,
  checkOrphanedPages,
  lintWiki,
} from '../lib/checks.mjs';

async function withTempRepo(setup) {
  const dir = await mkdtemp(join(tmpdir(), 'checks-test-'));
  try {
    await setup(dir);
    return dir;
  } catch (err) {
    await rm(dir, { recursive: true, force: true });
    throw err;
  }
}

async function writeRepoFile(dir, rel, content) {
  const path = join(dir, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

function findKind(findings, kind) {
  return findings.filter((f) => f.kind === kind);
}

// ---------------------------------------------------------------------------
// checkDeadLinks
// ---------------------------------------------------------------------------

test('checkDeadLinks: a link inside the bundle to a missing file is reported dead', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'wiki/index.md', '[a](a.md)\n');
    await writeRepoFile(
      d,
      'wiki/a.md',
      '# A\n\n[good](/index.md)\n[bad](/nope.md)\n',
    );
  });
  try {
    const findings = await checkDeadLinks(dir, 'wiki');
    assert.equal(findings.length, 1);
    assert.equal(findings[0].kind, 'dead-link');
    assert.equal(findings[0].page, 'wiki/a.md');
    assert.equal(findings[0].target, '/nope.md');
    assert.equal(findings[0].resolvedTarget, 'wiki/nope.md');
    // Control, same fixture: the good link to an existing page is NOT
    // reported — proves this discriminates rather than flagging every link.
    assert.ok(!findings.some((f) => f.target === '/index.md'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('checkDeadLinks: an out-of-bundle link, even a missing one, is never reported here', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'wiki/index.md', '[a](a.md)\n');
    await writeRepoFile(d, 'wiki/a.md', '[outside](../docs/nope.md)\n');
  });
  try {
    const findings = await checkDeadLinks(dir, 'wiki');
    assert.deepEqual(findings, []);
    // Control: the same missing out-of-bundle target IS reported, just under
    // the other check — proves this isn't silently dropped, only re-homed.
    const outOfBundle = await checkOutOfBundleLinks(dir, 'wiki');
    assert.equal(outOfBundle.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// A reserved file is exempt from being *listed* (it cannot be orphaned), not
// from having its own links read. SKILL.md subtracts index.md and log.md from
// the orphan candidate set specifically; scoping the link scan to that same
// set would mean lint — the only check that ever looks — silently never reads
// a link written into log.md or an index.
test('checkDeadLinks: reserved files are link-scanned; only orphan candidacy exempts them', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'wiki/index.md', '[bad](/gone-a.md)\n');
    await writeRepoFile(d, 'wiki/log.md', '[bad](/gone-b.md)\n');
  });
  try {
    const findings = await checkDeadLinks(dir, 'wiki');
    const pages = findings.map((f) => f.page).sort();
    assert.deepEqual(pages, ['wiki/index.md', 'wiki/log.md']);

    // Control against a resolver that simply flags everything: the same two
    // reserved files with links that DO resolve produce nothing.
    await writeRepoFile(dir, 'wiki/real.md', '# Real\n');
    await writeRepoFile(dir, 'wiki/index.md', '[ok](/real.md)\n');
    await writeRepoFile(dir, 'wiki/log.md', '[ok](/real.md)\n');
    assert.deepEqual(await checkDeadLinks(dir, 'wiki'), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('checkDeadLinks: zero dead links across a clean bundle', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'wiki/index.md', '[a](a.md)\n');
    await writeRepoFile(d, 'wiki/a.md', '[home](/index.md)\n');
  });
  try {
    const findings = await checkDeadLinks(dir, 'wiki');
    assert.deepEqual(findings, []);
    // Control, same fixture: introducing a dead link changes the result —
    // proves the [] isn't a vacuous always-empty return.
    await writeRepoFile(dir, 'wiki/a.md', '[home](/index.md)\n[bad](/nope.md)\n');
    const control = await checkDeadLinks(dir, 'wiki');
    assert.equal(control.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// checkOutOfBundleLinks
// ---------------------------------------------------------------------------

test('checkOutOfBundleLinks: an escaping link that exists on disk is a note, not a dead link', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'wiki/index.md', '[a](a.md)\n');
    await writeRepoFile(d, 'docs/decisions/0001-x.md', '# ADR\n');
    await writeRepoFile(d, 'wiki/a.md', '[adr](../docs/decisions/0001-x.md)\n');
  });
  try {
    const findings = await checkOutOfBundleLinks(dir, 'wiki');
    assert.equal(findings.length, 1);
    assert.equal(findings[0].kind, 'out-of-bundle-link');
    assert.equal(findings[0].severity, 'info');
    assert.equal(findings[0].resolvedTarget, 'docs/decisions/0001-x.md');
    assert.ok(!findings[0].detail.includes('dead as well'));
    // Control: the same page has no dead-link finding for this target.
    const dead = await checkDeadLinks(dir, 'wiki');
    assert.deepEqual(dead, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('checkOutOfBundleLinks: an escaping link that does not exist is flagged dead-as-well', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'wiki/index.md', '[a](a.md)\n');
    await writeRepoFile(d, 'wiki/a.md', '[gone](../docs/decisions/9999-nope.md)\n');
  });
  try {
    const findings = await checkOutOfBundleLinks(dir, 'wiki');
    assert.equal(findings.length, 1);
    assert.ok(findings[0].detail.includes('dead as well'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('checkOutOfBundleLinks: a link that stays inside the bundle is never reported here', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'wiki/index.md', '[a](a.md)\n');
    await writeRepoFile(d, 'wiki/a.md', '[home](/index.md)\n');
  });
  try {
    const findings = await checkOutOfBundleLinks(dir, 'wiki');
    assert.deepEqual(findings, []);
    // Control: an escaping link on the same page IS reported — the [] above
    // is discrimination, not an inert check.
    await writeRepoFile(dir, 'wiki/a.md', '[home](/index.md)\n[out](../elsewhere.md)\n');
    const control = await checkOutOfBundleLinks(dir, 'wiki');
    assert.equal(control.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// checkOrphanedPages — missing root index (§11: never a rejection)
// ---------------------------------------------------------------------------

test('checkOrphanedPages: a missing bundle-root index skips the check with one info finding', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'wiki/only-concept.md', '# Only concept\n');
  });
  try {
    const findings = await checkOrphanedPages(dir, 'wiki');
    assert.equal(findings.length, 1);
    assert.equal(findings[0].kind, 'orphan-check-skipped');
    assert.equal(findings[0].severity, 'info');
    // Control, same fixture: adding the root index changes the outcome to a
    // real orphan check (the unlisted page IS reported) — proves the skip
    // above isn't a permanently-empty stub.
    await writeRepoFile(dir, 'wiki/index.md', '# Index\n');
    const control = await checkOrphanedPages(dir, 'wiki');
    assert.equal(findKind(control, 'orphan-check-skipped').length, 0);
    assert.equal(findKind(control, 'orphaned-page').length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC27 — substring shadowing must be rejected: resolution, never containment
// ---------------------------------------------------------------------------

test('AC27: a substring-shadowed basename is still reported orphan; the longer registered page is not', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(
      d,
      'wiki/index.md',
      '# Index\n\n- [Cloudscript query cache](cloudscript-query-cache.md)\n',
    );
    await writeRepoFile(d, 'wiki/cloudscript-query-cache.md', '# Cloudscript query cache\n');
    // Never linked anywhere — but its basename is a SUBSTRING of the
    // registered basename above. A containment check would misread this as
    // "listed"; resolution correctly does not.
    await writeRepoFile(d, 'wiki/query-cache.md', '# Query cache\n');
  });
  try {
    const findings = await checkOrphanedPages(dir, 'wiki');
    const orphaned = findKind(findings, 'orphaned-page').map((f) => f.page);
    assert.ok(orphaned.includes('wiki/query-cache.md'), 'the shadowed page must be reported orphan');
    // Positive control, same fixture: the actually-registered page must NOT
    // be reported — proves the check discriminates rather than flagging
    // every page that shares a substring.
    assert.ok(
      !orphaned.includes('wiki/cloudscript-query-cache.md'),
      'the registered page must not be reported orphan',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC28 — every contested link form registers its page; an unlisted page
// still reports, so the zero is discrimination, not vacuity.
// ---------------------------------------------------------------------------

test('AC28: dot-relative, bare-relative, and bundle-absolute forms all register — an unlisted page still reports', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(
      d,
      'wiki/index.md',
      [
        '# Index',
        '',
        '- [Page A](./page-a.md)',
        '- [Page B](page-b.md#section)',
        '- [Page C](/page-c.md)',
      ].join('\n') + '\n',
    );
    await writeRepoFile(d, 'wiki/page-a.md', '# Page A\n');
    await writeRepoFile(d, 'wiki/page-b.md', '# Page B\n');
    await writeRepoFile(d, 'wiki/page-c.md', '# Page C\n');
    // Listed nowhere.
    await writeRepoFile(d, 'wiki/page-d.md', '# Page D\n');
  });
  try {
    const findings = await checkOrphanedPages(dir, 'wiki');
    const orphaned = findKind(findings, 'orphaned-page').map((f) => f.page);
    assert.deepEqual(orphaned, ['wiki/page-d.md']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Own-subdirectory index registers a page too, not just the bundle root
// ---------------------------------------------------------------------------

test('a page listed only in its own subdirectory index is not orphaned; one listed nowhere still is', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'wiki/index.md', '# Index\n');
    await writeRepoFile(d, 'wiki/sub/index.md', '- [Sub concept](sub-concept.md)\n');
    await writeRepoFile(d, 'wiki/sub/sub-concept.md', '# Sub concept\n');
    await writeRepoFile(d, 'wiki/sub/unlisted.md', '# Unlisted\n');
  });
  try {
    const findings = await checkOrphanedPages(dir, 'wiki');
    const orphaned = findKind(findings, 'orphaned-page').map((f) => f.page);
    assert.deepEqual(orphaned, ['wiki/sub/unlisted.md']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('checkOrphanedPages: zero orphans in a fully-listed bundle, non-vacuous', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'wiki/index.md', '- [A](a.md)\n');
    await writeRepoFile(d, 'wiki/a.md', '# A\n');
  });
  try {
    const findings = await checkOrphanedPages(dir, 'wiki');
    assert.deepEqual(findKind(findings, 'orphaned-page'), []);
    // Control, same fixture: an unlisted page IS reported — proves the []
    // above reflects a genuinely empty candidate set of unlisted pages, not
    // a check that never fires.
    await writeRepoFile(dir, 'wiki/b.md', '# B\n');
    const control = await checkOrphanedPages(dir, 'wiki');
    assert.equal(findKind(control, 'orphaned-page').length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Unreachable subtree
// ---------------------------------------------------------------------------

test('unreachable subtree: a subdirectory index unlinked from the root is reported, even with all its pages listed', async () => {
  const dir = await withTempRepo(async (d) => {
    // Root index does NOT link wiki/sub/index.md.
    await writeRepoFile(d, 'wiki/index.md', '# Index\n');
    await writeRepoFile(d, 'wiki/sub/index.md', '- [Sub concept](sub-concept.md)\n');
    await writeRepoFile(d, 'wiki/sub/sub-concept.md', '# Sub concept\n');
  });
  try {
    const findings = await checkOrphanedPages(dir, 'wiki');
    // The per-page rule alone would miss this: sub-concept.md IS listed in
    // its own directory's index.
    assert.deepEqual(findKind(findings, 'orphaned-page'), []);
    const unreachable = findKind(findings, 'unreachable-subtree');
    assert.equal(unreachable.length, 1);
    assert.equal(unreachable[0].page, 'wiki/sub/index.md');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('unreachable subtree control: linking the subdirectory index from the root clears the finding', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'wiki/index.md', '- [Sub](sub/index.md)\n');
    await writeRepoFile(d, 'wiki/sub/index.md', '- [Sub concept](sub-concept.md)\n');
    await writeRepoFile(d, 'wiki/sub/sub-concept.md', '# Sub concept\n');
  });
  try {
    const findings = await checkOrphanedPages(dir, 'wiki');
    assert.deepEqual(findKind(findings, 'unreachable-subtree'), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// lintWiki — aggregate
// ---------------------------------------------------------------------------

test('lintWiki: concatenates all three checks in order', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'wiki/index.md', '[a](a.md)\n');
    await writeRepoFile(
      d,
      'wiki/a.md',
      '[bad](/nope.md)\n[out](../elsewhere.md)\n',
    );
    // Unlisted anywhere.
    await writeRepoFile(d, 'wiki/orphan.md', '# Orphan\n');
  });
  try {
    const findings = await lintWiki(dir, 'wiki');
    assert.equal(findKind(findings, 'dead-link').length, 1);
    assert.equal(findKind(findings, 'out-of-bundle-link').length, 1);
    assert.equal(findKind(findings, 'orphaned-page').length, 1);
    // Control: dropping to an empty bundle drops every finding to zero —
    // proves lintWiki isn't padding its own count independent of input.
    const emptyDir = await withTempRepo(async (d) => {
      await writeRepoFile(d, 'wiki/index.md', '# Index\n');
    });
    try {
      const emptyFindings = await lintWiki(emptyDir, 'wiki');
      assert.deepEqual(emptyFindings, []);
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
