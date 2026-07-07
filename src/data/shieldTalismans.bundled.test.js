// Snapshot integrity gate for the Everything Shields import (#1196 G5, #1201):
// the 8 shield talismans are seeded as affix-to-shield Consumable talismans with
// a well-formed activation, the right level/price per grade (Table, PDF Ch.4),
// and are valid to affix onto a seeded shield. Runs the REAL affix util so
// authoring drift (a wrong affixTo, a missing activation, a bad grade) is caught
// here.
import { items } from './index';
import { isTalisman, affixTargetType, hostMatchesType } from '../utils/affix';
import { activationOf } from '../utils/talismanActivation';

const byId = (id) => items.find((i) => i.id === id);

// [id, level, price, traits, grades] — grades: [[name, level, price], …] or null
const TALISMANS = [
  ['adamantine-flake', 3, 8, ['Consumable', 'Magical', 'Talisman', 'Transmutation'], [
    ['Adamantine Flake', 3, 8], ['Greater Adamantine Flake', 8, 90],
    ['Major Adamantine Flake', 13, 460], ['True Adamantine Flake', 18, 1600],
  ]],
  ['bottled-firefly-swarm', 1, 2, ['Conjuration', 'Consumable', 'Primal', 'Talisman'], [
    ['Bottled Firefly Swarm', 1, 2], ['Greater Bottled Firefly Swarm', 4, 12],
    ['Major Bottled Firefly Swarm', 8, 100], ['True Bottled Firefly Swarm', 16, 1600],
  ]],
  ['heartstone', 10, 160, ['Consumable', 'Magical', 'Talisman', 'Transmutation'], null],
  ['magnetic-token', 6, 40, ['Consumable', 'Evocation', 'Magical', 'Talisman'], null],
  ['prismatic-crystal', 4, 12, ['Consumable', 'Magical', 'Talisman', 'Transmutation'], null],
  ['stone-and-mortar', 8, 90, ['Conjuration', 'Consumable', 'Magical', 'Talisman'], null],
  ['tree-sap', 3, 8, ['Consumable', 'Magical', 'Talisman', 'Transmutation'], [
    ['Tree Sap', 3, 8], ['Greater Tree Sap', 6, 40],
  ]],
  ['venom-pouch', 6, 40, ['Consumable', 'Magical', 'Necromancy', 'Talisman'], [
    ['Venom Pouch', 6, 40], ['Greater Venom Pouch', 10, 160], ['Major Venom Pouch', 14, 800],
  ]],
];

describe('seeded shield talismans (G5)', () => {
  it.each(TALISMANS)('%s: affix-to-shield talisman with an activation', (id, level, price, wantTraits) => {
    const item = byId(id);
    expect(item, `missing ${id}`).toBeTruthy();
    expect(item.level).toBe(level);
    expect(item.price).toBe(price);
    expect(item.weight).toBe(0);
    // Traits authored alphabetically, and the item reads as a talisman.
    expect(item.traits).toEqual(wantTraits);
    expect(isTalisman(item)).toBe(true);
    // Affixes to a shield, and carries a well-formed single-action activation.
    expect(affixTargetType(item)).toBe('shield');
    const act = activationOf(item);
    expect(act).toBeTruthy();
    expect(act.cost).toBe(1);
    // A verbatim flavor/effect description is present.
    expect(item.description.length).toBeGreaterThan(40);
  });

  it.each(TALISMANS.filter((t) => t[4]))('%s: grade variants carry the right level/price', (id, _l, _p, _t, grades) => {
    const item = byId(id);
    expect(Array.isArray(item.variants)).toBe(true);
    expect(item.variants.map((v) => [v.name, v.level, v.price])).toEqual(grades);
    // Every graded variant explains what it changes.
    for (const v of item.variants) expect(String(v.effect || '').length).toBeGreaterThan(0);
  });

  it('all affix onto a seeded shield (real host-match)', () => {
    const shield = items.find((i) => i.shield);
    expect(shield, 'no seeded shield to host talismans').toBeTruthy();
    for (const [id] of TALISMANS) {
      expect(hostMatchesType(shield, affixTargetType(byId(id))), `${id} should affix to a shield`).toBe(true);
    }
  });
});
