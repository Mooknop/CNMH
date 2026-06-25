import armorPropertyRunes, { armorRuneCatalogMap } from './armorRunes';
import { resolveArmor } from '../utils/armorRunes';

const byId = armorRuneCatalogMap();
const get = (id) => byId.get(id);

describe('armor property-rune seed', () => {
  it('every rune has the required catalog fields', () => {
    armorPropertyRunes.forEach((r) => {
      expect(typeof r.id).toBe('string');
      expect(r.type).toBe('property');
      expect(r.armorRune).toBe(true);
      expect(typeof r.name).toBe('string');
      expect(typeof r.level).toBe('number');
      expect(typeof r.price).toBe('number');
      expect(r.description.length).toBeGreaterThan(0);
    });
  });

  it('does not double-list the fundamental runes (potency/resilient live in R1 tables)', () => {
    const ids = armorPropertyRunes.map((r) => r.id);
    expect(ids).not.toContain('armor-potency');
    expect(ids).not.toContain('resilient');
  });

  it('has unique ids', () => {
    const ids = armorPropertyRunes.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('prices match the C2 shop-ware item entries', () => {
    expect(get('slick').price).toBe(45);
    expect(get('shadow').price).toBe(55);
    expect(get('ready').price).toBe(200);
    expect(get('quenching').price).toBe(250);
    expect(get('aim-aiding').price).toBe(225);
    expect(get('dread').price).toBe(225);
    expect(get('swallow-spike').price).toBe(200);
  });

  describe('modifier runes', () => {
    it('Slick carries an Acrobatics item bonus', () => {
      expect(get('slick').modifiers).toEqual([{ stat: 'acrobatics', kind: 'item', amount: 1 }]);
    });

    it('Shadow carries a flat Stealth item bonus and no reminder', () => {
      expect(get('shadow').modifiers).toEqual([{ stat: 'stealth', kind: 'item', amount: 1 }]);
      expect(get('shadow').riders).toBeUndefined();
    });
  });

  describe('reminder runes', () => {
    it.each(['ready', 'quenching', 'aim-aiding', 'dread', 'swallow-spike'])(
      '%s carries reminder text and no engine-modifying block',
      (id) => {
        const r = get(id);
        expect(r.modifiers).toBeUndefined();
        expect(Array.isArray(r.riders)).toBe(true);
        expect(r.riders[0].text.length).toBeGreaterThan(0);
      }
    );
  });

  describe('resolves through the R1 resolver', () => {
    it('a Slick rune over Chain Shirt forwards its modifier and name', () => {
      const out = resolveArmor({ name: 'Chain Shirt', price: 5 }, { potency: 1, property: [get('slick')] });
      expect(out.name).toBe('+1 Slick Chain Shirt');
      expect(out.price).toBe(5 + 160 + 45);
      expect(out.modifiers).toEqual([
        { stat: 'ac', kind: 'item', amount: 1 },
        { stat: 'acrobatics', kind: 'item', amount: 1 },
      ]);
    });

    it('a reminder-only rune forwards its rider with no modifier side-effect', () => {
      const out = resolveArmor({ name: 'Chain Shirt', price: 5 }, { property: [get('quenching')] });
      expect(out.modifiers).toEqual([]);
      expect(out.riders).toEqual(get('quenching').riders);
    });
  });
});
