import { heldShieldRuneEffects, heldShieldRollBonus, ENERGY_RESISTANT_AMOUNT } from './shieldRuneEffects';
import { resistanceFor, computeEffectBonuses, conditionalModifiersFor } from './EffectUtils';

// A held shield entry carrying resolved property-rune docs (as contentUtils
// produces them — { ...doc, choice } for a choice-bearing rune).
const heldShield = (property) => ({
  uid: 'sh1', name: 'Kite Shield', shield: { hardness: 4 }, state: 'held1',
  runes: { reinforcing: 'moderate', property },
});
const energyRes = (id, choice) => ({ id, type: 'property', target: 'shield', name: 'Energy-Resistant', choice });

describe('heldShieldRuneEffects', () => {
  it('emits a resistance effect for a held Energy-Resistant shield vs its chosen type', () => {
    const fx = heldShieldRuneEffects([heldShield([energyRes('energy-resistant', 'fire')])]);
    expect(fx).toHaveLength(1);
    expect(fx[0].entry.modifiers).toEqual([{ stat: 'resistance', vs: 'fire', amount: 3 }]);
    expect(fx[0].def.name).toBe('Energy-Resistant (fire)');
    // entry + def share the synthetic id so the reader resolves it.
    expect(fx[0].entry.effectId).toBe(fx[0].def.id);
  });

  it('uses the per-grade amount (base 3 / greater 6 / major 10)', () => {
    const amt = (id) => heldShieldRuneEffects([heldShield([energyRes(id, 'cold')])])[0].entry.modifiers[0].amount;
    expect(amt('energy-resistant')).toBe(ENERGY_RESISTANT_AMOUNT['energy-resistant']);
    expect(amt('greater-energy-resistant')).toBe(6);
    expect(amt('major-energy-resistant')).toBe(10);
  });

  it('emits one effect per distinct energy-resistant rune (stacked types)', () => {
    const fx = heldShieldRuneEffects([heldShield([
      energyRes('energy-resistant', 'fire'),
      energyRes('energy-resistant', 'cold'),
    ])]);
    expect(fx.map((f) => f.entry.modifiers[0].vs)).toEqual(['fire', 'cold']);
    expect(fx[0].entry.id).not.toBe(fx[1].entry.id); // distinct ids by slot index
  });

  it('contributes nothing when the shield is not held', () => {
    const stowed = { ...heldShield([energyRes('energy-resistant', 'fire')]), state: 'stowed' };
    expect(heldShieldRuneEffects([stowed])).toEqual([]);
  });

  it('contributes nothing for an energy-resistant rune with no chosen type', () => {
    expect(heldShieldRuneEffects([heldShield([energyRes('energy-resistant', undefined)])])).toEqual([]);
  });

  it('ignores non-energy property runes and non-shields', () => {
    expect(heldShieldRuneEffects([heldShield([{ id: 'moonlit', name: 'Moonlit' }])])).toEqual([]);
    expect(heldShieldRuneEffects([{ uid: 'w', name: 'Sword', strikes: [{}], state: 'held', runes: {} }])).toEqual([]);
    expect(heldShieldRuneEffects([])).toEqual([]);
  });
});

const darknessRune = { id: 'darkness', type: 'property', target: 'shield', name: 'Darkness' };

describe('heldShieldRuneEffects — skill-wire runes (Darkness)', () => {
  it('emits a +1 item Stealth def for a held Darkness shield', () => {
    const fx = heldShieldRuneEffects([heldShield([darknessRune])]);
    expect(fx).toHaveLength(1);
    // Skill bonus rides on the DEF (computeEffectBonuses reads def.modifiers).
    expect(fx[0].def.modifiers).toEqual([{ stat: 'stealth', kind: 'item', amount: 1 }]);
    expect(fx[0].entry.modifiers).toBeUndefined();
    expect(fx[0].entry.effectId).toBe(fx[0].def.id);
  });

  it('contributes nothing when the Darkness shield is not held', () => {
    const stowed = { ...heldShield([darknessRune]), state: 'stowed' };
    expect(heldShieldRuneEffects([stowed])).toEqual([]);
  });

  it('the emitted def nets +1 item Stealth through computeEffectBonuses', () => {
    const fx = heldShieldRuneEffects([heldShield([darknessRune])]);
    const bonuses = computeEffectBonuses(fx.map((f) => f.entry), fx.map((f) => f.def));
    expect(bonuses.stealth.total).toBe(1);
    expect(bonuses.acrobatics.total).toBe(0); // only Stealth
  });

  it('coexists with Energy-Resistant on the same shield (distinct effects)', () => {
    const fx = heldShieldRuneEffects([heldShield([
      energyRes('energy-resistant', 'fire'),
      darknessRune,
    ])]);
    expect(fx).toHaveLength(2);
    expect(fx[0].entry.id).not.toBe(fx[1].entry.id);
    // Resistance rides on the entry; Stealth on the def — no cross-talk.
    const bonuses = computeEffectBonuses(fx.map((f) => f.entry), fx.map((f) => f.def));
    expect(bonuses.stealth.total).toBe(1);
    expect(resistanceFor(fx.map((f) => f.entry), 'fire', fx.map((f) => f.def))).toBe(3);
  });
});

