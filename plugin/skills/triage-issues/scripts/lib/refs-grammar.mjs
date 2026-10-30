// Reference grammar for triage-issues' issue-refs script (#209): the single
// definition of how an issue's title, body, heading sections and comments
// name other issues. Pure: no writes, no process.exit, no console output.
//
// SKELETON. Every export throws until the grammar lands in a later task;
// the tests are written first and fail on assertions, not on a load error.

/**
 * Extract the references from one issue's raw record.
 * @param {unknown} _issue
 * @param {unknown} [_options]
 */
export function extract(_issue, _options) {
  throw new Error('not implemented');
}
