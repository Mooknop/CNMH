import {
  rollRuneSaleItem,
  rollScrollPack,
  rollSaleShelf,
  resolveSaleWares,
  buildRuneSaleItem,
  buildScrollPackWare,
  rerollSaleItem,
  saleRuneEditOptions,
  saleScrollPackOptions,
} from './saleShelf';
import { resolveWeapon } from './weaponRunes';
import { resolveArmor } from './armorRunes';
import { SCROLL_BY_RANK } from './spellItems';
import { groupWares } from './shopUtils';

// A scripted RNG returning the sequence in order, cycling — so a test can steer
// each pick/count decision. `constRng(v)` is the degenerate always-`v` form.
const scriptRng = (seq) => {
  let i = 0;
  return () => seq[i++ % seq.length];
};
const constRng = (v) => () => v;

// ── Fixtures ─────────────────────────────────────────────────────────────────
const longsword = { id: 'longsword', name: 'Longsword', price: 1, strikes: [{ name: 'Longsword', damage: '1d8' }] };
const leather = { id: 'leather', name: 'Leather Armor', price: 2, armor: { acBonus: 1 } };
const cloak = { id: 'cloak', name: 'Cloak', price: 1, weight: 0.1, accessoryTags: ['cloak'] };
const powerRing = {
  id: 'power-ring',
  name: 'Power Ring',
  powerRing: true,
  weight: 0.1,
  traits: ['Invested', 'Magical'],
  variants: [
    { level: 5, name: 'Power Ring (Iron)', price: 125, overrides: { ringSockets: 1 } },
    { level: 11, name: 'Power Ring (Silver)', price: 1400, overrides: { ringSockets: 2 } },
  ],
};
const cursedBlade = { id: 'cursed-blade', name: 'Cursed Blade', price: 1, strikes: [{ name: 'Cursed Blade', damage: '1d8' }], noShop: true };

const items = [longsword, leather, cloak, powerRing, cursedBlade];

const weaponRuneLow = { id: 'keen', name: 'Keen', type: 'property', target: 'weapon', level: 1, price: 3000 };
const weaponRune = { id: 'flaming', name: 'Flaming', type: 'property', target: 'weapon', level: 8, price: 500 };
const weaponRune2 = { id: 'frost', name: 'Frost', type: 'property', target: 'weapon', level: 8, price: 500 };
const armorRune = { id: 'slick', name: 'Slick', type: 'property', target: 'armor', level: 5, price: 45 };
const ringRune = { id: 'spellstoring', name: 'Spellstoring', type: 'property', target: 'ring', level: 13, price: 2700 };
const accessoryRune = { id: 'presentable', name: 'Presentable', type: 'property', target: 'accessory', level: 2, price: 8, usage: ['cloak', 'clothing'] };

const runes = [weaponRune, weaponRune2, armorRune, ringRune, accessoryRune];

const catalogMap = new Map(items.map((it) => [it.id, it]));
const runeMap = new Map(runes.map((r) => [r.id, r]));

const spells = [
  { id: 'heal', name: 'Heal', level: 1, traditions: ['divine', 'primal'] },
  { id: 'bless', name: 'Bless', level: 1, traditions: ['divine'] },
  { id: 'fireball', name: 'Fireball', level: 3, traditions: ['arcane', 'primal'] },
];

// Recompute a rolled weapon's expected price from its stored (id) rune block.
const weaponPrice = (sale) => {
  const base = catalogMap.get(sale.ref);
  const property = (sale.runes.property || []).map((id) => runeMap.get(id));
  return resolveWeapon({ name: base.name, price: base.price }, { ...sale.runes, property }).price;
};