const heavyRune = { id: 'heavy', type: 'property', target: 'shield', name: 'Heavy' };

describe('heldShieldRuneEffects — save-hint runes (Heavy)', () => {
  it('emits a conditional Fortitude def (+2 vs Grapple or Shove) for a held Heavy shield', () => {
    const fx = heldShieldRuneEffects([heldShield([heavyRune])]);
    expect(fx).toHaveLength(1);
    // Conditional bonus rides on the DEF with a `vs` tag; entry carries no modifiers.
    expect(fx[0].def.modifiers).toEqual([{ stat: 'fort', kind: 'item', amount: 2, vs: 'Grapple or Shove' }]);
    expect(fx[0].entry.modifiers).toBeUndefined();
    expect(fx[0].entry.effectId).toBe(fx[0].def.id);
  });

  it('contributes nothing when the Heavy shield is not held', () => {
    const stowed = { ...heldShield([heavyRune]), state: 'stowed' };
    expect(heldShieldRuneEffects([stowed])).toEqual([]);
  });

  it('surfaces as a conditional Fortitude hint (not netted into the base save)', () => {
    const fx = heldShieldRuneEffects([heldShield([heavyRune])]);
    const effects = fx.map((f) => f.entry);
    const catalog = fx.map((f) => f.def);
    // The `vs` modifier is conditional — the always-on fort total stays 0.
    expect(computeEffectBonuses(effects, catalog).fort.total).toBe(0);
    const hints = conditionalModifiersFor(effects, 'fort', catalog);
    expect(hints).toEqual([{ amount: 2, kind: 'item', label: 'Heavy', vs: 'Grapple or Shove' }]);
  });
});

describe('heldShieldRollBonus — opt-in roll toggles (Knowing / Glamourous)', () => {
  const knowing = { id: 'knowing', type: 'property', target: 'shield', name: 'Knowing' };
  const glamourous = { id: 'glamourous', type: 'property', target: 'shield', name: 'Glamourous' };

  it('Knowing grants +1 while wielding (no raised gate)', () => {
    const bonus = heldShieldRollBonus([heldShield([knowing])], 'knowing');
    expect(bonus).toEqual({ amount: 1, label: 'Knowing (shield)' });
  });

  it('Knowing yields null when the shield is not held', () => {
    const stowed = { ...heldShield([knowing]), state: 'stowed' };
    expect(heldShieldRollBonus([stowed], 'knowing')).toBeNull();
  });

  it('Glamourous requires the shield to be raised', () => {
    const inv = [heldShield([glamourous])];
    expect(heldShieldRollBonus(inv, 'glamourous')).toBeNull();               // not raised
    expect(heldShieldRollBonus(inv, 'glamourous', { raised: false })).toBeNull();
    expect(heldShieldRollBonus(inv, 'glamourous', { raised: true }))
      .toEqual({ amount: 1, label: 'Glamourous (shield)' });
  });

  it('yields null when the held shield lacks the rune, or for an unknown rune', () => {
    expect(heldShieldRollBonus([heldShield([knowing])], 'glamourous', { raised: true })).toBeNull();
    expect(heldShieldRollBonus([heldShield([knowing])], 'darkness')).toBeNull(); // not a roll-toggle rune
    expect(heldShieldRollBonus([heldShield([])], 'knowing')).toBeNull();
    expect(heldShieldRollBonus([], 'knowing')).toBeNull();
  });
});

// The issue's named wiring test: the wielder's resistance actually appears when
// the resistance reader (resistanceFor) is fed the resolved-effects universe.
describe('Energy-Resistant → wielder resistance (IWR)', () => {
  it('resistanceFor sees the held shield resistance vs the chosen type only', () => {
    const fx = heldShieldRuneEffects([heldShield([energyRes('greater-energy-resistant', 'fire')])]);
    const effects = fx.map((f) => f.entry);   // as useResolvedEffects merges them
    const catalog = fx.map((f) => f.def);
    expect(resistanceFor(effects, 'fire', catalog)).toBe(6);
    expect(resistanceFor(effects, 'cold', catalog)).toBe(0); // wrong type — no resistance
  });
});
