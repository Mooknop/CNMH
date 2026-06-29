import { FUNDAMENTAL_RUNES, fundamentalRuneMap } from './fundamentalRunes';
import { POTENCY, STRIKING } from '../utils/weaponRunes';
import { ARMOR_POTENCY, RESILIENT } from '../utils/armorRunes';

describe('fundamentalRunes seed', () => {
  it('derives one rune per tier across all four fundamentals (3+3+3+3)', () => {
    expect(FUNDAMENTAL_RUNES).toHaveLength(12);
    const ids = FUNDAMENTAL_RUNES.map((r) => r.id);
    expect(new Set(ids).size).toBe(12); // unique ids
  });

  it('every doc is a fundamental with a target + a tier/tierKey + a price', () => {
    FUNDAMENTAL_RUNES.forEach((r) => {
      expect(r.type).toBe('fundamental');
      expect(['weapon', 'armor']).toContain(r.target);
      expect(typeof r.price).toBe('number');
      if (r.fundamental === 'potency') expect(typeof r.tier).toBe('number');
      else expect(typeof r.tierKey).toBe('string');
    });
  });

  it('sources potency bonus/price from the POTENCY tables', () => {
    const wp1 = fundamentalRuneMap().get('weapon-potency-1');
    expect(wp1).toMatchObject({ fundamental: 'potency', target: 'weapon', tier: 1, price: POTENCY[1].price, name: '+1 Weapon Potency' });
    const ap3 = fundamentalRuneMap().get('armor-potency-3');
    expect(ap3).toMatchObject({ target: 'armor', tier: 3, price: ARMOR_POTENCY[3].price });
  });

  it('keys striking/resilient tiers off the table key + label', () => {
    const striking = fundamentalRuneMap().get('striking');
    expect(striking).toMatchObject({ fundamental: 'striking', target: 'weapon', tierKey: 'striking', name: STRIKING.striking.label, price: STRIKING.striking.price });
    const major = fundamentalRuneMap().get('major-striking');
    expect(major).toMatchObject({ tierKey: 'major', name: STRIKING.major.label });
    const gres = fundamentalRuneMap().get('greater-resilient');
    expect(gres).toMatchObject({ fundamental: 'resilient', target: 'armor', tierKey: 'greater', name: RESILIENT.greater.label });
  });
});
