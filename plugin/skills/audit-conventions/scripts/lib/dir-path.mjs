// Tiny directory-path helpers shared by lib/hygiene.mjs and lib/summary.mjs,
// so each exists once. Pure string functions; no I/O.

export const BACKSLASH = String.fromCharCode(92);

// A directory named bare: trailing '/' and backslash separators stripped.
export function bareDir(dir) {
  let d = String(dir);
  while (d.endsWith('/') || d.endsWith(BACKSLASH)) d = d.slice(0, -1);
  return d;
}

// Raw containment: `inner` equals `outer` or sits under `${outer}/`. No
// separator normalisation, and never a substring test.
export function insideDir(inner, outer) {
  return inner === outer || inner.startsWith(`${outer}/`);
}
