import {
  scaleDamageDice,
  buildWeaponName,
  resolveWeapon,
  translatePropertyRider,
  weaponDisplayName,
  runeTierSummary,
  weaponPropertyRunes,
  buildRuneBreakdown,
  formatRuneBreakdown,
  propertySlotCapacity,
  usedPropertySlots,
  freePropertySlots,
  hasFreePropertySlot,
  POTENCY,
  STRIKING,
} from './weaponRunes';

describe('scaleDamageDice', () => {
  test('adds dice of the same size', () => {
    expect(scaleDamageDice('1d6', 1)).toBe('2d6');
    expect(scaleDamageDice('1d6', 2)).toBe('3d6');
    expect(scaleDamageDice('1d6', 3)).toBe('4d6');
    expect(scaleDamageDice('1d8', 2)).toBe('3d8');
  });

  test('preserves a trailing modifier', () => {
    expect(scaleDamageDice('1d6+3', 1)).toBe('2d6+3');
    expect(scaleDamageDice('1d10-1', 3)).toBe('4d10-1');
  });

  test('is a no-op for 0 extra dice or falsy input', () => {
    expect(scaleDamageDice('1d6', 0)).toBe('1d6');
    expect(scaleDamageDice('1d6')).toBe('1d6');
    expect(scaleDamageDice('', 2)).toBe('');
    expect(scaleDamageDice(undefined, 2)).toBeUndefined();
  });

  test('leaves non-dice strings untouched', () => {
    expect(scaleDamageDice('5', 2)).toBe('5');
    expect(scaleDamageDice('special', 2)).toBe('special');
  });
});

describe('buildWeaponName', () => {
  test('omits empty segments', () => {
    expect(buildWeaponName({ base: 'Greataxe' })).toBe('Greataxe');
    expect(buildWeaponName({ potency: 1, base: 'Pick' })).toBe('+1 Pick');
  });

  test('orders potency → striking → property → material → base', () => {
    expect(buildWeaponName({
      potency: 2,
      striking: 'greater',
      properties: ['Flaming', 'Dread'],
      material: 'Cold Iron',
      base: 'Greataxe',
    })).toBe('+2 Greater Striking Flaming Dread Cold Iron Greataxe');
  });

  test('drops falsy property names', () => {
    expect(buildWeaponName({ striking: 'striking', properties: [null, 'Frost', undefined], base: 'Mace' }))
      .toBe('Striking Frost Mace');
  });
});

describe('resolveWeapon', () => {
  const base = { name: 'Pick', price: 0.1, damage: '1d6' };

  test('potency yields attack bonus and adds tier price', () => {
    const r = resolveWeapon(base, { potency: 2 });
    expect(r.potencyBonus).toBe(2);
    expect(r.price).toBeCloseTo(0.1 + POTENCY[2].price);
    expect(r.name).toBe('+2 Pick');
  });

  test('striking scales the native die and adds its price', () => {
    const r = resolveWeapon(base, { potency: 1, striking: 'striking' });
    expect(r.extraDice).toBe(1);
    expect(r.damage).toBe('2d6');
    expect(r.price).toBeCloseTo(0.1 + POTENCY[1].price + STRIKING.striking.price);
    expect(r.name).toBe('+1 Striking Pick');
  });

  test('greater striking adds two dice', () => {
    expect(resolveWeapon(base, { striking: 'greater' }).damage).toBe('3d6');
  });

  test('folds property runes into name, price, and translated riders', () => {
    const vitalizing = {
      id: 'vitalizing',
      name: 'Vitalizing',
      price: 150,
      rider: { vsTrait: 'undead', persistent: '1d6', damageType: 'vitality' },
    };
    const r = resolveWeapon(
      { name: 'Greataxe', price: 35, damage: '1d12', material: 'Cold Iron' },
      { potency: 2, striking: 'greater', property: [vitalizing] },
    );
    expect(r.name).toBe('+2 Greater Striking Vitalizing Cold Iron Greataxe');
    expect(r.price).toBeCloseTo(35 + POTENCY[2].price + STRIKING.greater.price + 150);
    expect(r.riders).toEqual([
      {
        id: 'rune-vitalizing-persistent',
        label: 'Vitalizing (vs undead)',
        persistent: { dice: '1d6', type: 'vitality' },
        appliesVsTrait: 'undead',
      },
    ]);
    expect(r.damage).toBe('3d12');
  });

  test('empty runes leave the base untouched', () => {
    const r = resolveWeapon(base, {});
    expect(r.potencyBonus).toBe(0);
    expect(r.extraDice).toBe(0);
    expect(r.damage).toBe('1d6');
    expect(r.price).toBeCloseTo(0.1);
    expect(r.name).toBe('Pick');
    expect(r.riders).toEqual([]);
  });

  test('omits damage when the base has none (per-strike scaling handled elsewhere)', () => {
    const r = resolveWeapon({ name: 'Pick', price: 0.1 }, { striking: 'striking' });
    expect(r.damage).toBeUndefined();
    expect(r.extraDice).toBe(1);
  });
});

