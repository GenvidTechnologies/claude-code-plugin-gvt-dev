// Resolves dotted config keys against a JSON object.
// resolveKey({ a: { b: { c: 42 } } }, 'a.b.c') -> { found: true, value: 42 }
// resolveKey({ a: { b: {} } },        'a.b.c') -> { found: false, missingAt: 'a.b.c' }
// resolveKey({},                       'a.b')   -> { found: false, missingAt: 'a' }
//
// The missingAt field tells the caller WHERE the path broke, so error
// reports can say "expected commands.validate, but commands isn't defined".

export function resolveKey(obj, dottedKey) {
  const segments = dottedKey.split('.');
  let cursor = obj;
  const traversed = [];

  for (const segment of segments) {
    traversed.push(segment);
    if (cursor === null || cursor === undefined || typeof cursor !== 'object') {
      return { found: false, missingAt: traversed.slice(0, -1).join('.') || segment };
    }
    if (!(segment in cursor)) {
      return { found: false, missingAt: traversed.join('.') };
    }
    cursor = cursor[segment];
  }

  return { found: true, value: cursor };
}
