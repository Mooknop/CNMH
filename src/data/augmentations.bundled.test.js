// Snapshot integrity gate for the Everything Shields augmentation catalog (#1202
// U3): all 9 shield augmentations are seeded with the right level/price/rarity
// (verbatim from the PDF's ITEM tags), kept out of shops, and valid to fit onto a
// real shield. Runs the REAL augmentation model so an authoring slip (wrong type,
// missing augTarget, a shop leak, a bad size gate, a malformed actuated block) is
// caught here rather than in the app.
import { items } from './index';
import { isAugmentation, augTargets, augmentationFits, augmentationUsageAllows } from '../utils/augmentations';

const byId = (id) => items.find((i) => i.id === id);
const light = { id: 'buckler', name: 'Buckler', shield: { bonus: 1 }, weight: 0.1 };
const heavy = { id: 'tower', name: 'Tower Shield', shield: { bonus: 2 }, weight: 4 };

// [id, level, price, rarity, actuated?]
const CATALOG = [
  ['ancestral-predator', 3, 20, 'uncommon', false],
  ['barbed-edges', 5, 40, 'common', false],
  ['coat-of-arms', 3, 20, 'uncommon', false],
  ['improved-mirror', 10, 1000, 'uncommon', true],
  ['interior-polish', 5, 50, 'uncommon', true],
  ['mirror', 1, 1, 'uncommon', true],
  ['shield-harness', 7, 105, 'common', false],
  ['shield-sheath', 1, 1, 'common', false],
  ['shield-strap', 1, 1, 'common', false],
];

describe('seeded shield augmentations (U3 — Everything Shields)', () => {
  it('seeds all 9 Everything Shields augmentations', () => {
    const ids = new Set(items.filter(isAugmentation).map((d) => d.id));
    for (const [id] of CATALOG) expect(ids.has(id), `missing ${id}`).toBe(true);
  });

  it.each(CATALOG)('%s: shield augmentation, kept out of shops, level/price/rarity match the PDF', (id, level, price, rarity, actuated) => {
    const doc = byId(id);
    expect(doc, `missing ${id}`).toBeTruthy();
    expect(isAugmentation(doc)).toBe(true);
    expect(augTargets(doc)).toEqual(['shield']);
    expect(doc.noShop).toBe(true); // #1106 — never loose stock / Sale Shelf
    expect(doc.level).toBe(level);
    expect(doc.price).toBe(price);
    expect(doc.rarity).toBe(rarity);
    expect(typeof doc.description).toBe('string');
    expect(doc.description.length).toBeGreaterThan(0);
    // An `actuated` doc is well-formed; a note doc carries none.
    if (actuated) {
      expect(doc.actuated).toBeTruthy();
      expect(doc.actuated.cost).toBe('none');
      expect(['reaction', 1, 2, 3]).toContain(doc.actuated.actionCount);
      expect(typeof doc.actuated.description).toBe('string');
    } else {
      expect(doc.actuated).toBeUndefined();
    }
  });

  it('unrestricted augmentations fit any shield; size-gated ones honor their category', () => {
    // Mirror is unrestricted — fits light and heavy.
    expect(augmentationFits(light, byId('mirror'))).toBe(true);
    expect(augmentationFits(heavy, byId('mirror'))).toBe(true);
    // Shield Harness (medium/heavy) rejects a light buckler.
    expect(augmentationUsageAllows(light, byId('shield-harness'))).toBe(false);
    expect(augmentationUsageAllows(heavy, byId('shield-harness'))).toBe(true);
    // Shield Strap (light/medium) rejects a heavy tower shield.
    expect(augmentationUsageAllows(light, byId('shield-strap'))).toBe(true);
    expect(augmentationUsageAllows(heavy, byId('shield-strap'))).toBe(false);
  });

  it('Ancestral Predator is choice-bearing (creature type) so the choice pickers light up', () => {
    const doc = byId('ancestral-predator');
    expect(Array.isArray(doc.choices)).toBe(true);
    expect(doc.choices).toContain('dragon');
    expect(doc.choices).toContain('undead');
    expect(doc.traits).toContain('Visual');
  });
});

// The official PF2e adjustments (Grand Bazaar / Treasure Vault / Mwangi / Knights of
// Lastwall / Firebrands) generalized to weapon/armor/shield augmentations (#1205
// follow-up). [id, target, level, price, actuated?] — verbatim from the Foundry pf2e
// module; a shield augTarget here means an OFFICIAL shield adjustment (distinct from
// the 3rd-party Everything Shields set above).
const OFFICIAL = [
  ['armor-latches', 'armor', 1, 4, false],
  ['burnished-plating', 'armor', 1, 5, true],
  ['reinforced-surcoat', 'armor', 0, 2, false],
  ['twining-chains', 'armor', 1, 5, true],
  ['parade-armor', 'armor', 2, 10, false],
  ['storage', 'armor', 0, 1, false],
  ['weapon-harness', 'armor', 1, 6, false],
  ['tremorsensors', 'armor', 4, 100, true],
  ['subtle-armor', 'armor', 1, 5, false],
  ['injection-reservoir', 'weapon', 1, 10, false],
  ['weapon-siphon', 'weapon', 1, 10, false],
  ['eyecatcher', 'weapon', 1, 2, false],
  ['dragons-crest', 'shield', 1, 10, false],
  ['shield-augmentation', 'shield', 0, 0.8, false],
  ['throwing-shield', 'shield', 1, 5, false],
];

const HOSTS = {
  armor: { id: 'breastplate', name: 'Breastplate', armor: { acBonus: 4 }, weight: 2 },
  weapon: { id: 'longsword', name: 'Longsword', strikes: [{ damage: '1d8' }], weight: 1 },
  shield: { id: 'buckler', name: 'Buckler', shield: { bonus: 1 }, weight: 0.1 },
};

describe('seeded official adjustments (armor / weapon / shield)', () => {
  it.each(OFFICIAL)('%s: a %s augmentation, noShop, fits its host, level/price match AoN', (id, target, level, price, actuated) => {
    const doc = byId(id);
    expect(doc, `missing ${id}`).toBeTruthy();
    expect(isAugmentation(doc)).toBe(true);
    expect(augTargets(doc)).toEqual([target]);
    expect(doc.noShop).toBe(true);
    expect(doc.level).toBe(level);
    expect(doc.price).toBe(price);
    expect(doc.traits).toContain('Adjustment');
    expect(doc.description.length).toBeGreaterThan(0);
    // Fits a host of its declared type, not the other two.
    expect(augmentationFits(HOSTS[target], doc)).toBe(true);
    for (const other of Object.keys(HOSTS)) {
      if (other !== target) expect(augmentationFits(HOSTS[other], doc)).toBe(false);
    }
    if (actuated) {
      expect(doc.actuated.cost).toBe('none');
      expect(['reaction', 'free', 1, 2, 3]).toContain(doc.actuated.actionCount);
      expect(doc.actuated.description).toMatch(/Trigger|Effect/);
    } else {
      expect(doc.actuated).toBeUndefined();
    }
  });

  it('seeds 24 augmentations total: 12 shield, 9 armor, 3 weapon', () => {
    const augs = items.filter(isAugmentation);
    expect(augs).toHaveLength(24);
    const by = (t) => augs.filter((d) => augTargets(d).includes(t)).length;
    expect([by('shield'), by('armor'), by('weapon')]).toEqual([12, 9, 3]);
  });
});
