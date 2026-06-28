import {
  isShop,
  isSetUp,
  isShopRevealed,
  isShopOpen,
  shopOffersSpellcasting,
  shopOffersRunes,
  getShopsForLocation,
  resolveShopWares,
  isSpellItemWare,
  spellItemOfferings,
  eligibleSpellItems,
  spellOfferingSummary,
  groupWares,
  traitAccent,
} from './shopUtils';

// Lore: Sandpoint (root) contains two shops + one plain location.
const entries = [
  { id: 'sandpoint', title: 'Sandpoint', category: 'Location' },
  { id: 'bottled-solutions', title: 'Bottled Solutions', category: 'Location', parent: 'sandpoint' },
  { id: 'curious-goblin', title: 'The Curious Goblin', category: 'Location', parent: 'sandpoint' },
  { id: 'town-hall', title: 'Town Hall', category: 'Location', parent: 'sandpoint' },
];

const shops = {
  'bottled-solutions': { wares: [{ ref: 'healing-potion' }, { ref: 'antidote', price: 8 }] },
  'curious-goblin': { wares: [{ ref: 'spellbook' }] },
  'empty-shop': { wares: [] },
};

// A multi-level item: variants carry their own name/price (#797 shape).
const potionLadder = {
  id: 'tonic',
  name: 'Tonic',
  weight: 0.1,
  variants: [
    { level: 1, label: 'Minor', name: 'Minor Tonic', price: 4 },
    { level: 3, label: 'Lesser', name: 'Lesser Tonic', price: 12 },
  ],
};

const catalogMap = new Map([
  ['healing-potion', { id: 'healing-potion', name: 'Healing Potion', price: 12, weight: 0 }],
  ['antidote', { id: 'antidote', name: 'Antidote', price: 3, weight: 0 }],
  ['spellbook', { id: 'spellbook', name: 'Spellbook', price: 10, weight: 1 }],
  ['tonic', potionLadder],
]);

const runeMap = new Map([
  ['flaming', { id: 'flaming', name: 'Flaming', level: 8, price: 500, traits: ['Fire', 'Magical'] }],
]);

describe('isShop', () => {
  it('is true for a lore id with ≥1 ware', () => {
    expect(isShop('bottled-solutions', shops)).toBe(true);
  });

  it('is false for an entry with an empty wares list', () => {
    expect(isShop('empty-shop', shops)).toBe(false);
  });

  it('is false for an id absent from the store', () => {
    expect(isShop('town-hall', shops)).toBe(false);
  });

  it('is false for missing args', () => {
    expect(isShop(null, shops)).toBe(false);
    expect(isShop('bottled-solutions', null)).toBe(false);
  });
});

describe('isSetUp', () => {
  it('is true for any present entry, even one with no wares', () => {
    expect(isSetUp('bottled-solutions', shops)).toBe(true);
    expect(isSetUp('empty-shop', shops)).toBe(true);
  });

  it('is false for an id absent from the store or missing args', () => {
    expect(isSetUp('town-hall', shops)).toBe(false);
    expect(isSetUp(null, shops)).toBe(false);
    expect(isSetUp('bottled-solutions', null)).toBe(false);
  });
});

describe('isShopRevealed', () => {
  it('defaults a legacy entry (no revealed field) to visible', () => {
    expect(isShopRevealed('bottled-solutions', shops)).toBe(true);
  });

  it('honors an explicit revealed flag', () => {
    const s = { hidden: { revealed: false, wares: [] }, shown: { revealed: true, wares: [] } };
    expect(isShopRevealed('hidden', s)).toBe(false);
    expect(isShopRevealed('shown', s)).toBe(true);
  });

  it('is false for an absent entry or missing args', () => {
    expect(isShopRevealed('town-hall', shops)).toBe(false);
    expect(isShopRevealed(null, shops)).toBe(false);
    expect(isShopRevealed('bottled-solutions', null)).toBe(false);
  });
});

describe('isShopOpen', () => {
  it('defaults a legacy entry (no open field) to open', () => {
    expect(isShopOpen('bottled-solutions', shops)).toBe(true);
  });

  it('honors an explicit open flag', () => {
    const s = { closed: { open: false, wares: [] }, trading: { open: true, wares: [] } };
    expect(isShopOpen('closed', s)).toBe(false);
    expect(isShopOpen('trading', s)).toBe(true);
  });

  it('is false for an absent entry or missing args', () => {
    expect(isShopOpen('town-hall', shops)).toBe(false);
    expect(isShopOpen(null, shops)).toBe(false);
    expect(isShopOpen('bottled-solutions', null)).toBe(false);
  });
});