describe('rollRuneSaleItem', () => {
  it('rolls a valid weapon with fundamentals + distinct property ids, priced by the resolver', () => {
    const offering = { runeService: true, targets: ['weapon'], maxLevel: 20 };
    // rng: pick target[0]=weapon, host[0], potency[last tier], add-second true, second[last], count=max, then samples.
    const sale = rollRuneSaleItem(offering, items, runes, constRng(0.99));
    expect(sale.sale).toBe('rune');
    expect(sale.ref).toBe('longsword');
    expect(sale.runes.potency).toBeGreaterThanOrEqual(1);
    // property holds IDS, not docs
    (sale.runes.property || []).forEach((p) => {
      expect(typeof p).toBe('string');
      expect(runeMap.has(p)).toBe(true);
    });
    // distinct
    expect(new Set(sale.runes.property).size).toBe((sale.runes.property || []).length);
    expect(sale.fullPrice).toBe(weaponPrice(sale));
    expect(sale.price).toBe(sale.fullPrice); // no discount configured
  });

  it('applies saleDiscount with rounding to the resolver price', () => {
    const offering = { runeService: true, targets: ['weapon'], maxLevel: 20, saleDiscount: 0.2 };
    const sale = rollRuneSaleItem(offering, items, runes, constRng(0.99));
    expect(sale.price).toBe(Math.round(sale.fullPrice * 0.8));
  });

  it('honors the zero-rune guard: a window admitting a rune but no fundamental tier is inadmissible', () => {
    // cap 1 admits the level-1 weapon rune, but weapon potency starts at item level 2.
    const offering = { runeService: true, targets: ['weapon'], maxLevel: 1 };
    expect(rollRuneSaleItem(offering, [longsword], [weaponRuneLow], constRng(0))).toBeNull();
  });

  it('returns null when the target has no host item', () => {
    const offering = { runeService: true, targets: ['weapon'], maxLevel: 20 };
    expect(rollRuneSaleItem(offering, [leather, cloak], runes, constRng(0))).toBeNull();
  });

  it('never surfaces a #1105-excluded base item', () => {
    const offering = { runeService: true, targets: ['weapon'], maxLevel: 20 };
    // Only the excluded blade is a weapon host ⇒ inadmissible.
    const sale = rollRuneSaleItem(offering, [cursedBlade, leather], runes, constRng(0.99));
    expect(sale).toBeNull();
  });

  it('rolls an armor with a potency + optional resilient', () => {
    const offering = { runeService: true, targets: ['armor'], maxLevel: 20 };
    const sale = rollRuneSaleItem(offering, items, runes, constRng(0.99));
    expect(sale.ref).toBe('leather');
    expect(sale.runes.potency).toBeGreaterThanOrEqual(1);
    const base = catalogMap.get('leather');
    const property = (sale.runes.property || []).map((id) => runeMap.get(id));
    expect(sale.fullPrice).toBe(resolveArmor({ name: base.name, price: base.price }, { ...sale.runes, property }).price);
  });

  it('rolls a power ring at a grade fitting the window with up to ringSockets runes', () => {
    // maxLevel 11 admits both grades and the ring rune (level 13 > 11 ⇒ NOT admitted).
    const offering = { runeService: true, targets: ['ring'], maxLevel: 11 };
    // ring rune is level 13, above cap ⇒ no admitted ring rune ⇒ inadmissible.
    expect(rollRuneSaleItem(offering, items, runes, constRng(0))).toBeNull();

    const wide = { runeService: true, targets: ['ring'], maxLevel: 15 };
    const sale = rollRuneSaleItem(wide, items, runes, constRng(0.99));
    expect(sale.ref).toBe('power-ring');
    expect([5, 11]).toContain(sale.level);
    // fullPrice = grade price + summed ring-rune prices
    const grade = powerRing.variants.find((v) => v.level === sale.level);
    const summed = (sale.runes.property || []).reduce((s, id) => s + runeMap.get(id).price, 0);
    expect(sale.fullPrice).toBe(grade.price + summed);
  });

  it('rolls an accessory host + exactly one rune it accepts', () => {
    const offering = { runeService: true, targets: ['accessory'], maxLevel: 20 };
    const sale = rollRuneSaleItem(offering, items, runes, constRng(0));
    expect(sale.ref).toBe('cloak');
    expect(sale.runes.accessory).toBe('presentable');
    expect(sale.fullPrice).toBe(cloak.price + accessoryRune.price);
  });
});

