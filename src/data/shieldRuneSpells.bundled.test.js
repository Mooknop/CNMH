// Integrity gate for the shield-rune spell casts (#1196 G3, #1199): the 5 spells
// the Class B runes cast are seeded, and every rune actuated block that casts a
// fixed spell points at a real catalog spell. Runs the REAL actuatedCastsSpell
// util so a dangling spellRef is caught here.
import { spells, runes } from './index';
import { actuatedCastsSpell } from '../utils/runeSpellCast';

const spellById = (id) => spells.find((s) => s.id === id);
const runeById = (id) => runes.find((r) => r.id === id);

const SEEDED = ['air-bubble', 'gust-of-wind', 'darkness', 'boneshaker', 'shillelagh'];

describe('shield-rune cast spells', () => {
  it.each(SEEDED)('%s is seeded with a well-formed spell doc', (id) => {
    const s = spellById(id);
    expect(s, `missing spell ${id}`).toBeTruthy();
    expect(typeof s.level).toBe('number');
    expect(Array.isArray(s.traits)).toBe(true);
    expect(Array.isArray(s.traditions) && s.traditions.length).toBeTruthy();
    expect(typeof s.description).toBe('string');
    expect(s.description.length).toBeGreaterThan(20);
    expect(typeof s.actions).toBe('string');
  });

  it('gust of wind / boneshaker carry their save + degrees; darkness carries heightening', () => {
    expect(spellById('gust-of-wind').defense).toBe('Fortitude');
    expect(spellById('gust-of-wind').degrees['Critical Failure']).toMatch(/2d6 bludgeoning/);
    expect(spellById('boneshaker').degrees.Failure).toMatch(/enfeebled 1/);
    expect(spellById('darkness').heightened['4th']).toMatch(/darkvision/);
  });
});

// Every rune that casts a FIXED spell resolves its spellRef to a seeded spell.
const CAST_RUNES = {
  gusting: 'gust-of-wind',
  darkness: 'darkness',
  environmental: 'air-bubble',
  'greater-environmental': 'air-bubble',
  living: 'shillelagh',
  'greater-living': 'shillelagh',
  'true-living': 'shillelagh',
  undead: 'boneshaker',
  'greater-undead': 'boneshaker',
  'true-undead': 'boneshaker',
};

describe('rune spellRef wiring', () => {
  it.each(Object.entries(CAST_RUNES))('%s casts %s via a resolvable actuated spellRef', (runeId, spellId) => {
    const r = runeById(runeId);
    expect(r, `missing rune ${runeId}`).toBeTruthy();
    expect(r.actuated, `${runeId} has no actuated block`).toBeTruthy();
    expect(actuatedCastsSpell(r.actuated)).toBe(true);
    expect(r.actuated.spellRef).toBe(spellId);
    expect(typeof r.actuated.castRank).toBe('number');
    // Referential integrity: the referenced spell exists in the catalog.
    expect(spellById(r.actuated.spellRef), `dangling spellRef ${r.actuated.spellRef}`).toBeTruthy();
  });

  it('Summoning stays descriptive (casts a crafter-chosen spell, no fixed spellRef)', () => {
    expect(runeById('summoning').actuated.spellRef).toBeUndefined();
  });
});