describe('shopOffersSpellcasting (#857 S1)', () => {
  it('honors an explicit flag in either direction', () => {
    const s = {
      on: { offersSpellcasting: true, wares: [] },
      off: { offersSpellcasting: false, wares: [{ spellItem: 'scroll', maxRank: 3 }] },
    };
    expect(shopOffersSpellcasting('on', s)).toBe(true);
    expect(shopOffersSpellcasting('off', s)).toBe(false); // explicit false beats a stocked offering
  });

  it('derives from a stocked spell-item offering when no flag is set', () => {
    const s = {
      arcana: { wares: [{ ref: 'antidote' }, { spellItem: 'wand', maxRank: 5 }] },
      plain: { wares: [{ ref: 'antidote' }] },
    };
    expect(shopOffersSpellcasting('arcana', s)).toBe(true);
    expect(shopOffersSpellcasting('plain', s)).toBe(false);
  });

  it('is false for an absent entry or missing args', () => {
    expect(shopOffersSpellcasting('town-hall', shops)).toBe(false);
    expect(shopOffersSpellcasting(null, shops)).toBe(false);
    expect(shopOffersSpellcasting('bottled-solutions', null)).toBe(false);
  });
});

describe('shopOffersRunes (#857 S1)', () => {
  it('honors an explicit flag in either direction', () => {
    const s = {
      on: { offersRunes: true, wares: [] },
      off: { offersRunes: false, wares: [{ ref: 'runestone', runeRef: 'flaming' }] },
    };
    expect(shopOffersRunes('on', s)).toBe(true);
    expect(shopOffersRunes('off', s)).toBe(false); // explicit false beats a stocked runestone
  });

  it('derives from a stocked Runestone ware when no flag is set', () => {
    const s = {
      smith: { wares: [{ ref: 'antidote' }, { ref: 'runestone', runeRef: 'flaming' }] },
      plain: { wares: [{ ref: 'antidote' }] },
    };
    expect(shopOffersRunes('smith', s)).toBe(true);
    expect(shopOffersRunes('plain', s)).toBe(false);
  });

  it('is false for an absent entry or missing args', () => {
    expect(shopOffersRunes('town-hall', shops)).toBe(false);
    expect(shopOffersRunes(null, shops)).toBe(false);
    expect(shopOffersRunes('bottled-solutions', null)).toBe(false);
  });
});

describe('getShopsForLocation', () => {
  it('returns the shop children of a location, title-sorted', () => {
    const result = getShopsForLocation('sandpoint', entries, shops);
    expect(result.map((e) => e.id)).toEqual(['bottled-solutions', 'curious-goblin']);
  });

  it('excludes non-shop children (Town Hall)', () => {
    const ids = getShopsForLocation('sandpoint', entries, shops).map((e) => e.id);
    expect(ids).not.toContain('town-hall');
  });

  it('returns [] when the location has no children', () => {
    expect(getShopsForLocation('bottled-solutions', entries, shops)).toEqual([]);
  });

  it('returns [] for missing args', () => {
    expect(getShopsForLocation(null, entries, shops)).toEqual([]);
    expect(getShopsForLocation('sandpoint', entries, null)).toEqual([]);
  });

  it('hides a revealed:false child but keeps legacy and revealed:true ones (#822)', () => {
    const withReveal = {
      'bottled-solutions': { revealed: false, wares: [{ ref: 'antidote' }] },     // explicitly hidden
      'curious-goblin': { revealed: true, wares: [{ ref: 'spellbook' }] },         // shown
      // town-hall: legacy (no revealed) shop — stays visible
      'town-hall': { wares: [{ ref: 'gavel' }] },
    };
    const ids = getShopsForLocation('sandpoint', entries, withReveal).map((e) => e.id);
    expect(ids).toEqual(['curious-goblin', 'town-hall']);
  });

  it('still lists a closed (but revealed) shop — closed is a trading state, not a hide', () => {
    const closed = { 'bottled-solutions': { open: false, wares: [{ ref: 'antidote' }] } };
    const ids = getShopsForLocation('sandpoint', entries, closed).map((e) => e.id);
    expect(ids).toContain('bottled-solutions');
  });
});

