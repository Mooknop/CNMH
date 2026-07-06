// Snapshot integrity gate for the Everything Shields import (#1196 G1, #1197):
// the 9 new shields are seeded with a well-formed shield block, derive the right
// size category from their Bulk, and carry the right traits — and the 5 shield
// traits resolve in the glossary. Runs the REAL shieldCategory util so authoring
// drift (a wrong Bulk, a missing stat) is caught here.
import { items, traits } from './index';
import { shieldCategory } from '../utils/shieldCategory';
import { normalizeShield } from '../utils/InventoryUtils';

const byId = (id) => items.find((i) => i.id === id);

// [id, category, { hardness, hp, bt, bonus }, traits, extras]
const SHIELDS = [
  ['targe',           'light',  { hardness: 1, hp: 4,  bt: 2,  bonus: 1 }, ['Finesse']],
  ['shield-gauntlet', 'light',  { hardness: 2, hp: 5,  bt: 2,  bonus: 1 }, ['Finesse']],
  ['fist-shield',     'light',  { hardness: 4, hp: 10, bt: 5,  bonus: 1 }, []],
  ['viking-shield',   'medium', { hardness: 5, hp: 15, bt: 7,  bonus: 2 }, ['Accessible']],
  ['heater-shield',   'medium', { hardness: 5, hp: 18, bt: 9,  bonus: 2 }, ['Riding Shield']],
  ['kite-shield',     'medium', { hardness: 4, hp: 22, bt: 11, bonus: 2 }, ['Deflecting']],
  ['hoplon',          'heavy',  { hardness: 5, hp: 24, bt: 12, bonus: 2 }, [],                          { speedPenalty: 5 }],
  ['scutum',          'heavy',  { hardness: 6, hp: 26, bt: 13, bonus: 2 }, ['Cumbersome', 'Deflecting'], { takeCoverBonus: 4, speedPenalty: 5 }],
  ['pavise',          'heavy',  { hardness: 7, hp: 28, bt: 14, bonus: 2 }, ['Cumbersome'],               { takeCoverBonus: 4, speedPenalty: 10 }],
];

describe('seeded Everything Shields (G1)', () => {
  it.each(SHIELDS)('%s: shield block + category + traits', (id, category, stats, wantTraits, extras) => {
    const item = byId(id);
    expect(item, `missing ${id}`).toBeTruthy();

    // Shield block carries all durability stats (normalized to canonical keys).
    const s = normalizeShield(item.shield);
    expect(s).toBeTruthy();
    expect(s.hardness).toBe(stats.hardness);
    expect(s.hp).toBe(stats.hp);
    expect(s.brokenThreshold).toBe(stats.bt);
    expect(s.bonus).toBe(stats.bonus);

    // Size category derives from Bulk (weight) via the shared helper.
    expect(shieldCategory(item.weight)).toBe(category);

    // Traits (only the special ones are authored).
    expect(item.traits || []).toEqual(wantTraits);

    // Optional riders: takeCoverBonus (scutum/pavise) + speedPenalty (heavies).
    if (extras && extras.takeCoverBonus !== undefined) {
      expect(s.takeCoverBonus).toBe(extras.takeCoverBonus);
    } else {
      expect(s.takeCoverBonus).toBeUndefined();
    }
    if (extras && extras.speedPenalty !== undefined) {
      expect(s.speedPenalty).toBe(extras.speedPenalty);
    }
  });

  it('all 9 shields have a price, Bulk, and a description', () => {
    for (const [id] of SHIELDS) {
      const item = byId(id);
      expect(typeof item.price, `${id} price`).toBe('number');
      expect(typeof item.weight, `${id} weight`).toBe('number');
      expect(item.description, `${id} description`).toBeTruthy();
      expect(item.description.length, `${id} description length`).toBeGreaterThan(40);
    }
  });
});

describe('shield traits in the glossary', () => {
  it.each(['Accessible', 'Cumbersome', 'Deflecting', 'Riding Shield'])(
    '%s trait is seeded with a description',
    (name) => {
      const t = traits.find((tr) => tr.name === name);
      expect(t, `missing ${name} trait`).toBeTruthy();
      expect(typeof t.description).toBe('string');
      expect(t.description.length).toBeGreaterThan(0);
    }
  );

  it('the existing Finesse trait now covers the shield use', () => {
    const finesse = traits.find((t) => t.name === 'Finesse');
    expect(finesse).toBeTruthy();
    expect(finesse.description).toMatch(/shield/i);
  });
});
