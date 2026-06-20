import { scaleDamageDice, buildWeaponName, resolveWeapon, POTENCY, STRIKING } from './weaponRunes';

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

  test('forwards property runes: name, price, and riders', () => {
    const vitalizing = {
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
    expect(r.riders).toEqual([vitalizing.rider]);
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
