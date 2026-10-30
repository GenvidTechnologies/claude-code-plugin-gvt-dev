// Reference-state resolution for triage-issues' issue-refs script (#209):
// turns extracted references into states, readiness and the lookup plan.
// Pure: no writes, no process.exit, no console output, no process spawning.
//
// SKELETON. Every export throws until the logic lands in a later task;
// the tests are written first and fail on assertions, not on a load error.

/**
 * Resolve extracted references against fetched issue state.
 * @param {unknown} _input
 * @param {unknown} [_options]
 */
export function resolve(_input, _options) {
  throw new Error('not implemented');
}

/**
 * Plan the lookups needed before references can be resolved.
 * @param {unknown} _input
 * @param {unknown} [_options]
 */
export function plan(_input, _options) {
  throw new Error('not implemented');
}