describe('resolveShopWares', () => {
  it('resolves each ware ref to its catalog item, stamping a wareKey', () => {
    const wares = resolveShopWares('curious-goblin', shops, catalogMap);
    expect(wares).toEqual([
      { id: 'spellbook', name: 'Spellbook', price: 10, weight: 1, wareKey: 'spellbook' },
    ]);
  });

  it('uses the catalog price when the ware sets no override', () => {
    const wares = resolveShopWares('bottled-solutions', shops, catalogMap);
    expect(wares[0]).toMatchObject({ id: 'healing-potion', price: 12 });
  });

  it('applies a ware price override', () => {
    const wares = resolveShopWares('bottled-solutions', shops, catalogMap);
    expect(wares[1]).toMatchObject({ id: 'antidote', price: 8 });
  });

  it('carries stock through when present', () => {
    const withStock = { s: { wares: [{ ref: 'antidote', stock: 4 }] } };
    expect(resolveShopWares('s', withStock, catalogMap)[0].stock).toBe(4);
  });

  it('drops wares whose ref is missing from the catalog', () => {
    const bad = { s: { wares: [{ ref: 'unknown-thing' }, { ref: 'antidote' }] } };
    const wares = resolveShopWares('s', bad, catalogMap);
    expect(wares.map((w) => w.id)).toEqual(['antidote']);
  });

  it('returns [] for an unknown shop or missing catalog', () => {
    expect(resolveShopWares('nope', shops, catalogMap)).toEqual([]);
    expect(resolveShopWares('curious-goblin', shops, null)).toEqual([]);
  });

  it('applies a pinned variant: merges name/price, drops the ladder, keys by ref@level', () => {
    const s = { s: { wares: [{ ref: 'tonic', level: 3 }] } };
    const [w] = resolveShopWares('s', s, catalogMap);
    expect(w).toMatchObject({ id: 'tonic', name: 'Lesser Tonic', price: 12, wareKey: 'tonic@3' });
    expect(w.variants).toBeUndefined();
  });

  it('stocks two variants of one item as distinct, non-colliding wares', () => {
    const s = { s: { wares: [{ ref: 'tonic', level: 1 }, { ref: 'tonic', level: 3 }] } };
    const wares = resolveShopWares('s', s, catalogMap);
    expect(wares.map((w) => w.wareKey)).toEqual(['tonic@1', 'tonic@3']);
    expect(wares.map((w) => w.name)).toEqual(['Minor Tonic', 'Lesser Tonic']);
    expect(wares.map((w) => w.price)).toEqual([4, 12]);
  });

  it('lets a ware price override the variant price', () => {
    const s = { s: { wares: [{ ref: 'tonic', level: 1, price: 2 }] } };
    expect(resolveShopWares('s', s, catalogMap)[0]).toMatchObject({ price: 2, name: 'Minor Tonic' });
  });

  it('leaves the base item intact for a level with no matching variant', () => {
    const s = { s: { wares: [{ ref: 'tonic', level: 99 }] } };
    const [w] = resolveShopWares('s', s, catalogMap);
    expect(w).toMatchObject({ id: 'tonic', name: 'Tonic', wareKey: 'tonic' });
    expect(Array.isArray(w.variants)).toBe(true);
  });

  it('coerces an unresolvable price (priceless base, no variant) to 0', () => {
    const map = new Map([['p', { id: 'p', name: 'P', variants: [{ level: 1, price: 5 }] }]]);
    const s = { s: { wares: [{ ref: 'p' }] } }; // no level → no variant → no price
    expect(resolveShopWares('s', s, map)[0].price).toBe(0);
  });

  it('resolves a runestone ware from the rune catalog (value = stone + rune) (#801)', () => {
    const s = { s: { wares: [{ ref: 'runestone', runeRef: 'flaming' }] } };
    const [w] = resolveShopWares('s', s, catalogMap, runeMap);
    expect(w).toMatchObject({ name: 'Flaming Runestone', price: 503, wareKey: 'runestone@flaming' });
    expect(w.runestone.rune.id).toBe('flaming');
    expect(w.strikes).toBeUndefined();
  });

  it('honors a price override and stock on a runestone ware', () => {
    const s = { s: { wares: [{ ref: 'runestone', runeRef: 'flaming', price: 400, stock: 2 }] } };
    expect(resolveShopWares('s', s, catalogMap, runeMap)[0]).toMatchObject({ price: 400, stock: 2 });
  });

  it('stocks two different rune runestones as distinct, non-colliding wares', () => {
    const map = new Map([
      ['flaming', { id: 'flaming', name: 'Flaming', price: 500 }],
      ['frost', { id: 'frost', name: 'Frost', price: 500 }],
    ]);
    const s = { s: { wares: [{ ref: 'runestone', runeRef: 'flaming' }, { ref: 'runestone', runeRef: 'frost' }] } };
    const wares = resolveShopWares('s', s, catalogMap, map);
    expect(wares.map((w) => w.wareKey)).toEqual(['runestone@flaming', 'runestone@frost']);
  });
});