describe('translatePropertyRider', () => {
  const vitalizing = {
    id: 'vitalizing',
    name: 'Vitalizing',
    rider: {
      vsTrait: 'undead',
      persistent: '1d6',
      damageType: 'vitality',
      onCrit: { conditions: [{ name: 'enfeebled', value: 1, duration: 'end-of-next-turn' }] },
    },
  };

  test('emits a persistent rider plus one crit-condition rider, both vsTrait-gated', () => {
    const out = translatePropertyRider(vitalizing);
    expect(out).toEqual([
      {
        id: 'rune-vitalizing-persistent',
        label: 'Vitalizing (vs undead)',
        persistent: { dice: '1d6', type: 'vitality' },
        appliesVsTrait: 'undead',
      },
      {
        id: 'rune-vitalizing-crit-enfeebled',
        label: 'Vitalizing — enfeebled 1 (vs undead)',
        condition: 'enfeebled 1 (until the end of your next turn)',
        on: ['criticalSuccess'],
        appliesVsTrait: 'undead',
      },
    ]);
  });

  test('greater scaling: 2d6 persistent + two while-persistent crit conditions', () => {
    const out = translatePropertyRider({
      id: 'vitalizing-greater',
      name: 'Vitalizing (Greater)',
      rider: {
        vsTrait: 'undead',
        persistent: '2d6',
        damageType: 'vitality',
        onCrit: {
          conditions: [
            { name: 'enfeebled', value: 1, duration: 'while-persistent' },
            { name: 'stupefied', value: 1, duration: 'while-persistent' },
          ],
        },
      },
    });
    expect(out).toHaveLength(3);
    expect(out[0].persistent).toEqual({ dice: '2d6', type: 'vitality' });
    expect(out[1].condition).toBe('enfeebled 1 (while the persistent damage continues)');
    expect(out[2].condition).toBe('stupefied 1 (while the persistent damage continues)');
    expect(out.every((r) => r.appliesVsTrait === 'undead')).toBe(true);
  });

  test('immediate dice + crit-only persistent (#1019 flaming)', () => {
    const flaming = {
      id: 'flaming',
      name: 'Flaming',
      rider: {
        dice: '1d6',
        damageType: 'fire',
        onCrit: { persistent: '1d10' },
      },
    };
    expect(translatePropertyRider(flaming)).toEqual([
      {
        id: 'rune-flaming-dice',
        label: 'Flaming',
        dice: '1d6',
        type: 'fire',
      },
      {
        id: 'rune-flaming-crit-persistent',
        label: 'Flaming (crit)',
        persistent: { dice: '1d10', type: 'fire' },
        on: ['criticalSuccess'],
      },
    ]);
  });

  test('onCrit.damageType overrides the shared damageType for the crit persistent', () => {
    const out = translatePropertyRider({
      id: 'odd',
      name: 'Odd',
      rider: { dice: '1d6', damageType: 'cold', onCrit: { persistent: '1d8', damageType: 'bleed' } },
    });
    expect(out[1].persistent).toEqual({ dice: '1d8', type: 'bleed' });
  });

  test('passes a flat #222 rider through untouched', () => {
    const flat = { rider: { persistent: { dice: '1d4', type: 'bleed' } } };
    expect(translatePropertyRider(flat)).toEqual([flat.rider]);
    const bonus = { rider: { id: 'x', label: 'Frost', bonus: { flat: 1 } } };
    expect(translatePropertyRider(bonus)).toEqual([bonus.rider]);
  });

  test('no rider → empty', () => {
    expect(translatePropertyRider({ id: 'plain', name: 'Plain' })).toEqual([]);
    expect(translatePropertyRider(null)).toEqual([]);
  });
});

