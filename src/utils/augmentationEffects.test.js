import { describe, it, expect } from 'vitest';
import { augmentationEffects, SKILL_WIRE_AUGMENTS, SAVE_HINT_AUGMENTS, AC_HINT_AUGMENTS, SKILL_HINT_AUGMENTS } from './augmentationEffects';

// Effective-inventory entries carry the resolved augmentation doc on `augmentation`.
const weapon = (aug, state = 'held1') => ({ uid: 'w1', name: 'Longsword', strikes: [{}], state, augmentation: aug });
const armor = (aug, state = 'worn') => ({ uid: 'a1', name: 'Breastplate', armor: { acBonus: 4 }, state, augmentation: aug });
const shield = (aug, state = 'held1') => ({ uid: 's1', name: 'Buckler', shield: { bonus: 1 }, state, augmentation: aug });

const eyecatcher = { id: 'eyecatcher', name: 'Eyecatcher' };
const weaponHarness = { id: 'weapon-harness', name: 'Weapon Harness' };
const shieldHarness = { id: 'shield-harness', name: 'Shield Harness' };
const coat = { id: 'coat-of-arms', name: 'Coat of Arms' };
const unwired = { id: 'shield-sheath', name: 'Shield Sheath' }; // structural note — no effect wiring

describe('augmentationEffects', () => {
  it('nets an always-on skill item bonus while the augmented weapon is held', () => {
    const out = augmentationEffects([weapon(eyecatcher)]);
    expect(out).toHaveLength(1);
    expect(out[0].def.modifiers).toEqual([{ stat: 'deception', kind: 'item', amount: 1 }]);
    expect(out[0].def.name).toBe('Eyecatcher');
    expect(out[0].entry.effectId).toBe(out[0].def.id);
  });

  it('emits a conditional save hint for a worn armor augmentation', () => {
    const out = augmentationEffects([armor(weaponHarness)]);
    expect(out[0].def.modifiers).toEqual([{ stat: 'reflex', kind: 'circumstance', amount: 1, vs: 'Disarm' }]);
  });

  it('emits a conditional AC hint for Shield Harness while the shield is WORN (not held)', () => {
    // Shield Harness benefits you while the shield is stowed on your back.
    const worn = augmentationEffects([shield(shieldHarness, 'worn')]);
    expect(worn[0].def.modifiers).toEqual([{ stat: 'ac', kind: 'circumstance', amount: 1, vs: 'attacks while flanked (worn on your back)' }]);
    // Wielded (held) → the harness bonus does not apply.
    expect(augmentationEffects([shield(shieldHarness, 'held1')])).toEqual([]);
  });

  it('applies only while the host is equipped (held weapon / worn armor)', () => {
    // A sheathed / stowed weapon (not held) contributes nothing.
    expect(augmentationEffects([weapon(eyecatcher, 'dropped')])).toEqual([]);
    expect(augmentationEffects([weapon(eyecatcher, 'worn')])).toEqual([]);
    // Worn armor with a weapon-only wiring key still only fires for its own id.
    expect(augmentationEffects([armor(weaponHarness, 'dropped')])).toEqual([]);
  });

  it('emits a conditional skill hint for a held shield augmentation (Coat of Arms)', () => {
    const out = augmentationEffects([shield({ id: 'coat-of-arms', name: 'Coat of Arms' })]);
    expect(out[0].def.modifiers).toEqual([
      { stat: 'diplomacy', kind: 'circumstance', amount: 1, vs: 'a faction feared or respected (GM discretion)' },
    ]);
  });

  it('fills the vs from the chosen creature type (Ancestral Predator)', () => {
    const out = augmentationEffects([shield({ id: 'ancestral-predator', name: 'Ancestral Predator', choice: 'dragon' })]);
    expect(out[0].def.modifiers).toEqual([
      { stat: 'intimidation', kind: 'circumstance', amount: 1, vs: 'dragon creatures' },
    ]);
    // No choice yet → a generic reminder.
    const generic = augmentationEffects([shield({ id: 'ancestral-predator', name: 'Ancestral Predator' })]);
    expect(generic[0].def.modifiers[0].vs).toBe('the chosen creature type');
  });

  it('emits a conditional Stealth hint for a worn armor augmentation (Subtle Armor)', () => {
    const out = augmentationEffects([armor({ id: 'subtle-armor', name: 'Subtle Armor' })]);
    expect(out[0].def.modifiers).toEqual([
      { stat: 'stealth', kind: 'item', amount: 1, vs: 'hiding the nature of your armor' },
    ]);
    // Only while worn.
    expect(augmentationEffects([armor({ id: 'subtle-armor', name: 'Subtle Armor' }, 'dropped')])).toEqual([]);
  });

  it('emits a negative conditional Stealth hint (Burnished Plating, except in darkness)', () => {
    const out = augmentationEffects([armor({ id: 'burnished-plating', name: 'Burnished Plating' })]);
    expect(out[0].def.modifiers).toEqual([
      { stat: 'stealth', kind: 'circumstance', amount: -4, vs: 'checks made outside darkness' },
    ]);
  });

  it('emits two conditional skill mods for a two-skill armor augmentation (Parade Armor)', () => {
    const out = augmentationEffects([armor({ id: 'parade-armor', name: 'Parade Armor' })]);
    expect(out[0].def.modifiers).toEqual([
      { stat: 'diplomacy', kind: 'item', amount: 1, vs: 'creatures of the same affiliation' },
      { stat: 'intimidation', kind: 'item', amount: 1, vs: 'creatures of the same affiliation' },
    ]);
  });

  it('ignores an unwired augmentation and a host with none', () => {
    expect(augmentationEffects([weapon(unwired)])).toEqual([]); // no effect wiring
    expect(augmentationEffects([weapon(null)])).toEqual([]); // no augmentation bound
    expect(augmentationEffects([{ uid: 'x', name: 'Rope', weight: 1 }])).toEqual([]);
  });

  it('gathers across multiple equipped hosts', () => {
    const out = augmentationEffects([weapon(eyecatcher), armor(weaponHarness), shield(coat)]);
    expect(out.map((o) => o.def.name).sort()).toEqual(['Coat of Arms', 'Eyecatcher', 'Weapon Harness']);
  });

  it('every wired id resolves to a supported modifier shape', () => {
    for (const [, def] of Object.entries(SKILL_WIRE_AUGMENTS)) {
      expect(typeof def.stat).toBe('string');
      expect(typeof def.amount).toBe('number');
    }
    for (const [, def] of Object.entries(SAVE_HINT_AUGMENTS)) {
      expect(['fort', 'reflex', 'will']).toContain(def.stat);
      expect(typeof def.vs).toBe('string');
    }
    for (const [, def] of Object.entries(AC_HINT_AUGMENTS)) {
      expect(def.stat).toBe('ac');
      expect(typeof def.vs).toBe('string');
    }
    for (const [, mods] of Object.entries(SKILL_HINT_AUGMENTS)) {
      expect(Array.isArray(mods)).toBe(true);
      for (const m of mods) {
        expect(typeof m.stat).toBe('string');
        expect(typeof m.amount).toBe('number');
        expect(typeof m.vs === 'string' || m.choiceVs === true).toBe(true);
      }
    }
  });
});