describe('rollScrollPack', () => {
  const scrollOffering = { spellItem: 'scroll', maxLevel: 19 };

  it('rolls 4 same-rank scrolls at exactly 3/4 price', () => {
    const pack = rollScrollPack(scrollOffering, spells, constRng(0));
    expect(pack.sale).toBe('scrollpack');
    expect(pack.scrolls).toHaveLength(4);
    const rankPrice = SCROLL_BY_RANK[pack.rank].price;
    expect(pack.fullPrice).toBe(4 * rankPrice);
    expect(pack.price).toBe(3 * rankPrice);
    // every scroll fires at the picked rank's spells
    pack.scrolls.forEach((s) => expect(typeof s.spellRef).toBe('string'));
  });

  it('allows duplicate spells in a pack', () => {
    // constRng(0) always picks pool[0] ⇒ four copies of the same spell.
    const pack = rollScrollPack(scrollOffering, spells, constRng(0));
    const refs = new Set(pack.scrolls.map((s) => s.spellRef));
    expect(refs.size).toBe(1);
  });

  it('can land on the rank-3 group and price it there', () => {
    // ranks present are [1, 3]; steer the rank pick to index 1.
    const pack = rollScrollPack(scrollOffering, spells, scriptRng([0.99, 0]));
    expect(pack.rank).toBe(3);
    expect(pack.scrolls.every((s) => s.spellRef === 'fireball')).toBe(true);
  });

  it('returns null for a wand offering', () => {
    expect(rollScrollPack({ spellItem: 'wand', maxLevel: 19 }, spells, constRng(0))).toBeNull();
  });

  it('returns null when the window covers no spells', () => {
    expect(rollScrollPack({ spellItem: 'scroll', maxLevel: 1, traditions: ['arcane'] }, spells, constRng(0))).toBeNull();
  });
});

describe('rollSaleShelf', () => {
  it('rolls saleCount rune items + salePacks packs with fresh saleIds', () => {
    const entry = {
      wares: [
        { runeService: true, targets: ['weapon'], maxLevel: 20, saleCount: 2, saleDiscount: 0.25 },
        { spellItem: 'scroll', maxLevel: 19, salePacks: 3 },
      ],
    };
    const shelf = rollSaleShelf(entry, items, runes, spells, scriptRng([0.1, 0.4, 0.7, 0.2, 0.9, 0.55]));
    const runeItems = shelf.filter((w) => w.sale === 'rune');
    const packs = shelf.filter((w) => w.sale === 'scrollpack');
    expect(runeItems).toHaveLength(2);
    expect(packs).toHaveLength(3);
    const ids = shelf.map((w) => w.saleId);
    expect(new Set(ids).size).toBe(ids.length); // all distinct
    runeItems.forEach((w) => expect(w.price).toBe(Math.round(w.fullPrice * 0.75)));
  });

  it('rolls no packs for a wand-only spellcasting shop', () => {
    const entry = { wares: [{ spellItem: 'wand', maxLevel: 19, salePacks: 4 }] };
    expect(rollSaleShelf(entry, items, runes, spells, constRng(0))).toEqual([]);
  });

  it('is empty when nothing is configured', () => {
    const entry = { wares: [{ runeService: true, targets: ['weapon'], maxLevel: 20 }] };
    expect(rollSaleShelf(entry, items, runes, spells, constRng(0))).toEqual([]);
  });
});

