import { validateCollection, validateSnapshot } from './contentSchema.js';

describe('contentSchema', () => {
  test('a valid doc passes', () => {
    expect(validateCollection('effect', [
      { id: 'x', name: 'X', description: 'd', modifiers: [] },
    ])).toEqual([]);
  });

  test('missing required fields are named with collection, index, and id', () => {
    const problems = validateCollection('effect', [{ id: 'broken', name: 'B' }]);
    expect(problems).toEqual([
      'effect[0] (id "broken"): missing required field "description"',
      'effect[0] (id "broken"): missing required field "modifiers"',
    ]);
  });

  test('wrong types are named with expected vs got', () => {
    const problems = validateCollection('spell', [
      { id: 's', name: 'S', level: '3', traits: [], actions: 'Two Actions', description: 'd' },
    ]);
    expect(problems).toEqual(['spell[0] (id "s"): "level" — expected number, got string']);
  });

  test('optional fields are only type-checked when present', () => {
    expect(validateCollection('item', [{ id: 'i', name: 'I' }])).toEqual([]);
    expect(validateCollection('item', [{ id: 'i', name: 'I', price: 'cheap' }])).toEqual([
      'item[0] (id "i"): "price" — expected number, got string',
    ]);
  });

  test('scroll/wand bases may omit name; other items may not', () => {
    expect(validateCollection('item', [{ id: 'scroll-of-x', scroll: { spellRef: 'x' } }])).toEqual([]);
    expect(validateCollection('item', [{ id: 'wand-of-x', wand: { spellRef: 'x' } }])).toEqual([]);
    expect(validateCollection('item', [{ id: 'anon' }])).toEqual([
      'item[0] (id "anon"): missing "name" (only scroll/wand bases may omit it)',
    ]);
  });

  test('lore visibility is pinned to its enum (a typo silently hides the entry)', () => {
    const base = { id: 'l', title: 't', category: 'c', summary: 's', content: 'c' };
    expect(validateCollection('lore', [{ ...base, visibility: 'revealed' }])).toEqual([]);
    expect(validateCollection('lore', [{ ...base, visibility: 'reveald' }])).toEqual([
      'lore[0] (id "l"): "visibility" — "reveald" not in [gm, revealed]',
    ]);
  });

  test('non-object docs and non-array collections are reported', () => {
    expect(validateCollection('trait', 'nope')).toEqual(['trait: expected an array, got string']);
    expect(validateCollection('trait', [null])).toEqual(['trait[0]: not an object']);
  });

  test('validateSnapshot sweeps every known collection and ignores unknown ones', () => {
    const problems = validateSnapshot({
      effect: [{ id: 'e' }],
      room: [{ anything: true }], // live-only collection — not schema'd
    });
    expect(problems.length).toBe(3); // name, description, modifiers
    expect(problems.every((p) => p.startsWith('effect[0]'))).toBe(true);
  });
});
