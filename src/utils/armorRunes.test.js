import {
  ARMOR_POTENCY,
  RESILIENT,
  buildArmorName,
  resolveArmor,
  resolveArmorItem,
  armorDisplayName,
  armorPropertyRunes,
  armorRuneTierSummary,
  hasArmorRuneBlock,
} from './armorRunes';

const CHAIN_SHIRT = { name: 'Chain Shirt', price: 5 };

describe('buildArmorName', () => {
  it('orders +potency, resilient, property, material, base', () => {
    expect(
      buildArmorName({
        potency: 2,
        resilient: 'greater',
        properties: ['Slick'],
        material: 'Silver',
        base: 'Chain Shirt',
      })
    ).toBe('+2 Greater Resilient Slick Silver Chain Shirt');
  });

  it('omits empty segments', () => {
    expect(buildArmorName({ base: 'Chain Shirt' })).toBe('Chain Shirt');
    expect(buildArmorName({ potency: 1, base: 'Chain Shirt' })).toBe('+1 Chain Shirt');
  });

  it('ignores an unknown resilient key', () => {
    expect(buildArmorName({ potency: 1, resilient: 'bogus', base: 'Chain Shirt' })).toBe('+1 Chain Shirt');
  });
});

describe('resolveArmor', () => {
  it('derives name, summed price, AC and save deltas for +1 resilient', () => {
    const out = resolveArmor(CHAIN_SHIRT, { potency: 1, resilient: 'resilient' });
    expect(out.name).toBe('+1 Resilient Chain Shirt');
    expect(out.price).toBe(5 + ARMOR_POTENCY[1].price + RESILIENT.resilient.price); // 5 + 160 + 340
    expect(out.price).toBe(505);
    expect(out.acBonus).toBe(1);
    expect(out.saveBonus).toBe(1);
  });

  it('emits the magic-delta modifiers (potency AC + resilient on all three saves)', () => {
    const out = resolveArmor(CHAIN_SHIRT, { potency: 2, resilient: 'greater' });
    expect(out.modifiers).toEqual([
      { stat: 'ac', kind: 'item', amount: 2 },
      { stat: 'fort', kind: 'item', amount: 2 },
      { stat: 'reflex', kind: 'item', amount: 2 },
      { stat: 'will', kind: 'item', amount: 2 },
    ]);
  });

  it('never emits the base armor acBonus (only the potency delta)', () => {
    const armored = { name: 'Full Plate', price: 30, armor: { category: 'heavy', acBonus: 6 } };
    const out = resolveArmor(armored, { potency: 1 });
    expect(out.modifiers).toEqual([{ stat: 'ac', kind: 'item', amount: 1 }]);
  });

  it('emits no modifiers when there are no fundamental runes', () => {
    expect(resolveArmor(CHAIN_SHIRT, {}).modifiers).toEqual([]);
    expect(resolveArmor(CHAIN_SHIRT, {}).price).toBe(5);
  });

  it('forwards property runes with their modifiers and riders intact', () => {
    const slick = {
      name: 'Slick',
      price: 45,
      modifiers: [{ stat: 'acrobatics', kind: 'item', amount: 1 }],
      riders: [{ id: 'slick-reminder', text: 'Squeeze easier' }],
    };
    const out = resolveArmor(CHAIN_SHIRT, { potency: 1, property: [slick] });
    expect(out.name).toBe('+1 Slick Chain Shirt');
    expect(out.price).toBe(5 + 160 + 45);
    expect(out.properties).toEqual([slick]);
    // Potency AC delta + the property's own modifier, in order.
    expect(out.modifiers).toEqual([
      { stat: 'ac', kind: 'item', amount: 1 },
      { stat: 'acrobatics', kind: 'item', amount: 1 },
    ]);
    expect(out.riders).toEqual([{ id: 'slick-reminder', text: 'Squeeze easier' }]);
  });

  it('carries a single `rider` object through as a one-element riders array', () => {
    const rune = { name: 'Fortification', price: 2000, rider: { text: 'crit → flat check' } };
    expect(resolveArmor(CHAIN_SHIRT, { property: [rune] }).riders).toEqual([{ text: 'crit → flat check' }]);
  });

  it('includes the material segment in the name', () => {
    const out = resolveArmor({ name: 'Chain Shirt', price: 5, material: 'Silver' }, { potency: 1 });
    expect(out.name).toBe('+1 Silver Chain Shirt');
  });

  it('tolerates a missing/empty runes block', () => {
    const out = resolveArmor(CHAIN_SHIRT);
    expect(out.name).toBe('Chain Shirt');
    expect(out.acBonus).toBe(0);
    expect(out.saveBonus).toBe(0);
    expect(out.price).toBe(5);
  });
});

describe('item helpers', () => {
  it('hasArmorRuneBlock detects a structured runes object', () => {
    expect(hasArmorRuneBlock({ runes: { potency: 1 } })).toBe(true);
    expect(hasArmorRuneBlock({ runes: [] })).toBe(false);
    expect(hasArmorRuneBlock({ name: 'Chain Shirt' })).toBe(false);
  });

  it('resolveArmorItem reads base fields + runes off the item', () => {
    const out = resolveArmorItem({ name: 'Chain Shirt', price: 5, runes: { potency: 1, resilient: 'resilient' } });
    expect(out.name).toBe('+1 Resilient Chain Shirt');
    expect(out.price).toBe(505);
  });

  it('armorDisplayName returns the runed name, or the raw name when un-runed', () => {
    expect(armorDisplayName({ name: 'Chain Shirt', price: 5, runes: { potency: 1 } })).toBe('+1 Chain Shirt');
    expect(armorDisplayName({ name: 'Chain Shirt' })).toBe('Chain Shirt');
  });

  it('armorPropertyRunes returns slotted property objects ([] when none)', () => {
    const slick = { name: 'Slick' };
    expect(armorPropertyRunes({ runes: { property: [slick, null] } })).toEqual([slick]);
    expect(armorPropertyRunes({ name: 'Chain Shirt' })).toEqual([]);
  });

  it('armorRuneTierSummary summarizes the fundamentals only', () => {
    expect(armorRuneTierSummary({ potency: 1, resilient: 'resilient' })).toBe('+1 Resilient');
    expect(armorRuneTierSummary({})).toBe('');
    expect(armorRuneTierSummary(null)).toBe('');
  });
});
