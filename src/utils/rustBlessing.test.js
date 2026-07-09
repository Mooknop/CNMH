import {
  RUST_BLESSING_FEAT_NAME,
  BROKEN_WEAPON_ATTACK_PENALTY,
  hasRustBlessing,
  brokenArmorAcPenalty,
  brokenArmorEffect,
  BROKEN_ARMOR_EFFECT_ID,
} from './rustBlessing';

const blessed = { id: 'Pellias', feats: [{ name: 'Rust Blessing' }, { name: 'Shield Block' }] };
const mundane = { id: 'Ashka', feats: [{ name: 'Hefty Hauler' }] };

describe('hasRustBlessing', () => {
  it('detects the feat by name', () => {
    expect(hasRustBlessing(blessed)).toBe(true);
    expect(hasRustBlessing(mundane)).toBe(false);
    expect(hasRustBlessing(null)).toBe(false);
    expect(hasRustBlessing({ feats: null })).toBe(false);
  });

  it('the constant matches the authored feat name', () => {
    expect(RUST_BLESSING_FEAT_NAME).toBe('Rust Blessing');
    expect(BROKEN_WEAPON_ATTACK_PENALTY).toBe(-2);
  });
});

describe('brokenArmorAcPenalty', () => {
  it('RAW tiers: −1 light / −2 medium / −3 heavy (unarmored as light)', () => {
    expect(brokenArmorAcPenalty('light')).toBe(-1);
    expect(brokenArmorAcPenalty('medium')).toBe(-2);
    expect(brokenArmorAcPenalty('heavy')).toBe(-3);
    expect(brokenArmorAcPenalty('unarmored')).toBe(-1);
    expect(brokenArmorAcPenalty(undefined)).toBe(-1);
  });

  it('Rust Blessing tiers are one step kinder: −0 / −1 / −2', () => {
    expect(brokenArmorAcPenalty('light', true)).toBe(0);
    expect(brokenArmorAcPenalty('medium', true)).toBe(-1);
    expect(brokenArmorAcPenalty('heavy', true)).toBe(-2);
  });
});

describe('brokenArmorEffect', () => {
  // Steel armor: 36 HP, BT 18. Worn = default (no state).
  const fullPlate = () => ({
    uid: 'e-plate',
    id: 'full-plate',
    name: 'Full Plate',
    armor: { category: 'heavy', group: 'plate', acBonus: 6 },
  });

  it('null when the worn armor is whole', () => {
    expect(brokenArmorEffect([fullPlate()], {}, mundane)).toBeNull();
    expect(brokenArmorEffect([fullPlate()], { 'e-plate': { hp: 19 } }, mundane)).toBeNull();
  });

  it('synthesizes a status AC penalty when the worn armor is broken', () => {
    const eff = brokenArmorEffect([fullPlate()], { 'e-plate': { hp: 18 } }, mundane);
    expect(eff.entry.effectId).toBe(BROKEN_ARMOR_EFFECT_ID);
    expect(eff.def.modifiers).toEqual([{ stat: 'ac', kind: 'status', amount: -3 }]);
    expect(eff.def.name).toMatch(/Broken Armor/);
  });

  it('Rust Blessing softens the penalty by one step', () => {
    const eff = brokenArmorEffect([fullPlate()], { 'e-plate': { hp: 18 } }, blessed);
    expect(eff.def.modifiers).toEqual([{ stat: 'ac', kind: 'status', amount: -2 }]);
  });

  it('a blessed wearer of broken LIGHT armor takes no penalty (null effect)', () => {
    const leather = {
      uid: 'e-leather', id: 'studded-leather-armor', name: 'Studded Leather',
      armor: { category: 'light', group: 'leather', acBonus: 2 },
    };
    // Leather items row: 16 HP, BT 8.
    expect(brokenArmorEffect([leather], { 'e-leather': { hp: 8 } }, blessed)).toBeNull();
    expect(
      brokenArmorEffect([leather], { 'e-leather': { hp: 8 } }, mundane).def.modifiers[0].amount
    ).toBe(-1);
  });

  it('null with no worn armor or no inventory', () => {
    expect(brokenArmorEffect([], {}, mundane)).toBeNull();
    expect(brokenArmorEffect(null, null, null)).toBeNull();
  });
});
