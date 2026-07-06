// Snapshot integrity gate for the G3 wave-1 shield property runes (#1196 G3,
// #1199): every authored rune is a well-formed shield property rune, category
// gates + duplicable/choice metadata are sane, and the runes flow through the
// real G2 socket helpers (target classification, usage gate). Runs the REAL
// utils so authoring drift is caught here.
import { runes } from './index';
import { runeTarget } from '../utils/runeClassify';
import { compatibleRunes, applyRune } from '../utils/runeSockets';

// The 41 wave-1 ids authored in this slice (Class A passive + Class B activated).
const WAVE1 = [
  'energy-resistant', 'greater-energy-resistant', 'major-energy-resistant',
  'feather', 'shield-returning', 'throwing', 'furious', 'heavy', 'moonlit',
  'darkness', 'glamourous', 'spell-saving', 'sliding', 'greater-sliding', 'launching',
  'environmental', 'greater-environmental', 'gusting', 'retrieving', 'greater-retrieving',
  'holding', 'greater-holding', 'focusing', 'greater-focusing', 'major-focusing', 'true-focusing',
  'summoning', 'greater-summoning', 'major-summoning', 'true-summoning',
  'aggressive', 'enlarging', 'living', 'greater-living', 'true-living',
  'undead', 'greater-undead', 'true-undead', 'weapon-storing', 'floating', 'knowing',
];

const byId = (id) => runes.find((r) => r.id === id);
const CATS = new Set(['light', 'medium', 'heavy']);

describe('seeded shield property runes (G3 W1)', () => {
  it('all 41 wave-1 ids resolve', () => {
    const missing = WAVE1.filter((id) => !byId(id));
    expect(missing, `missing: ${missing.join(', ')}`).toEqual([]);
  });

  it.each(WAVE1)('%s is a well-formed shield property rune', (id) => {
    const r = byId(id);
    expect(r.type).toBe('property');
    expect(r.target).toBe('shield');
    expect(runeTarget(r)).toBe('shield'); // classifies for the socket layer
    expect(typeof r.level).toBe('number');
    expect(typeof r.price).toBe('number');
    expect(typeof r.description).toBe('string');
    expect(r.description.length).toBeGreaterThan(20);
    if (r.shieldCategories !== undefined) {
      expect(Array.isArray(r.shieldCategories)).toBe(true);
      expect(r.shieldCategories.every((c) => CATS.has(c))).toBe(true);
    }
  });

  it('activated (Class B) runes carry a well-formed actuated block', () => {
    const activated = WAVE1.map(byId).filter((r) => r.actuated);
    expect(activated.length).toBeGreaterThan(10); // sanity: many Class B runes
    for (const r of activated) {
      expect(typeof r.actuated.name, `${r.id} actuated.name`).toBe('string');
      expect(typeof r.actuated.frequency, `${r.id} frequency`).toBe('string');
      expect(typeof r.actuated.description, `${r.id} actuated.description`).toBe('string');
      expect(Array.isArray(r.actuated.traits)).toBe(true);
    }
  });

  it('energy-resistant is the only duplicable line, each with the 5 energy choices', () => {
    const duplicable = WAVE1.map(byId).filter((r) => r.duplicable);
    expect(duplicable.map((r) => r.id).sort()).toEqual(
      ['energy-resistant', 'greater-energy-resistant', 'major-energy-resistant']
    );
    for (const r of duplicable) {
      expect(r.choices).toEqual(['acid', 'cold', 'electricity', 'fire', 'sonic']);
    }
  });

  it('category gates match the supplement', () => {
    expect(byId('feather').shieldCategories).toEqual(['light', 'medium']);
    expect(byId('darkness').shieldCategories).toEqual(['light']);
    expect(byId('heavy').shieldCategories).toEqual(['medium', 'heavy']);
    expect(byId('retrieving').shieldCategories).toEqual(['light']);
    // Ungated runes leave the field unset.
    expect(byId('moonlit').shieldCategories).toBeUndefined();
  });
});

// Integration: the real G2 socket layer honors the authored gates + duplicable.
describe('shield property runes through the G2 socket layer', () => {
  const shield = (weight, runes) => ({ uid: 's1', name: 'Shield', weight, shield: { hardness: 5 }, runes });

  it('a light rune (darkness) is offered on a light shield, rejected on a medium one', () => {
    const stock = [byId('darkness'), byId('feather')];
    // medium (Bulk 1): darkness gated out, feather (light/medium) stays.
    expect(compatibleRunes(shield(1, { reinforcing: 'minor' }), 'property', stock).map((r) => r.id))
      .toEqual(['feather']);
    // light (Bulk L): both offered.
    expect(compatibleRunes(shield(0.1, { reinforcing: 'minor' }), 'property', stock).map((r) => r.id))
      .toEqual(['darkness', 'feather']);
  });

  it('energy-resistant stacks with distinct chosen types; a repeat type is rejected', () => {
    const er = byId('energy-resistant');
    const fire = applyRune(shield(1, { reinforcing: 'moderate' }), er, { choice: 'fire' });
    expect(fire.runes.property).toEqual([{ id: 'energy-resistant', choice: 'fire' }]);
    const cold = applyRune(fire, er, { choice: 'cold' });
    expect(cold.runes.property).toHaveLength(2);
    expect(applyRune(fire, er, { choice: 'fire' })).toBeNull(); // same type — rejected
  });
});