describe('display helpers (#548 Slice 3c)', () => {
  const runedAxe = {
    name: 'Greataxe',
    price: 35,
    runes: { potency: 2, striking: 'greater', property: [{ id: 'vitalizing', name: 'Vitalizing', description: 'vs undead' }] },
  };

  describe('weaponDisplayName', () => {
    test('derives the full runed name for a base + runes weapon', () => {
      expect(weaponDisplayName(runedAxe)).toBe('+2 Greater Striking Vitalizing Greataxe');
    });
    test('passes legacy / non-runed items through unchanged', () => {
      expect(weaponDisplayName({ name: '+1 Striking Pick', potency: 1 })).toBe('+1 Striking Pick');
      expect(weaponDisplayName({ name: 'Rope' })).toBe('Rope');
      expect(weaponDisplayName(undefined)).toBeUndefined();
    });
  });

  describe('runeTierSummary', () => {
    test('summarizes potency + striking only', () => {
      expect(runeTierSummary(runedAxe.runes)).toBe('+2 Greater Striking');
      expect(runeTierSummary({ potency: 1 })).toBe('+1');
      expect(runeTierSummary({})).toBe('');
      expect(runeTierSummary(undefined)).toBe('');
    });
  });

  describe('weaponPropertyRunes', () => {
    test('returns resolved property-rune docs, skipping unresolved id strings', () => {
      expect(weaponPropertyRunes(runedAxe)).toEqual([{ id: 'vitalizing', name: 'Vitalizing', description: 'vs undead' }]);
      expect(weaponPropertyRunes({ name: 'X', runes: { property: ['unresolved'] } })).toEqual([]);
      expect(weaponPropertyRunes({ name: 'Rope' })).toEqual([]);
    });
  });

  describe('buildRuneBreakdown / formatRuneBreakdown', () => {
    test('captures potency, striking dice + label, and property names', () => {
      const b = buildRuneBreakdown(runedAxe);
      expect(b).toEqual({
        potencyBonus: 2,
        extraDice: 2,
        strikingLabel: 'Greater Striking',
        properties: ['Vitalizing'],
      });
      expect(formatRuneBreakdown(b)).toBe('+2 potency · +2 dice (Greater Striking) · Vitalizing');
    });

    test('singular "die" for +1 striking, no striking label when absent', () => {
      const b = buildRuneBreakdown({ name: 'Pick', runes: { potency: 1, striking: 'striking' } });
      expect(b).toMatchObject({ potencyBonus: 1, extraDice: 1, strikingLabel: 'Striking', properties: [] });
      expect(formatRuneBreakdown(b)).toBe('+1 potency · +1 die (Striking)');

      const potencyOnly = buildRuneBreakdown({ name: 'Mace', runes: { potency: 1 } });
      expect(formatRuneBreakdown(potencyOnly)).toBe('+1 potency');
    });

    test('null for non-runed / empty-rune items; format("") for null', () => {
      expect(buildRuneBreakdown({ name: 'Rope' })).toBeNull();
      expect(buildRuneBreakdown({ name: 'Pick', runes: {} })).toBeNull();
      expect(formatRuneBreakdown(null)).toBe('');
    });
  });

  describe('property-rune slots (#607, #804)', () => {
    test('capacity equals the potency tier', () => {
      expect(propertySlotCapacity({ potency: 0 })).toBe(0);
      expect(propertySlotCapacity({ potency: 2 })).toBe(2);
      expect(propertySlotCapacity(undefined)).toBe(0);
    });

    test('used slots count both string refs and resolved docs', () => {
      expect(usedPropertySlots({ runes: { property: ['flaming', { id: 'frost' }] } })).toBe(2);
      expect(usedPropertySlots({ runes: { property: [] } })).toBe(0);
      expect(usedPropertySlots({ name: 'Club' })).toBe(0);
    });

    test('free slots = capacity − used, floored at 0', () => {
      expect(freePropertySlots({ runes: { potency: 2, property: ['flaming'] } })).toBe(1);
      expect(freePropertySlots({ runes: { potency: 1, property: ['flaming'] } })).toBe(0);
      // Over-slotted (potency lowered under existing runes) never goes negative.
      expect(freePropertySlots({ runes: { potency: 1, property: ['flaming', 'frost'] } })).toBe(0);
      // Striking doesn't consume a property slot.
      expect(freePropertySlots({ runes: { potency: 2, striking: 'greater', property: ['flaming'] } })).toBe(1);
    });

    test('hasFreePropertySlot reflects availability', () => {
      expect(hasFreePropertySlot({ runes: { potency: 1 } })).toBe(true);
      expect(hasFreePropertySlot({ runes: { potency: 1, property: ['flaming'] } })).toBe(false);
      expect(hasFreePropertySlot({ name: 'Club' })).toBe(false); // no potency
    });
  });
});
