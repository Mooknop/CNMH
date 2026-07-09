// Structural shape comparison for relay-payload contract tests (#1308).
// Dependency-free ESM: consumed by the bridge jest suite AND the app vitest
// suite (via src/test/relayFixtures.js), like syncKeys.js.
//
// The contract is FIELD NAMES + TYPES, not values: a bridge emission matches
// its fixture when every key path exists on both sides with the same primitive
// kind. Array elements are checked against the fixture's first element (record
// fixtures with at least one representative element); an empty emitted array
// can't be shape-checked and is accepted.

const kind = (v) => {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
};

// Returns a list of human-readable problems ([] = shapes match).
export function diffShapes(actual, fixture, path = '$') {
  const problems = [];
  const ak = kind(actual);
  const fk = kind(fixture);

  // null/undefined on either side is treated as "optional slot" — the field
  // exists; its value kind can't be compared further.
  if (ak === 'null' || fk === 'null') return problems;

  if (ak !== fk) {
    problems.push(`${path}: expected ${fk}, got ${ak}`);
    return problems;
  }

  if (fk === 'array') {
    if (fixture.length && actual.length) {
      problems.push(...diffShapes(actual[0], fixture[0], `${path}[0]`));
    }
    return problems;
  }

  if (fk === 'object') {
    for (const key of Object.keys(fixture)) {
      if (!(key in actual)) problems.push(`${path}.${key}: missing from emission`);
    }
    for (const key of Object.keys(actual)) {
      if (!(key in fixture)) problems.push(`${path}.${key}: not in fixture (new field? re-record fixtures)`);
    }
    for (const key of Object.keys(fixture)) {
      if (key in actual) problems.push(...diffShapes(actual[key], fixture[key], `${path}.${key}`));
    }
  }

  return problems;
}
