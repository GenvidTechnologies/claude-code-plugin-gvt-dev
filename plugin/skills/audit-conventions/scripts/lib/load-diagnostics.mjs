// Component load-failure diagnostics.
//
// audit-core's `walkComponents` does not throw on a component it cannot load:
// it returns the entry with `expects: null` and either a `readError` (the file
// could not be read) or a `parseError` (the frontmatter was rejected by the
// YAML parser), each shaped `{ code, message }`. The expectation loop skips an
// entry with no `expects`, so without a diagnostic the broken component would
// vanish from the report and the audit would still pass. This module turns each
// such entry into an error finding, and maps the finding set to the exit code.
//
// Two cases get their own wording. A tree record (see isTreeRecord) stands for
// an unreadable skills/ or agents/ directory as a whole, so it says no
// component of that type was loaded rather than naming one component. And a
// parseError whose code is NO_FRONTMATTER reads "is missing its frontmatter"
// instead of the generic "has frontmatter that could not be parsed".

export const LOAD_FAILURE_KINDS = ['component-unreadable', 'component-malformed'];

// One error finding per component carrying a `readError` or `parseError`;
// nothing for any other component. The reader is a consumer, so `detail` says
// it is the plugin's own component that failed, which reads as a plugin defect.
export function loadFailureDiagnostics(components) {
  const diagnostics = [];
  for (const component of components) {
    if (isTreeRecord(component)) {
      diagnostics.push({
        kind: 'component-unreadable',
        ok: false,
        severity: 'error',
        detail: `The plugin's own ${component.name} tree could not be read, so no ${component.type} was loaded from it (${errorText(component.readError)}). This is a plugin defect, not a problem in your repo.`,
      });
    } else if (component.readError) {
      diagnostics.push(diagnostic('component-unreadable', 'could not be read', component, component.readError));
    } else if (component.parseError) {
      const problem = component.parseError.code === 'NO_FRONTMATTER'
        ? 'is missing its frontmatter'
        : 'has frontmatter that could not be parsed';
      diagnostics.push(diagnostic('component-malformed', problem, component, component.parseError));
    }
  }
  return diagnostics;
}

// audit-core names a record for an unreadable skills/ or agents/ tree itself
// 'skills/' or 'agents/' (type skill or agent).
export const isTreeRecord = (c) => Boolean(c.readError) && c.name === `${c.type}s/`;

// "CODE: message", without doubling a code the message already starts with and
// without a "null:" prefix when there is no code.
export function errorText({ code, message }) {
  if (!code) return message;
  if (message.startsWith(`${code}:`)) return message;
  return `${code}: ${message}`;
}

function diagnostic(kind, problem, component, error) {
  return {
    kind,
    ok: false,
    severity: 'error',
    detail: `The plugin's own ${component.type} "${component.name}" ${problem} (${errorText(error)}). This is a plugin defect, not a problem in your repo.`,
  };
}

// 2 when any component failed to load, else 1 on any error finding, else 0.
export function auditExitCode(findings) {
  if (findings.some((f) => LOAD_FAILURE_KINDS.includes(f.kind))) return 2;
  return findings.some((f) => f.severity === 'error') ? 1 : 0;
}