describe('resolveSaleWares', () => {
  const shops = {
    smithy: {
      saleShelf: [
        { sale: 'rune', saleId: 'w1', ref: 'longsword', runes: { potency: 1, striking: 'striking', property: ['flaming'] }, fullPrice: 1000, price: 800 },
        { sale: 'rune', saleId: 'r1', ref: 'power-ring', level: 5, runes: { property: ['spellstoring'] }, fullPrice: 2825, price: 2260 },
        { sale: 'rune', saleId: 'a1', ref: 'cloak', runes: { accessory: 'presentable' }, fullPrice: 9, price: 7 },
        { sale: 'scrollpack', saleId: 'p1', rank: 1, scrolls: [{ spellRef: 'heal' }, { spellRef: 'heal' }, { spellRef: 'bless' }, { spellRef: 'heal' }], fullPrice: 16, price: 12 },
      ],
    },
  };
  const runeMapFull = new Map([...runeMap, ['spellstoring', ringRune]]);

  it('resolves a runed weapon with a derived name, discounted price + strike-through', () => {
    const out = resolveSaleWares('smithy', shops, catalogMap, runeMapFull, spells);
    const wpn = out.find((w) => w.ref === 'longsword');
    expect(wpn.name).toBe('+1 Striking Flaming Longsword');
    expect(wpn.price).toBe(800);
    expect(wpn.saleFullPrice).toBe(1000);
    expect(wpn.stock).toBe(1);
    expect(wpn.id).toBe('sale-w1');
    expect(wpn.wareKey).toBe('sale:w1');
    expect(wpn.sale).toBe('rune');
    expect(wpn.runes).toEqual({ potency: 1, striking: 'striking', property: ['flaming'] });
  });

  it('resolves a power ring to its rune-prefixed graded name and drops the variants array', () => {
    const out = resolveSaleWares('smithy', shops, catalogMap, runeMapFull, spells);
    const ring = out.find((w) => w.ref === 'power-ring');
    // Ring runes aren't in the graded name, so prefix them (#1138).
    expect(ring.name).toBe('Spellstoring Power Ring (Iron)');
    expect(ring.variants).toBeUndefined();
    expect(ring.price).toBe(2260);
  });

  it('leaves a runeless power ring at its bare graded name', () => {
    const bare = { s: { saleShelf: [{ sale: 'rune', saleId: 'r0', ref: 'power-ring', level: 5, runes: {}, fullPrice: 125, price: 100 }] } };
    const ring = resolveSaleWares('s', bare, catalogMap, runeMapFull, spells)[0];
    expect(ring.name).toBe('Power Ring (Iron)');
  });

  it('resolves an accessory to the rune-prefixed host name', () => {
    const out = resolveSaleWares('smithy', shops, catalogMap, runeMapFull, spells);
    const acc = out.find((w) => w.ref === 'cloak');
    expect(acc.name).toBe('Presentable Cloak');
  });

  it('resolves a scroll pack with a contents description and carried scrolls', () => {
    const out = resolveSaleWares('smithy', shops, catalogMap, runeMapFull, spells);
    const pack = out.find((w) => w.sale === 'scrollpack');
    expect(pack.name).toBe('Scroll Pack (Rank 1)');
    expect(pack.description).toBe('A pack of four scrolls: Heal, Heal, Bless, Heal.');
    expect(pack.scrolls).toHaveLength(4);
    expect(pack.stock).toBe(1);
    expect(pack.id).toBe('sale-p1');
  });

  it('groups each sale ware as its own single-form entry (distinct ids)', () => {
    const out = resolveSaleWares('smithy', shops, catalogMap, runeMapFull, spells);
    const groups = groupWares(out);
    expect(groups).toHaveLength(4);
    groups.forEach((g) => expect(g.formCount).toBe(1));
  });

  it('drops a sale ware whose base ref no longer resolves', () => {
    const stale = { s: { saleShelf: [{ sale: 'rune', saleId: 'x', ref: 'ghost-item', runes: {}, fullPrice: 1, price: 1 }] } };
    expect(resolveSaleWares('s', stale, catalogMap, runeMapFull, spells)).toEqual([]);
  });

  it('drops a sale ware for a now-excluded base item', () => {
    const stale = { s: { saleShelf: [{ sale: 'rune', saleId: 'x', ref: 'cursed-blade', runes: { potency: 1 }, fullPrice: 1, price: 1 }] } };
    expect(resolveSaleWares('s', stale, catalogMap, runeMapFull, spells)).toEqual([]);
  });

  it('returns [] for a shop with no shelf', () => {
    expect(resolveSaleWares('none', shops, catalogMap, runeMapFull, spells)).toEqual([]);
  });
});