// ── Generative spell-item offerings (#812 S6) ───────────────────────────────
const spellCatalog = [
  { id: 'sleep', name: 'Sleep', level: 1, traditions: ['arcane', 'occult'] },
  { id: 'heal', name: 'Heal', level: 1, traditions: ['divine', 'primal'] },
  { id: 'blazing-bolt', name: 'Blazing Bolt', level: 2, traditions: ['arcane', 'primal'] },
  { id: 'web', name: 'Web', level: 2, traditions: ['arcane'], traits: ['Uncommon'] },
  { id: 'wish', name: 'Wish', level: 10, traditions: ['arcane'] },
  { id: 'rare-thing', name: 'Rare Thing', level: 3, traditions: ['occult'], traits: ['Rare'] },
  { id: 'lay-on-hands', name: 'Lay on Hands', level: 1, traits: ['Focus'] }, // no traditions → focus
  { id: 'light', name: 'Light', level: 1, traditions: ['arcane', 'divine', 'occult', 'primal'], traits: ['Cantrip'] },
];

const keysOf = (list) => list.map((e) => e.wareKey).sort();

describe('isSpellItemWare', () => {
  it('detects scroll/wand offerings, not flat or runestone wares', () => {
    expect(isSpellItemWare({ spellItem: 'scroll', maxRank: 3 })).toBe(true);
    expect(isSpellItemWare({ spellItem: 'wand', maxRank: 5 })).toBe(true);
    expect(isSpellItemWare({ ref: 'healing-potion' })).toBe(false);
    expect(isSpellItemWare({ ref: 'runestone', runeRef: 'flaming' })).toBe(false);
    expect(isSpellItemWare(null)).toBe(false);
  });
});

describe('resolveShopWares ignores spell-item offerings', () => {
  it('keeps flat wares and drops the generative offering from the main list', () => {
    const s = { s: { wares: [{ ref: 'healing-potion' }, { spellItem: 'scroll', maxRank: 3 }] } };
    const wares = resolveShopWares('s', s, catalogMap);
    expect(wares).toHaveLength(1);
    expect(wares[0].id).toBe('healing-potion');
  });
});

describe('spellItemOfferings', () => {
  it('returns only spell-item wares, each with a stable offeringKey', () => {
    const s = { s: { wares: [
      { ref: 'healing-potion' },
      { spellItem: 'scroll', maxRank: 3 },
      { spellItem: 'wand', maxRank: 5, traditions: ['arcane'] },
    ] } };
    const offerings = spellItemOfferings('s', s);
    expect(offerings).toHaveLength(2);
    expect(offerings.map((o) => o.spellItem)).toEqual(['scroll', 'wand']);
    expect(new Set(offerings.map((o) => o.offeringKey)).size).toBe(2);
  });

  it('is empty for a missing shop or a shop with no offerings', () => {
    expect(spellItemOfferings('nope', {})).toEqual([]);
    expect(spellItemOfferings('s', { s: { wares: [{ ref: 'healing-potion' }] } })).toEqual([]);
  });
});

