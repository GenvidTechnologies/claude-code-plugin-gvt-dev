// Component load-failure diagnostics.
//
// audit-core's `walkComponents` does not throw on a component it cannot load:
// it returns the entry with `expects: null` and either a `readError` (the file
// could not be read) or a `parseError` (the frontmatter was rejected by the
// YAML parser), each shaped `{ code, message }`. The expectation loop skips an
// entry with no `expects`, so without a diagnostic the broken component would
// vanish from the report and the audit would still pass. This module turns each
// such entry into an error finding, and maps the finding set to the exit code.

export const LOAD_FAILURE_KINDS = ['component-unreadable', 'component-malformed'];

// One error finding per component carrying a `readError` or `parseError`;
// nothing for any other component. The reader is a consumer, so `detail` says
// it is the plugin's own component that failed, which reads as a plugin defect.
export function loadFailureDiagnostics(components) {
  const diagnostics = [];
  for (const component of components) {
    if (component.readError) {
      diagnostics.push(diagnostic('component-unreadable', 'could not be read', component, component.readError));
    } else if (component.parseError) {
      diagnostics.push(diagnostic('component-malformed', 'has frontmatter that could not be parsed', component, component.parseError));
    }
  }
  return diagnostics;
}

function diagnostic(kind, problem, component, error) {
  return {
    kind,
    ok: false,
    severity: 'error',
    detail: `The plugin's own ${component.type} "${component.name}" ${problem} (${error.code}: ${error.message}). This is a plugin defect, not a problem in your repo.`,
  };
}

// 2 when any component failed to load, else 1 on any error finding, else 0.
export function auditExitCode(findings) {
  if (findings.some((f) => LOAD_FAILURE_KINDS.includes(f.kind))) return 2;
  return findings.some((f) => f.severity === 'error') ? 1 : 0;
}