describe('buildRuneSaleItem', () => {
  it('bakes a weapon from an explicit base + runes, priced like the roll, at the discount, keeping saleId', () => {
    const offering = { runeService: true, targets: ['weapon'], maxLevel: 20, saleDiscount: 0.2 };
    const ware = buildRuneSaleItem(
      offering, 'W1', { ref: 'longsword', runes: { potency: 2, striking: 'striking', property: ['flaming'] } }, items, runes
    );
    expect(ware.saleId).toBe('W1');
    expect(ware.ref).toBe('longsword');
    expect(ware.runes).toEqual({ potency: 2, striking: 'striking', property: ['flaming'] });
    expect(ware.fullPrice).toBe(weaponPrice(ware));
    expect(ware.price).toBe(Math.round(ware.fullPrice * 0.8));
  });

  it('drops a property rune the window does not admit', () => {
    const offering = { runeService: true, targets: ['weapon'], maxLevel: 20 };
    const ware = buildRuneSaleItem(offering, 'W', { ref: 'longsword', runes: { potency: 1, property: ['nope'] } }, items, runes);
    expect(ware.runes.property).toBeUndefined();
  });

  it('bakes a ring at a chosen grade + property, priced grade + rune', () => {
    const offering = { runeService: true, targets: ['ring'], maxLevel: 15 };
    const ware = buildRuneSaleItem(offering, 'R', { ref: 'power-ring', level: 5, runes: { property: ['spellstoring'] } }, items, runes);
    expect(ware.level).toBe(5);
    expect(ware.runes.property).toEqual(['spellstoring']);
    const grade = powerRing.variants.find((v) => v.level === 5);
    expect(ware.fullPrice).toBe(grade.price + ringRune.price);
  });

  it('bakes an accessory host + one accepted rune', () => {
    const offering = { runeService: true, targets: ['accessory'], maxLevel: 20 };
    const ware = buildRuneSaleItem(offering, 'A', { ref: 'cloak', runes: { accessory: 'presentable' } }, items, runes);
    expect(ware.runes).toEqual({ accessory: 'presentable' });
    expect(ware.fullPrice).toBe(cloak.price + accessoryRune.price);
  });

  it('returns null for a missing / excluded base, or an accessory rune the host rejects', () => {
    const offering = { runeService: true, targets: ['weapon', 'accessory'], maxLevel: 20 };
    expect(buildRuneSaleItem(offering, 'X', { ref: 'ghost', runes: {} }, items, runes)).toBeNull();
    expect(buildRuneSaleItem(offering, 'X', { ref: 'cursed-blade', runes: { potency: 1 } }, items, runes)).toBeNull();
    expect(buildRuneSaleItem(offering, 'X', { ref: 'cloak', runes: { accessory: 'flaming' } }, items, runes)).toBeNull();
  });
});

describe('buildScrollPackWare', () => {
  const scrollOffering = { spellItem: 'scroll', maxLevel: 19 };

  it('bakes a pack from an explicit rank + spells, padded to 4, at 3/4 price, keeping saleId', () => {
    const ware = buildScrollPackWare(scrollOffering, 'P', { rank: 1, scrolls: ['heal', 'bless'] }, spells);
    expect(ware.saleId).toBe('P');
    expect(ware.rank).toBe(1);
    expect(ware.scrolls).toHaveLength(4);
    expect(ware.scrolls[0].spellRef).toBe('heal');
    expect(ware.scrolls[1].spellRef).toBe('bless');
    ware.scrolls.forEach((s) => expect(['heal', 'bless']).toContain(s.spellRef));
    const rankPrice = SCROLL_BY_RANK[1].price;
    expect(ware.fullPrice).toBe(4 * rankPrice);
    expect(ware.price).toBe(3 * rankPrice);
  });

  it('returns null for a wand offering or an unavailable rank', () => {
    expect(buildScrollPackWare({ spellItem: 'wand', maxLevel: 19 }, 'P', { rank: 1, scrolls: ['heal'] }, spells)).toBeNull();
    expect(buildScrollPackWare(scrollOffering, 'P', { rank: 99, scrolls: [] }, spells)).toBeNull();
  });
});

