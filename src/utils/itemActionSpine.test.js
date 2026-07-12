// Item-action automation contract (#1085 spine).
//
// A magic item's `actions[]` entry becomes a fully-resolved, damaging/save-
// forcing ability with NO new engine code: it already flows into the action
// stream (actionUtils.getActions → useCharacter().actions), and an encounter
// action opens UseAbilityModal (ActionsList), which reads the same roll/damage
// machinery spells use. This test pins the authoring contract those items rely
// on, so the T2c/T2d batches (Horn of Blasting, alchemical gadgets, etc.) can
// author against a guaranteed shape.
//
// The contract:
//   • A FIXED item DC is expressed with `roll: { type: 'spell-dc', bonus: <DC> }`
//     (the item's DC doesn't derive from the wielder's spell DC — most wielders
//     aren't casters). This mirrors runeSpellCast.buildRuneCastSpell.
//   • `defense: 'basic Reflex' | 'Fortitude' | …` selects the save; a leading
//     "basic " marks a basic save (halve on success / double on crit-fail).
//   • `damageData: { base, type, heightened?, riders? }` feeds the damage step.
import { describe, it, expect } from 'vitest';
import { resolveActionRoll, isBasicDefense, mapSpellDefense } from './rollResolution';
import { buildDamageProfile } from './damage';

const wielder = { id: 'w', level: 9 };

// A Horn-of-Blasting-style damaging item action: fixed DC, basic Reflex, sonic.
const blastOfSound = {
  name: 'Blast of Sound',
  actionCount: 2,
  traits: ['Manipulate', 'Sonic'],
  roll: { type: 'spell-dc', bonus: 27 },
  defense: 'basic Reflex',
  damageData: { base: '3d6', type: 'sonic' },
};

describe('item-action automation contract (#1085)', () => {
  it('resolves a fixed-DC item action to a target-save at the authored DC', () => {
    const rp = resolveActionRoll(blastOfSound, wielder);
    expect(rp.mode).toBe('target-save');
    expect(rp.dc).toBe(27);           // fixed, not derived from a spell DC
    expect(rp.defense).toBe('reflex');
    expect(rp.bonus).toBeNull();      // save side: no actor d20
  });

  it('detects the basic-save marker for the halve/double multiplier', () => {
    expect(isBasicDefense(blastOfSound.defense)).toBe(true);
    expect(mapSpellDefense(blastOfSound.defense)).toBe('reflex');
    expect(isBasicDefense('Fortitude')).toBe(false);
  });

  it('builds the damage profile from the action damageData', () => {
    const dp = buildDamageProfile(blastOfSound, wielder);
    expect(dp.expression).toBe('3d6');
    expect(dp.typeLabel).toBe('sonic');
  });

  it('supports a save-only item action (condition, no damage) at a fixed DC', () => {
    const gaze = {
      name: 'Baleful Gaze',
      actionCount: 1,
      traits: ['Concentrate'],
      roll: { type: 'spell-dc', bonus: 24 },
      defense: 'Will',
    };
    const rp = resolveActionRoll(gaze, wielder);
    expect(rp).toMatchObject({ mode: 'target-save', dc: 24, defense: 'will' });
    expect(isBasicDefense(gaze.defense)).toBe(false);
    // No damageData → no damage profile; the save request carries conditions only.
    expect(buildDamageProfile(gaze, wielder)).toBeNull();
  });
});