describe('eligibleSpellItems', () => {
  it('applies the rank cap and excludes uncommon/rare/focus/cantrips by default (common only)', () => {
    const out = eligibleSpellItems({ spellItem: 'scroll', maxRank: 3 }, spellCatalog);
    // sleep(1), heal(1), blazing-bolt(2) — all common; web=uncommon, rare-thing=rare,
    // wish=rank10>3, lay-on-hands=focus, light=cantrip are all excluded.
    expect(keysOf(out)).toEqual(['scroll:blazing-bolt', 'scroll:heal', 'scroll:sleep']);
  });

  it('filters by tradition (intersection); multi-tradition spells match on any', () => {
    const divine = eligibleSpellItems({ spellItem: 'scroll', maxRank: 3, traditions: ['divine'] }, spellCatalog);
    expect(keysOf(divine)).toEqual(['scroll:heal']);
    const primal = eligibleSpellItems({ spellItem: 'scroll', maxRank: 3, traditions: ['primal'] }, spellCatalog);
    // heal (divine/primal) + blazing-bolt (arcane/primal) both share primal.
    expect(keysOf(primal)).toEqual(['scroll:blazing-bolt', 'scroll:heal']);
  });

  it('opts into uncommon when rarities is set, stamping the rarity trait', () => {
    const out = eligibleSpellItems({ spellItem: 'scroll', maxRank: 3, rarities: ['common', 'uncommon'] }, spellCatalog);
    expect(keysOf(out)).toContain('scroll:web');
    const web = out.find((e) => e.wareKey === 'scroll:web');
    expect(web.traits[0]).toBe('Uncommon'); // rarity stamped onto the item
  });

  it('caps a wand at rank 9 but a scroll at rank 10 (table maxima)', () => {
    const scroll = eligibleSpellItems({ spellItem: 'scroll', maxRank: 10 }, spellCatalog);
    expect(keysOf(scroll)).toContain('scroll:wish'); // rank-10 scroll is valid
    const wand = eligibleSpellItems({ spellItem: 'wand', maxRank: 10 }, spellCatalog);
    expect(keysOf(wand)).not.toContain('wand:wish'); // rank-10 wand is impossible
  });

  it('produces a minimal, re-resolvable entry with derived name/level/price', () => {
    const [sleep] = eligibleSpellItems({ spellItem: 'scroll', maxRank: 1 }, spellCatalog);
    expect(sleep).toMatchObject({
      id: 'scroll-of-sleep',
      name: 'Scroll of Sleep',
      level: 1,
      price: 4,
      weight: 0.1,
      wareKey: 'scroll:sleep',
      scroll: { spellRef: 'sleep' },
    });
    expect(sleep.traits).toEqual(['Consumable', 'Magical', 'Scroll']);
  });

  it('derives wand pricing/level from the cast rank', () => {
    const [heal] = eligibleSpellItems({ spellItem: 'wand', maxRank: 1, traditions: ['divine'] }, spellCatalog);
    expect(heal).toMatchObject({ id: 'wand-of-heal', name: 'Wand of Heal', level: 3, price: 60, wand: { spellRef: 'heal' } });
  });

  it('applies priceMod as a multiplier over the standard price', () => {
    const [sleep] = eligibleSpellItems({ spellItem: 'scroll', maxRank: 1, priceMod: 2 }, spellCatalog);
    expect(sleep.price).toBe(8); // 4 × 2
  });

  it('returns [] for a non-offering ware or a zero/negative cap', () => {
    expect(eligibleSpellItems({ ref: 'healing-potion' }, spellCatalog)).toEqual([]);
    expect(eligibleSpellItems({ spellItem: 'scroll', maxRank: 0 }, spellCatalog)).toEqual([]);
  });
});

describe('spellOfferingSummary', () => {
  it('summarises the default (all traditions, common only) coverage + count', () => {
    const s = spellOfferingSummary({ spellItem: 'scroll', maxRank: 3 }, spellCatalog);
    // sleep, heal, blazing-bolt (web is uncommon; rare-thing rare; wish out of rank).
    expect(s).toMatchObject({ kind: 'scroll', cap: 3, count: 3 });
    expect(s.text).toBe('Scrolls · all traditions · common · up to rank 3 · 3 eligible spells');
  });

  it('reflects tradition + rarity filters and singularises one spell', () => {
    const s = spellOfferingSummary(
      { spellItem: 'wand', maxRank: 2, traditions: ['arcane'], rarities: ['common', 'uncommon'] },
      spellCatalog
    );
    // arcane, common+uncommon, rank ≤ 2: sleep, blazing-bolt, web.
    expect(s.text).toBe('Wands · arcane · common+uncommon · up to rank 2 · 3 eligible spells');
  });

  it('caps the displayed rank at the base-template max', () => {
    expect(spellOfferingSummary({ spellItem: 'wand', maxRank: 99 }, spellCatalog).cap).toBe(9);
  });
});