describe('rerollSaleItem', () => {
  const entry = {
    wares: [
      { runeService: true, targets: ['weapon'], maxLevel: 20 },
      { spellItem: 'scroll', maxLevel: 19 },
    ],
    saleShelf: [
      { sale: 'rune', saleId: 'w1', ref: 'longsword', runes: { potency: 1 }, fullPrice: 100, price: 100 },
      { sale: 'scrollpack', saleId: 'p1', rank: 1, scrolls: [{ spellRef: 'heal' }], fullPrice: 16, price: 12 },
    ],
  };

  it('replaces only the targeted slot, preserving its saleId + position, leaving others untouched', () => {
    const next = rerollSaleItem(entry, 'w1', items, runes, spells, constRng(0.99));
    expect(next).toHaveLength(2);
    expect(next[0].saleId).toBe('w1');
    expect(next[0].sale).toBe('rune');
    expect(next[0]).not.toBe(entry.saleShelf[0]); // freshly rolled
    expect(next[1]).toBe(entry.saleShelf[1]); // scroll slot identical reference
  });

  it('rerolls a scroll pack from the scroll offering', () => {
    const next = rerollSaleItem(entry, 'p1', items, runes, spells, constRng(0));
    expect(next[1].saleId).toBe('p1');
    expect(next[1].sale).toBe('scrollpack');
    expect(next[1].scrolls).toHaveLength(4);
  });

  it('returns the shelf unchanged when the saleId is absent', () => {
    expect(rerollSaleItem(entry, 'nope', items, runes, spells)).toBe(entry.saleShelf);
  });
});

describe('saleRuneEditOptions', () => {
  it('lists per-target hosts, fundamentals + property runes, and per-host accessory runes', () => {
    const offering = { runeService: true, targets: ['weapon', 'accessory'], maxLevel: 20 };
    const opts = saleRuneEditOptions(offering, items, runes);
    expect(Object.keys(opts).sort()).toEqual(['accessory', 'weapon']);
    expect(opts.weapon.hosts.map((h) => h.id)).toContain('longsword');
    expect(opts.weapon.potency.length).toBeGreaterThan(0);
    expect(opts.weapon.properties.map((p) => p.id)).toEqual(expect.arrayContaining(['flaming', 'frost']));
    const cloakOpt = opts.accessory.hosts.find((h) => h.id === 'cloak');
    expect(cloakOpt.runes.map((r) => r.id)).toContain('presentable');
  });

  it('omits a target that cannot produce an item (no host / no fundamental fits)', () => {
    const offering = { runeService: true, targets: ['weapon'], maxLevel: 1 };
    expect(saleRuneEditOptions(offering, [longsword], [weaponRuneLow])).toEqual({});
  });
});

describe('saleScrollPackOptions', () => {
  it('groups eligible spells by rank, rank-ascending', () => {
    const opts = saleScrollPackOptions({ spellItem: 'scroll', maxLevel: 19 }, spells);
    expect(opts.map((o) => o.rank)).toEqual([1, 3]);
    expect(opts.find((o) => o.rank === 1).spells.map((s) => s.id).sort()).toEqual(['bless', 'heal']);
    expect(opts.find((o) => o.rank === 3).spells.map((s) => s.id)).toEqual(['fireball']);
  });

  it('is empty for a wand offering', () => {
    expect(saleScrollPackOptions({ spellItem: 'wand', maxLevel: 19 }, spells)).toEqual([]);
  });
});
