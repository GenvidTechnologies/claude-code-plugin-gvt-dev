// The audit-core re-export seam (ADR-0071) exposes exactly the named list and
// each name is the audit-core binding itself, not a copy.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as seam from '../lib/audit-core-reexport.mjs';
import * as core from '#audit-core';

test('seam re-exports exactly the named list, each identical to audit-core', () => {
  assert.deepEqual(Object.keys(seam), ['extractFrontmatter']);
  for (const k of Object.keys(seam)) {
    assert.ok(seam[k] === core[k], `${k} must be the audit-core binding, not a copy`);
  }
});