// ── Player browse grouping (#857 S2) ────────────────────────────────────────
describe('groupWares', () => {
  it('collapses variants of one item into a single cheapest-first group', () => {
    const wares = resolveShopWares(
      's',
      { s: { wares: [{ ref: 'tonic', level: 3 }, { ref: 'tonic', level: 1 }] } },
      catalogMap
    );
    const groups = groupWares(wares);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ ref: 'tonic', name: 'Minor Tonic', from: 4, formCount: 2 });
    expect(groups[0].forms.map((f) => f.wareKey)).toEqual(['tonic@1', 'tonic@3']); // cheapest-first
    expect(groups[0].forms.map((f) => f.price)).toEqual([4, 12]);
  });

  it('keeps a single-variant item as a one-form group', () => {
    const groups = groupWares(resolveShopWares('curious-goblin', shops, catalogMap));
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ ref: 'spellbook', name: 'Spellbook', from: 10, formCount: 1 });
  });

  it('preserves first-appearance group order across distinct items', () => {
    const groups = groupWares(resolveShopWares('bottled-solutions', shops, catalogMap));
    expect(groups.map((g) => g.ref)).toEqual(['healing-potion', 'antidote']);
  });

  it('does NOT merge distinct runestones (each rune is its own group)', () => {
    const runes = new Map([
      ['flaming', { id: 'flaming', name: 'Flaming', price: 500 }],
      ['frost', { id: 'frost', name: 'Frost', price: 400 }],
    ]);
    const s = { s: { wares: [
      { ref: 'runestone', runeRef: 'flaming' },
      { ref: 'runestone', runeRef: 'frost' },
    ] } };
    const groups = groupWares(resolveShopWares('s', s, catalogMap, runes));
    expect(groups.map((g) => g.ref)).toEqual(['runestone-flaming', 'runestone-frost']); // first-appearance order
    expect(groups.every((g) => g.formCount === 1)).toBe(true);
  });

  it('carries traits/description from the cheapest form and keeps form wareKeys', () => {
    const map = new Map([
      ['p', { id: 'p', name: 'P', description: 'desc', traits: ['Magical'],
        variants: [{ level: 1, price: 9 }, { level: 2, price: 3 }] }],
    ]);
    const groups = groupWares(resolveShopWares('s', { s: { wares: [
      { ref: 'p', level: 1 }, { ref: 'p', level: 2 },
    ] } }, map));
    expect(groups[0]).toMatchObject({ traits: ['Magical'], description: 'desc', from: 3 });
    expect(groups[0].forms.map((f) => f.wareKey)).toEqual(['p@2', 'p@1']);
  });

  it('ignores idless entries and non-array input', () => {
    expect(groupWares([{ name: 'no id' }, null])).toEqual([]);
    expect(groupWares(null)).toEqual([]);
  });
});

describe('traitAccent', () => {
  it('maps Scroll/Wand/Magical to arcane', () => {
    expect(traitAccent({ traits: ['Scroll', 'Consumable'] })).toBe('arcane');
    expect(traitAccent({ traits: ['Wand'] })).toBe('arcane');
    expect(traitAccent({ traits: ['Magical'] })).toBe('arcane');
  });

  it('maps Healing and Alchemical to verdant', () => {
    expect(traitAccent({ traits: ['Healing'] })).toBe('verdant');
    expect(traitAccent({ traits: ['Alchemical'] })).toBe('verdant');
  });

  it('maps Weapon/Armor/Shield to iron', () => {
    expect(traitAccent({ traits: ['Weapon'] })).toBe('iron');
    expect(traitAccent({ traits: ['Armor'] })).toBe('iron');
    expect(traitAccent({ traits: ['Shield'] })).toBe('iron');
  });

  it('honors precedence: Magical beats Healing; Weapon beats Alchemical; Healing beats iron', () => {
    expect(traitAccent({ traits: ['Healing', 'Magical'] })).toBe('arcane');
    expect(traitAccent({ traits: ['Weapon', 'Alchemical'] })).toBe('iron');
    expect(traitAccent({ traits: ['Healing', 'Armor'] })).toBe('verdant');
  });

  it('falls back to gold for anything else or missing traits', () => {
    expect(traitAccent({ traits: ['Adventuring Gear'] })).toBe('gold');
    expect(traitAccent({})).toBe('gold');
    expect(traitAccent(null)).toBe('gold');
  });
});
