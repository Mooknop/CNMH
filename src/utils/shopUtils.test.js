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
  offeredSpellIds,
  eligibleCatalysts,
  isRuneServiceWare,
  runeRarity,
  runeOfferings,
  eligibleRunes,
  runeOfferingSummary,
  eligibleHostItems,
  eligibleTalismans,
  isShopExcluded,
  isDragonbreathWare,
  shopHostKind,
  RUNE_TARGETS,
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
  // A GM-flagged "never sell" item (#1105) — must be dropped even from an
  // explicit ware.
  ['cursed-idol', { id: 'cursed-idol', name: 'Cursed Idol', price: 50, weight: 0, noShop: true }],
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
      off: { offersSpellcasting: false, wares: [{ spellItem: 'scroll', maxLevel: 3 }] },
    };
    expect(shopOffersSpellcasting('on', s)).toBe(true);
    expect(shopOffersSpellcasting('off', s)).toBe(false); // explicit false beats a stocked offering
  });

  it('derives from a stocked spell-item offering when no flag is set', () => {
    const s = {
      arcana: { wares: [{ ref: 'antidote' }, { spellItem: 'wand', maxLevel: 5 }] },
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

  it('derives from a generative rune-service offering (#982 G1)', () => {
    const s = { smith: { wares: [{ runeService: true, targets: ['weapon'], maxLevel: 10 }] } };
    expect(shopOffersRunes('smith', s)).toBe(true);
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
  it('resolves each ware ref to its catalog item, stamping a wareKey and baseName', () => {
    const wares = resolveShopWares('curious-goblin', shops, catalogMap);
    expect(wares).toEqual([
      { id: 'spellbook', name: 'Spellbook', baseName: 'Spellbook', price: 10, weight: 1, wareKey: 'spellbook' },
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

describe('isShopExcluded (#1105)', () => {
  it('is true only for an item with a truthy noShop flag', () => {
    expect(isShopExcluded({ id: 'x', noShop: true })).toBe(true);
    expect(isShopExcluded({ id: 'x' })).toBe(false);
    expect(isShopExcluded({ id: 'x', noShop: false })).toBe(false);
    expect(isShopExcluded(null)).toBe(false);
    expect(isShopExcluded(undefined)).toBe(false);
  });
});

describe('resolveShopWares drops GM-excluded items (#1105)', () => {
  it('never resolves a noShop item, even when explicitly stocked', () => {
    const s = { s: { wares: [{ ref: 'cursed-idol' }, { ref: 'spellbook' }] } };
    expect(resolveShopWares('s', s, catalogMap).map((w) => w.id)).toEqual(['spellbook']);
  });
});

describe('isSpellItemWare', () => {
  it('detects scroll/wand offerings, not flat or runestone wares', () => {
    expect(isSpellItemWare({ spellItem: 'scroll', maxLevel: 3 })).toBe(true);
    expect(isSpellItemWare({ spellItem: 'wand', maxLevel: 5 })).toBe(true);
    expect(isSpellItemWare({ ref: 'healing-potion' })).toBe(false);
    expect(isSpellItemWare({ ref: 'runestone', runeRef: 'flaming' })).toBe(false);
    expect(isSpellItemWare(null)).toBe(false);
  });
});

describe('resolveShopWares ignores spell-item offerings', () => {
  it('keeps flat wares and drops the generative offering from the main list', () => {
    const s = { s: { wares: [{ ref: 'healing-potion' }, { spellItem: 'scroll', maxLevel: 3 }] } };
    const wares = resolveShopWares('s', s, catalogMap);
    expect(wares).toHaveLength(1);
    expect(wares[0].id).toBe('healing-potion');
  });
});

describe('spellItemOfferings', () => {
  it('returns only spell-item wares, each with a stable offeringKey', () => {
    const s = { s: { wares: [
      { ref: 'healing-potion' },
      { spellItem: 'scroll', maxLevel: 3 },
      { spellItem: 'wand', maxLevel: 5, traditions: ['arcane'] },
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

// ── Auto-stocked catalysts (Magic+ arsenal M3c, #1209) ──────────────────────
describe('offeredSpellIds (#1209 M3c)', () => {
  const shop = { s: { wares: [{ spellItem: 'scroll', maxLevel: 3 }] } };

  it("collects the spell ids a shop's scroll/wand offerings cover", () => {
    const ids = offeredSpellIds('s', shop, spellCatalog, catalogMap);
    expect(ids.has('heal')).toBe(true);
    expect(ids.has('sleep')).toBe(true);
    expect(ids.has('wish')).toBe(false); // rank 10, above the maxLevel-3 envelope
    expect(ids.has('web')).toBe(false); // uncommon, not offered by a common scroll
  });

  it('is empty for a shop with no spell-item offerings', () => {
    const plain = { x: { wares: [{ ref: 'antidote' }] } };
    expect(offeredSpellIds('x', plain, spellCatalog, catalogMap).size).toBe(0);
  });
});

describe('eligibleCatalysts (#1209 M3c)', () => {
  const catalysts = [
    { id: 'healers-gel', name: "Healer's Gel", price: 25, traits: ['Catalyst', 'Consumable', 'Magical'], catalyst: { catalystFor: 'heal', effect: 'temp HP' } },
    { id: 'wish-cat', name: 'Wish Catalyst', price: 9, traits: ['Catalyst'], catalyst: { catalystFor: 'wish', effect: 'x' } },
    { id: 'secret-gel', name: 'Secret Gel', price: 5, noShop: true, catalyst: { catalystFor: 'heal', effect: 'x' } },
    { id: 'rope', name: 'Rope', traits: ['Adventuring Gear'] },
  ];
  const shop = { s: { wares: [{ spellItem: 'scroll', maxLevel: 3 }] } };

  it('auto-stocks catalysts whose spell is in the shop envelope, as resolved wares', () => {
    const out = eligibleCatalysts('s', shop, spellCatalog, catalysts, catalogMap);
    expect(out.map((w) => w.id)).toEqual(['healers-gel']);
    expect(out[0].wareKey).toBe('catalyst:healers-gel');
    expect(out[0].price).toBe(25);
    expect(out[0].baseName).toBe("Healer's Gel");
  });

  it('excludes a catalyst whose spell the shop does not offer', () => {
    const out = eligibleCatalysts('s', shop, spellCatalog, catalysts, catalogMap);
    expect(out.map((w) => w.id)).not.toContain('wish-cat');
  });

  it('skips GM-excluded (noShop) catalysts', () => {
    const out = eligibleCatalysts('s', shop, spellCatalog, catalysts, catalogMap);
    expect(out.map((w) => w.id)).not.toContain('secret-gel');
  });

  it('is gated on spellcasting — an explicit offersSpellcasting:false stocks none', () => {
    const off = { s: { wares: [{ spellItem: 'scroll', maxLevel: 3 }], offersSpellcasting: false } };
    expect(eligibleCatalysts('s', off, spellCatalog, catalysts, catalogMap)).toEqual([]);
  });

  it('is empty when the shop offers no spells at all', () => {
    const plain = { s: { wares: [{ ref: 'antidote' }] } };
    expect(eligibleCatalysts('s', plain, spellCatalog, catalysts, catalogMap)).toEqual([]);
  });
});

describe('eligibleSpellItems', () => {
  it('applies the item-level cap and excludes uncommon/rare/focus/cantrips by default (common only)', () => {
    // maxLevel 3 ⇒ scrolls up to rank 2 (item level 3): sleep(1), heal(1),
    // blazing-bolt(2) — all common; web=uncommon, rare-thing=rare, wish=lvl19,
    // lay-on-hands=focus, light=cantrip are all excluded.
    const out = eligibleSpellItems({ spellItem: 'scroll', maxLevel: 3 }, spellCatalog);
    expect(keysOf(out)).toEqual(['scroll:blazing-bolt', 'scroll:heal', 'scroll:sleep']);
  });

  it('filters by tradition (intersection); multi-tradition spells match on any', () => {
    const divine = eligibleSpellItems({ spellItem: 'scroll', maxLevel: 3, traditions: ['divine'] }, spellCatalog);
    expect(keysOf(divine)).toEqual(['scroll:heal']);
    const primal = eligibleSpellItems({ spellItem: 'scroll', maxLevel: 3, traditions: ['primal'] }, spellCatalog);
    // heal (divine/primal) + blazing-bolt (arcane/primal) both share primal.
    expect(keysOf(primal)).toEqual(['scroll:blazing-bolt', 'scroll:heal']);
  });

  it('opts into uncommon when rarities is set, stamping the rarity trait', () => {
    const out = eligibleSpellItems({ spellItem: 'scroll', maxLevel: 3, rarities: ['common', 'uncommon'] }, spellCatalog);
    expect(keysOf(out)).toContain('scroll:web');
    const web = out.find((e) => e.wareKey === 'scroll:web');
    expect(web.traits[0]).toBe('Uncommon'); // rarity stamped onto the item
  });

  it('caps a wand at rank 9 but a scroll at rank 10 (table maxima at item level 19)', () => {
    const scroll = eligibleSpellItems({ spellItem: 'scroll', maxLevel: 19 }, spellCatalog);
    expect(keysOf(scroll)).toContain('scroll:wish'); // rank-10 scroll (lvl 19) is valid
    const wand = eligibleSpellItems({ spellItem: 'wand', maxLevel: 19 }, spellCatalog);
    expect(keysOf(wand)).not.toContain('wand:wish'); // rank-10 wand is impossible
  });

  it('gates by derived item level, not rank — a rank-2 wand (lvl 5) needs a higher cap than a rank-2 scroll (lvl 3)', () => {
    // maxLevel 3: scrolls reach rank 2 (lvl 3) but wands only rank 0 (rank-1 wand
    // is already lvl 3 → included; rank-2 wand is lvl 5 → out).
    const scroll = eligibleSpellItems({ spellItem: 'scroll', maxLevel: 3 }, spellCatalog);
    expect(keysOf(scroll)).toContain('scroll:blazing-bolt'); // rank-2 scroll, lvl 3
    const wand = eligibleSpellItems({ spellItem: 'wand', maxLevel: 3 }, spellCatalog);
    expect(keysOf(wand)).not.toContain('wand:blazing-bolt'); // rank-2 wand is lvl 5
    expect(keysOf(wand)).toContain('wand:sleep'); // rank-1 wand is lvl 3
  });

  it('produces a minimal, re-resolvable entry with derived name/level/price', () => {
    const [sleep] = eligibleSpellItems({ spellItem: 'scroll', maxLevel: 1 }, spellCatalog);
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
    const [heal] = eligibleSpellItems({ spellItem: 'wand', maxLevel: 3, traditions: ['divine'] }, spellCatalog);
    expect(heal).toMatchObject({ id: 'wand-of-heal', name: 'Wand of Heal', level: 3, price: 60, wand: { spellRef: 'heal' } });
  });

  it('carries the full spell display block so the preview can show the whole spell', () => {
    const rich = [{
      id: 'bolt', name: 'Bolt', level: 1, traditions: ['arcane'], baseLevel: 1,
      traits: ['Concentrate', 'Manipulate'], actions: 'Two Actions', defense: 'Reflex',
      range: '30 feet', targets: '1 creature', duration: 'instant', trigger: 'you point',
      description: 'A bolt.', degrees: { Success: 'half' }, heightened: { '+1': 'more' },
    }];
    const [ware] = eligibleSpellItems({ spellItem: 'scroll', maxLevel: 1 }, rich);
    expect(ware.spell).toEqual({
      name: 'Bolt', level: 1, traits: ['Concentrate', 'Manipulate'], actions: 'Two Actions',
      defense: 'Reflex', range: '30 feet', targets: '1 creature', duration: 'instant',
      trigger: 'you point', description: 'A bolt.', degrees: { Success: 'half' }, heightened: { '+1': 'more' },
    });
    // Curated subset — internal fields are not leaked onto the browse ware.
    expect(ware.spell).not.toHaveProperty('id');
    expect(ware.spell).not.toHaveProperty('traditions');
    expect(ware.spell).not.toHaveProperty('baseLevel');
  });

  it('applies priceMod as a multiplier over the standard price', () => {
    const [sleep] = eligibleSpellItems({ spellItem: 'scroll', maxLevel: 1, priceMod: 2 }, spellCatalog);
    expect(sleep.price).toBe(8); // 4 × 2
  });

  it('returns [] for a non-offering ware, a zero cap, or a level below the kind floor', () => {
    expect(eligibleSpellItems({ ref: 'healing-potion' }, spellCatalog)).toEqual([]);
    expect(eligibleSpellItems({ spellItem: 'scroll', maxLevel: 0 }, spellCatalog)).toEqual([]);
    // A wand's cheapest item is level 3, so maxLevel 2 stocks none.
    expect(eligibleSpellItems({ spellItem: 'wand', maxLevel: 2 }, spellCatalog)).toEqual([]);
  });
});

describe('eligibleSpellItems — heightened offerings (#937)', () => {
  const heightenedCatalog = [
    { id: 'fireball', name: 'Fireball', level: 3, traditions: ['arcane'], heightened: { '+1': 'more damage' } },
    { id: 'glitterdust', name: 'Glitterdust', level: 2, traditions: ['arcane'], heightened: { '4th': 'upgrade' } },
    { id: 'mage-armor', name: 'Mage Armor', level: 1, traditions: ['arcane'] }, // no heightening
  ];
  const scrolls = (maxLevel) =>
    eligibleSpellItems({ spellItem: 'scroll', maxLevel, traditions: ['arcane'] }, heightenedCatalog);

  it('emits one scroll per mechanically-distinct rank, sharing an id with rank-distinct wareKeys', () => {
    const fb = scrolls(19).filter((e) => e.id === 'scroll-of-fireball');
    expect(fb.map((e) => e.wareKey)).toEqual([
      'scroll:fireball', 'scroll:fireball:4', 'scroll:fireball:5', 'scroll:fireball:6',
      'scroll:fireball:7', 'scroll:fireball:8', 'scroll:fireball:9', 'scroll:fireball:10',
    ]);
    // Base form is minimal (no rank override); a heightened form carries it.
    const base = fb[0];
    const r5 = fb.find((e) => e.wareKey === 'scroll:fireball:5');
    expect(base).toMatchObject({ name: 'Scroll of Fireball', scroll: { spellRef: 'fireball' }, level: 5, price: 30 });
    expect(base.scroll.rank).toBeUndefined();
    // Rank 5 scroll → item level 9, 150 gp; name carries the "(Rank N)" suffix.
    expect(r5).toMatchObject({ name: 'Scroll of Fireball (Rank 5)', scroll: { spellRef: 'fireball', rank: 5 }, level: 9, price: 150 });
  });

  it('offers a fixed-"Nth" spell only at base + that rank, and an un-heightenable spell once', () => {
    const out = scrolls(19);
    expect(out.filter((e) => e.id === 'scroll-of-glitterdust').map((e) => e.wareKey))
      .toEqual(['scroll:glitterdust', 'scroll:glitterdust:4']);
    expect(out.filter((e) => e.id === 'scroll-of-mage-armor').map((e) => e.wareKey))
      .toEqual(['scroll:mage-armor']);
  });

  it("bounds heightened ranks by the shop's item-level cap", () => {
    // maxLevel 5 ⇒ scroll cap rank 3, so fireball (base 3) offers only the base.
    expect(scrolls(5).filter((e) => e.id === 'scroll-of-fireball').map((e) => e.wareKey))
      .toEqual(['scroll:fireball']);
  });

  it('groups all ranks of a spell into one browse entry, cheapest-first', () => {
    // maxLevel 9 ⇒ scroll cap rank 5 ⇒ fireball ranks 3,4,5.
    const groups = groupWares(scrolls(9));
    const fb = groups.find((g) => g.ref === 'scroll-of-fireball');
    expect(fb.name).toBe('Scroll of Fireball'); // headline = base, un-suffixed
    expect(fb.forms.map((f) => f.wareKey)).toEqual(['scroll:fireball', 'scroll:fireball:4', 'scroll:fireball:5']);
    expect(fb.forms.map((f) => f.price)).toEqual([30, 70, 150]); // ascending
  });

  it('summary counts distinct spells, not rank-forms', () => {
    const s = spellOfferingSummary({ spellItem: 'scroll', maxLevel: 19, traditions: ['arcane'] }, heightenedCatalog);
    expect(s.count).toBe(3); // fireball, glitterdust, mage-armor — not the many forms
    expect(s.text).toContain('3 eligible spells');
  });
});

describe('eligibleSpellItems — base image (#936)', () => {
  const artMap = new Map([
    ['magic-scroll', { id: 'magic-scroll', image: 'img_scroll.jpg', imagePosition: { x: 1, y: 2 } }],
    ['magic-wand', { id: 'magic-wand', image: 'img_wand.jpg' }],
  ]);

  it('stamps the base scroll image (+position) on every generated ware', () => {
    const out = eligibleSpellItems({ spellItem: 'scroll', maxLevel: 3 }, spellCatalog, artMap);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((e) => e.image === 'img_scroll.jpg')).toBe(true);
    expect(out.every((e) => e.imagePosition && e.imagePosition.x === 1)).toBe(true);
  });

  it('stamps the wand image with no position when the base has none', () => {
    const [heal] = eligibleSpellItems({ spellItem: 'wand', maxLevel: 3, traditions: ['divine'] }, spellCatalog, artMap);
    expect(heal.image).toBe('img_wand.jpg');
    expect(heal).not.toHaveProperty('imagePosition');
  });

  it('omits the image when no catalog (or base art) is supplied', () => {
    const [sleep] = eligibleSpellItems({ spellItem: 'scroll', maxLevel: 1 }, spellCatalog);
    expect(sleep).not.toHaveProperty('image');
    const [sleep2] = eligibleSpellItems({ spellItem: 'scroll', maxLevel: 1 }, spellCatalog, new Map());
    expect(sleep2).not.toHaveProperty('image');
  });
});

describe('eligibleSpellItems — spell description for the preview', () => {
  it("stamps the spell's description onto each generated ware", () => {
    const cat = [{ id: 'doze', name: 'Doze', level: 1, traditions: ['arcane'], description: 'Targets nod off.' }];
    const [scroll] = eligibleSpellItems({ spellItem: 'scroll', maxLevel: 3, traditions: ['arcane'] }, cat);
    expect(scroll.description).toBe('Targets nod off.');
  });

  it('omits description when the spell has none', () => {
    const [sleep] = eligibleSpellItems({ spellItem: 'scroll', maxLevel: 1 }, spellCatalog);
    expect(sleep).not.toHaveProperty('description');
  });
});

describe('spellOfferingSummary', () => {
  it('summarises the default (all traditions, common only) coverage + count', () => {
    const s = spellOfferingSummary({ spellItem: 'scroll', maxLevel: 3 }, spellCatalog);
    // sleep, heal, blazing-bolt (web is uncommon; rare-thing rare; wish out of level).
    // Item level 3 ⇒ scrolls up to rank 2 (the derived cap).
    expect(s).toMatchObject({ kind: 'scroll', maxLevel: 3, cap: 2, count: 3 });
    expect(s.text).toBe('Scrolls · all traditions · common · up to item level 3 · 3 eligible spells');
  });

  it('reflects tradition + rarity filters and singularises one spell', () => {
    const s = spellOfferingSummary(
      { spellItem: 'wand', maxLevel: 5, traditions: ['arcane'], rarities: ['common', 'uncommon'] },
      spellCatalog
    );
    // arcane, common+uncommon, item level ≤ 5 (wand rank ≤ 2): sleep, blazing-bolt, web.
    expect(s.text).toBe('Wands · arcane · common+uncommon · up to item level 5 · 3 eligible spells');
  });

  it('derives the cap rank from the level, bounded by the base-template max', () => {
    expect(spellOfferingSummary({ spellItem: 'wand', maxLevel: 99 }, spellCatalog).cap).toBe(9);
  });
});

// ── Player browse grouping (#857 S2) ────────────────────────────────────────
describe('groupWares', () => {
  it('collapses variants of one item into a single cheapest-first group, headlined by base name (#880)', () => {
    const wares = resolveShopWares(
      's',
      { s: { wares: [{ ref: 'tonic', level: 3 }, { ref: 'tonic', level: 1 }] } },
      catalogMap
    );
    const groups = groupWares(wares);
    expect(groups).toHaveLength(1);
    // Multi-form group headlines the catalog base name ("Tonic"), not the
    // cheapest variant's merged name ("Minor Tonic").
    expect(groups[0]).toMatchObject({ ref: 'tonic', name: 'Tonic', from: 4, formCount: 2 });
    expect(groups[0].forms.map((f) => f.wareKey)).toEqual(['tonic@1', 'tonic@3']); // cheapest-first
    expect(groups[0].forms.map((f) => f.price)).toEqual([4, 12]);
  });

  it('keeps a single-variant item as a one-form group, headlined by its own name', () => {
    const groups = groupWares(resolveShopWares('curious-goblin', shops, catalogMap));
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ ref: 'spellbook', name: 'Spellbook', from: 10, formCount: 1 });
  });

  it('headlines a single stocked variant by its own name, not the base name (#880)', () => {
    // One form only → the per-variant name ("Lesser Tonic") is the useful label.
    const groups = groupWares(resolveShopWares('s', { s: { wares: [{ ref: 'tonic', level: 3 }] } }, catalogMap));
    expect(groups[0]).toMatchObject({ ref: 'tonic', name: 'Lesser Tonic', formCount: 1 });
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

  it('carries the cheapest form image/imagePosition onto the group (#881)', () => {
    const map = new Map([
      ['p', { id: 'p', name: 'P', image: 'p.png', imagePosition: { x: 10, y: 90 },
        variants: [{ level: 1, price: 9 }, { level: 2, price: 3 }] }],
    ]);
    const [group] = groupWares(resolveShopWares('s', { s: { wares: [
      { ref: 'p', level: 1 }, { ref: 'p', level: 2 },
    ] } }, map));
    expect(group).toMatchObject({ image: 'p.png', imagePosition: { x: 10, y: 90 } });
  });

  it('leaves group.image undefined when the item has no image', () => {
    const groups = groupWares(resolveShopWares('curious-goblin', shops, catalogMap));
    expect(groups[0].image).toBeUndefined();
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

// ── Generative rune-service offerings (#982 G1) ─────────────────────────────
// A property-rune catalog spanning every target axis + a fundamental (excluded).
const runeCatalog = [
  { id: 'flaming', type: 'property', name: 'Flaming', level: 8, price: 500 }, // weapon (no target, not armorRune)
  { id: 'keen', type: 'property', name: 'Keen', level: 13, price: 3000 }, // weapon, above a cap-10 shop
  { id: 'shadow', type: 'property', armorRune: true, name: 'Shadow', level: 5, price: 55 }, // armor via legacy flag
  { id: 'ready', type: 'property', target: 'armor', name: 'Ready', level: 6, price: 200 }, // armor via explicit target
  { id: 'ring-calling', type: 'property', target: 'ring', name: 'Calling', level: 8, price: 400 }, // ring
  { id: 'fearsome', type: 'property', name: 'Fearsome', level: 5, price: 160, rarity: 'uncommon' }, // weapon, uncommon
  { id: 'striking', type: 'fundamental', target: 'weapon', name: 'Striking', level: 4, price: 65 }, // fundamental — never offered
  { id: 'menacing', type: 'property', target: 'accessory', name: 'Menacing', level: 3, price: 50 }, // accessory (#1033 S4)
  { id: 'called', type: 'property', target: 'accessory', name: 'Called', level: 3, price: 60, rarity: 'uncommon' }, // accessory, uncommon
];

describe('isRuneServiceWare (#982 G1)', () => {
  it('detects the runeService flag only', () => {
    expect(isRuneServiceWare({ runeService: true })).toBe(true);
    expect(isRuneServiceWare({ ref: 'runestone', runeRef: 'flaming' })).toBe(false);
    expect(isRuneServiceWare({ spellItem: 'scroll' })).toBe(false);
    expect(isRuneServiceWare(null)).toBe(false);
  });
});

describe('runeRarity (#982 G1)', () => {
  it('reads an explicit rarity field, lowercased', () => {
    expect(runeRarity({ rarity: 'Uncommon' })).toBe('uncommon');
    expect(runeRarity({ rarity: 'rare' })).toBe('rare');
  });
  it('falls back to a rarity trait, then to common', () => {
    expect(runeRarity({ traits: ['Rare', 'Magical'] })).toBe('rare');
    expect(runeRarity({ name: 'Flaming' })).toBe('common');
    expect(runeRarity(null)).toBe('common');
  });
});

describe('runeOfferings (#982 G1)', () => {
  it('returns only runeService wares, tagged with a stable offeringKey', () => {
    const s = {
      smith: {
        wares: [
          { ref: 'antidote' },
          { runeService: true, targets: ['weapon'], maxLevel: 10 },
          { ref: 'runestone', runeRef: 'flaming' },
        ],
      },
    };
    const offs = runeOfferings('smith', s);
    expect(offs).toHaveLength(1);
    expect(offs[0].offeringKey).toBe('runeService:weapon:10/10/10/10/10:common');
  });
  it('is empty for a shop with no rune-service ware or bad args', () => {
    expect(runeOfferings('bottled-solutions', shops)).toEqual([]);
    expect(runeOfferings(null, shops)).toEqual([]);
  });
});

describe('eligibleRunes (#982 G1)', () => {
  it('filters by target, level cap, and default common-only rarity; excludes fundamentals', () => {
    const ware = { runeService: true, targets: ['weapon'], maxLevel: 10 };
    const ids = eligibleRunes(ware, runeCatalog).map((w) => w.runeRef);
    expect(ids).toEqual(['flaming']); // keen too high, fearsome uncommon, others off-target, striking fundamental
  });

  it('admits uncommon runes when the offering opts in', () => {
    const ware = { runeService: true, targets: ['weapon'], maxLevel: 10, rarities: ['common', 'uncommon'] };
    const ids = eligibleRunes(ware, runeCatalog).map((w) => w.runeRef);
    expect(ids).toEqual(['flaming', 'fearsome']);
  });

  it('caps per target with an object maxLevel and honors the target list', () => {
    const ware = { runeService: true, targets: ['weapon', 'ring'], maxLevel: { weapon: 10, ring: 8 } };
    const ids = eligibleRunes(ware, runeCatalog).map((w) => w.runeRef);
    expect(ids).toEqual(['flaming', 'ring-calling']); // armor runes excluded (not a target)
  });

  it('defaults to every target when targets is unset', () => {
    const ware = { runeService: true, maxLevel: 20 };
    const ids = eligibleRunes(ware, runeCatalog).map((w) => w.runeRef).sort();
    // called stays out: uncommon, and the default rarity is common only.
    expect(ids).toEqual(['flaming', 'keen', 'menacing', 'ready', 'ring-calling', 'shadow'].sort());
  });

  it('offers accessory runes by target, cap, and rarity (#1033 S4)', () => {
    const common = { runeService: true, targets: ['accessory'], maxLevel: 10 };
    expect(eligibleRunes(common, runeCatalog).map((w) => w.runeRef)).toEqual(['menacing']);
    const uncommon = { ...common, rarities: ['common', 'uncommon'] };
    expect(eligibleRunes(uncommon, runeCatalog).map((w) => w.runeRef)).toEqual(['menacing', 'called']);
    const capped = { ...uncommon, maxLevel: 2 };
    expect(eligibleRunes(capped, runeCatalog)).toEqual([]);
  });

  it('emits hand-stocked-shaped runestone ware specs with a stable wareKey', () => {
    const ware = { runeService: true, targets: ['weapon'], maxLevel: 10 };
    expect(eligibleRunes(ware, runeCatalog)[0]).toEqual({
      ref: 'runestone',
      runeRef: 'flaming',
      wareKey: 'rune:flaming',
    });
  });

  it('dedupes by rune id and is empty for a non-runeService ware', () => {
    const dupes = [...runeCatalog, { id: 'flaming', type: 'property', name: 'Flaming', level: 8 }];
    const ware = { runeService: true, targets: ['weapon'], maxLevel: 10 };
    expect(eligibleRunes(ware, dupes).filter((w) => w.runeRef === 'flaming')).toHaveLength(1);
    expect(eligibleRunes({ ref: 'runestone' }, runeCatalog)).toEqual([]);
  });

  it('offers nothing for a target with no cap in an object maxLevel', () => {
    const ware = { runeService: true, targets: ['weapon', 'armor'], maxLevel: { weapon: 10 } };
    const ids = eligibleRunes(ware, runeCatalog).map((w) => w.runeRef);
    expect(ids).toEqual(['flaming']); // armor capped at 0 → excluded
  });
});

describe('runeOfferingSummary (#982 G1)', () => {
  it('summarizes targets, rarities, caps, and the live eligible count', () => {
    const ware = { runeService: true, targets: ['weapon', 'ring'], maxLevel: { weapon: 10, ring: 8 } };
    const sum = runeOfferingSummary(ware, runeCatalog);
    expect(sum).toMatchObject({ targets: ['weapon', 'ring'], rarities: ['common'], count: 2 });
    expect(sum.text).toBe('Runes · weapon/ring · common · weapon ≤10, ring ≤8 · 2 eligible runes');
  });
  it('labels all-targets and reflects RUNE_TARGETS', () => {
    const sum = runeOfferingSummary({ runeService: true, maxLevel: 20 }, runeCatalog);
    expect(sum.text.startsWith('Runes · all targets ·')).toBe(true);
    expect(RUNE_TARGETS).toEqual(['weapon', 'armor', 'shield', 'ring', 'accessory']);
  });
});

describe('eligibleHostItems (#1044)', () => {
  // Rune docs spanning the four targets, with the accessory usages host
  // matching needs.
  const hostRunes = [
    { id: 'flaming', type: 'property', name: 'Flaming', level: 8, price: 500 }, // weapon
    { id: 'ready', type: 'property', target: 'armor', name: 'Ready', level: 6, price: 200 },
    { id: 'ring-calling', type: 'property', target: 'ring', name: 'Calling', level: 8, price: 400 },
    { id: 'menacing', type: 'property', target: 'accessory', name: 'Menacing', level: 3, price: 50, usage: ['clothing'] },
    { id: 'pontoon', type: 'property', target: 'accessory', name: 'Pontoon', level: 9, price: 650, usage: ['footwear'] },
    { id: 'catching', type: 'property', target: 'accessory', name: 'Catching', level: 8, price: 425, usage: ['shield'] },
    { id: 'presentable', type: 'property', target: 'shield', name: 'Presentable', level: 5, price: 100 },
  ];
  // A catalog slice: base gear, pre-runed/magic/bomb impostors, hosts, and a
  // light-bulk trinket that must never be swept in by the derived light tag.
  const hostItems = [
    { id: 'longsword', name: 'Longsword', price: 1, strikes: [{}], runes: {} },
    { id: 'cold-iron-longsword', name: '+1 Cold Iron Longsword', price: 41, strikes: [{}], runes: { potency: 1 } },
    { id: 'acid-flask', name: 'Acid Flask', price: 3, strikes: [{}], traits: ['Alchemical', 'Bomb', 'Consumable'] },
    { id: 'sparkblade', name: 'Sparkblade', price: 60, strikes: [{}], traits: ['Magical'] },
    { id: 'breastplate', name: 'Breastplate', price: 8, armor: { acBonus: 4 } },
    { id: 'explorers-clothing', name: "Explorer's Clothing", price: 0.1, armor: { acBonus: 0 }, accessoryTags: ['clothing'] },
    { id: 'cloak', name: 'Cloak', price: 0.5, weight: 0.1, accessoryTags: ['cloak', 'clothing'] },
    { id: 'boots', name: 'Boots', price: 0.5, weight: 0.1, accessoryTags: ['footwear'] },
    { id: 'buckler', name: 'Buckler', price: 1, weight: 0.1, shield: { hardness: 3 } },
    { id: 'chalk', name: 'Chalk', price: 0.01, weight: 0 }, // light, but no deliberate host tag
    { id: 'power-ring', name: 'Power Ring', powerRing: true, traits: ['Invested', 'Magical'] },
    // Valid base weapon, but GM-flagged never-sell (#1105) — never a host.
    { id: 'cursed-blade', name: 'Cursed Blade', price: 5, strikes: [{}], runes: {}, noShop: true },
  ];
  const ids = (ware) => eligibleHostItems(ware, hostItems, hostRunes).map((i) => i.id);

  it('a weapon-target service stocks base weapons only — no bombs, magic, or pre-runed gear', () => {
    expect(ids({ runeService: true, targets: ['weapon'], maxLevel: 10 })).toEqual(['longsword']);
  });

  it('the general runesmith is exempt: unset targets and an explicit all-target list stock nothing', () => {
    expect(ids({ runeService: true, maxLevel: 20 })).toEqual([]);
    expect(ids({ runeService: true, targets: [...RUNE_TARGETS], maxLevel: 20 })).toEqual([]);
  });

  it('a shield-target service stocks base shields (the branch that was missing)', () => {
    // Presentable (shield property rune, L5) is admitted → the buckler appears.
    // Below the cap that admits it, no shields — same window logic as the others.
    expect(ids({ runeService: true, targets: ['shield'], maxLevel: 5 })).toEqual(['buckler']);
    expect(ids({ runeService: true, targets: ['shield'], maxLevel: 4 })).toEqual([]);
  });

  it('a shield with a bash strikes block is a shield host, never weapon base gear (#1177)', () => {
    // Spiked steel shield: strikes + shield. Under a weapon+shield service it
    // appears once, under shield — the weapon branch excludes it.
    const spiked = { id: 'spiked-shield', name: 'Spiked Shield', price: 2, weight: 1, shield: { hardness: 5 }, strikes: [{}], runes: {} };
    const got = eligibleHostItems(
      { runeService: true, targets: ['weapon', 'shield'], maxLevel: 10 },
      [...hostItems, spiked], hostRunes,
    ).map((i) => i.id);
    expect(got).toContain('spiked-shield');
    expect(got.filter((id) => id === 'spiked-shield')).toHaveLength(1); // not double-listed
    // And a weapon-only service never stocks it.
    expect(eligibleHostItems({ runeService: true, targets: ['weapon'], maxLevel: 10 }, [...hostItems, spiked], hostRunes).map((i) => i.id))
      .not.toContain('spiked-shield');
  });

  it('never offers a GM-excluded (noShop) item, even valid base gear (#1105)', () => {
    // cursed-blade is a perfectly good base weapon but flagged never-sell.
    expect(ids({ runeService: true, targets: ['weapon'], maxLevel: 10 })).toEqual(['longsword']);
  });

  describe('shopHostKind (#1105)', () => {
    const kind = (id) => shopHostKind(hostItems.find((i) => i.id === id));
    it('classifies base gear by target, null for non-hosts', () => {
      expect(kind('longsword')).toBe('weapon');
      expect(kind('breastplate')).toBe('armor');
      expect(kind('explorers-clothing')).toBe('armor'); // armor wins over its accessory role
      expect(kind('cloak')).toBe('accessory');
      expect(kind('buckler')).toBe('shield');
      expect(kind('power-ring')).toBe('ring');
      expect(kind('cold-iron-longsword')).toBeNull(); // pre-runed
      expect(kind('sparkblade')).toBeNull(); // magic
      expect(kind('acid-flask')).toBeNull(); // bomb
      expect(kind('chalk')).toBeNull(); // light trinket, no deliberate host tag
    });
    it('is orthogonal to noShop — a flagged item keeps its kind', () => {
      expect(kind('cursed-blade')).toBe('weapon');
    });
    it('classifies a shield with a bash strikes block as shield, not weapon (#1177)', () => {
      expect(shopHostKind({ id: 'spiked-shield', price: 2, weight: 1, shield: { hardness: 5 }, strikes: [{}], runes: {} })).toBe('shield');
    });
  });

  it('accessory hosts match the ADMITTED runes by usage; the derived light tag never sweeps trinkets in', () => {
    // Cap 5 admits Menacing only → clothing hosts, not boots/buckler.
    expect(ids({ runeService: true, targets: ['accessory'], maxLevel: 5 })).toEqual(['explorers-clothing', 'cloak']);
    // Cap 10 admits Pontoon + Catching too → footwear + shield join; chalk never does.
    expect(ids({ runeService: true, targets: ['accessory'], maxLevel: 10 }))
      .toEqual(['explorers-clothing', 'cloak', 'boots', 'buckler']);
  });

  it('a target with no admitted rune in the window stocks no gear for it', () => {
    // Ready (armor, L6) is above a cap-5 window — no armor, even though the target is on.
    expect(ids({ runeService: true, targets: ['armor'], maxLevel: 5 })).toEqual([]);
    expect(ids({ runeService: true, targets: ['armor'], maxLevel: 10 })).toEqual(['breastplate', 'explorers-clothing']);
  });

  it('the ring target stocks the Power Ring (magic, but the blank a ring rune imbues)', () => {
    expect(ids({ runeService: true, targets: ['ring'], maxLevel: 10 })).toEqual(['power-ring']);
  });

  it('dedupes a dual-role item across targets and ignores non-service wares', () => {
    // Explorer's Clothing is base armor AND a clothing host — once only.
    expect(ids({ runeService: true, targets: ['armor', 'accessory'], maxLevel: 10 }))
      .toEqual(['breastplate', 'explorers-clothing', 'cloak', 'boots', 'buckler']);
    expect(eligibleHostItems({ ref: 'runestone' }, hostItems, hostRunes)).toEqual([]);
  });
});

describe('eligibleTalismans (#1211)', () => {
  const talItems = [
    { id: 'adamantine-flake', name: 'Adamantine Flake', level: 3, price: 8,
      traits: ['Consumable', 'Talisman'], talisman: { affixTo: 'shield', activation: { cost: 1 } },
      variants: [
        { level: 3, name: 'Adamantine Flake', price: 8 },
        { level: 8, name: 'Greater Adamantine Flake', price: 90 },
        { level: 13, name: 'Major Adamantine Flake', price: 460 },
      ] },
    { id: 'heartstone', name: 'Heartstone', level: 10, price: 160,
      traits: ['Consumable', 'Talisman'], talisman: { affixTo: 'shield', activation: { cost: 1 } } },
    { id: 'wolf-fang', name: 'Wolf Fang', level: 2, price: 7,
      traits: ['Consumable', 'Talisman'], talisman: { affixTo: 'weapon', activation: { cost: 1 } } },
    // A valid shield talisman, but GM-flagged never-sell (#1105).
    { id: 'shield-cover', name: 'Shield Cover', level: 1, price: 1, noShop: true,
      traits: ['Consumable', 'Talisman'], talisman: { affixTo: 'shield', activation: { cost: 1 } } },
    { id: 'longsword', name: 'Longsword', price: 1, strikes: [{}], runes: {} }, // not a talisman
  ];
  const keys = (ware) => eligibleTalismans(ware, talItems).map((w) => w.wareKey);

  it('a shield-target service stocks shield talismans up to the shield cap, one form per in-cap grade', () => {
    // Cap 10: adamantine grades 3 & 8 (not 13), heartstone (10). wolf-fang is a
    // weapon talisman; shield-cover is noShop; longsword is not a talisman.
    expect(keys({ runeService: true, targets: ['shield'], maxLevel: 10 })).toEqual([
      'talisman:adamantine-flake@3', 'talisman:adamantine-flake@8', 'talisman:heartstone@10',
    ]);
  });

  it('the general runesmith is exempt: unset targets and an explicit all-target list stock nothing', () => {
    expect(keys({ runeService: true, maxLevel: 20 })).toEqual([]);
    expect(keys({ runeService: true, targets: [...RUNE_TARGETS], maxLevel: 20 })).toEqual([]);
  });

  it('the level cap gates individual grades', () => {
    // Cap 3: only the base adamantine grade; its higher grades and heartstone (10) drop.
    expect(keys({ runeService: true, targets: ['shield'], maxLevel: 3 }))
      .toEqual(['talisman:adamantine-flake@3']);
  });

  it('only stocks talismans whose affixTo is an offered target', () => {
    // A weapon-rune smith carries weapon talismans, not shield ones.
    expect(keys({ runeService: true, targets: ['weapon'], maxLevel: 10 }))
      .toEqual(['talisman:wolf-fang@2']);
  });

  it('honors a per-target level cap object across mixed targets', () => {
    const out = eligibleTalismans({ runeService: true, targets: ['weapon', 'shield'], maxLevel: { shield: 8, weapon: 2 } }, talItems);
    expect(out.map((w) => w.wareKey)).toEqual([
      'talisman:adamantine-flake@3', 'talisman:adamantine-flake@8', 'talisman:wolf-fang@2',
    ]);
    // The merged grade ware carries the variant's name/level/price + the base id/talisman.
    const greater = out.find((w) => w.wareKey === 'talisman:adamantine-flake@8');
    expect(greater).toMatchObject({ id: 'adamantine-flake', name: 'Greater Adamantine Flake', level: 8, price: 90, baseName: 'Adamantine Flake' });
    expect(greater.talisman.affixTo).toBe('shield');
    expect(greater.variants).toBeUndefined(); // the ladder is stripped from the ware
  });

  it('never offers a GM-excluded (noShop) talisman, and ignores non-service wares', () => {
    expect(keys({ runeService: true, targets: ['shield'], maxLevel: 20 }))
      .not.toContain('talisman:shield-cover@1');
    expect(eligibleTalismans({ ref: 'runestone' }, talItems)).toEqual([]);
  });
});

describe('isDragonbreathWare (#1210 M4g)', () => {
  it('is true only for a base-weapon ref carrying a dragonbreath template', () => {
    expect(isDragonbreathWare({ ref: 'longsword', dragonbreath: { tier: 'greater', dragonType: 'Red' } })).toBe(true);
    expect(isDragonbreathWare({ ref: 'longsword', dragonbreath: { tier: 'base' } })).toBe(true);
    // Not a dragonbreath ware
    expect(isDragonbreathWare({ ref: 'longsword' })).toBe(false);
    expect(isDragonbreathWare({ ref: 'longsword', dragonbreath: { tier: 'legendary' } })).toBe(false); // bad tier
    expect(isDragonbreathWare({ ref: 'runestone', runeRef: 'flaming' })).toBe(false);
    expect(isDragonbreathWare({ spellItem: 'scroll', maxLevel: 5 })).toBe(false);
    expect(isDragonbreathWare(null)).toBe(false);
  });
});

describe('resolveShopWares — dragonbreath weapons (#1210 M4g)', () => {
  const dbCatalog = new Map([
    ['longsword', { id: 'longsword', name: 'Longsword', price: 1, weight: 1, traits: ['Sword'], strikes: {}, runes: {}, description: 'A blade.' }],
  ]);
  const shopWith = (ware) => ({ s: { wares: [ware] } });

  it('attaches the template and derives name / level / default price', () => {
    const [w] = resolveShopWares('s', shopWith({ ref: 'longsword', dragonbreath: { tier: 'greater', dragonType: 'Red' } }), dbCatalog);
    expect(w.name).toBe('Greater Red Dragonbreath Longsword');
    expect(w.dragonbreath).toEqual({ tier: 'greater', dragonType: 'Red' });
    expect(w.level).toBe(13);
    // Pack tier price (2800) + base weapon price (1).
    expect(w.price).toBe(2801);
    // Base name kept for grouping; ref kept so the bought copy re-resolves.
    expect(w.baseName).toBe('Longsword');
    expect(w.ref).toBe('longsword');
    // Distinct id/wareKey per template so it stays its own browse group.
    expect(w.id).toBe('dragonbreath:longsword:greater:red');
    expect(w.wareKey).toBe('dragonbreath:longsword:greater:red');
    // Marked Magical, variants stripped.
    expect(w.traits).toContain('Magical');
    expect(w.variants).toBeUndefined();
  });

  it('base tier omits the tier word in the name and honors a price override', () => {
    const [w] = resolveShopWares('s', shopWith({ ref: 'longsword', dragonbreath: { tier: 'base', dragonType: 'Mirage' }, price: 500, stock: 2 }), dbCatalog);
    expect(w.name).toBe('Mirage Dragonbreath Longsword');
    expect(w.price).toBe(500);
    expect(w.stock).toBe(2);
    expect(w.level).toBe(7);
  });

  it('lets a shop stock a plain and a dragonbreath copy of one base as distinct groups', () => {
    const wares = resolveShopWares('s', { s: { wares: [
      { ref: 'longsword' },
      { ref: 'longsword', dragonbreath: { tier: 'base', dragonType: 'Red' } },
    ] } }, dbCatalog);
    expect(wares.map((w) => w.id)).toEqual(['longsword', 'dragonbreath:longsword:base:red']);
  });

  it('drops a dragonbreath ware whose base weapon is missing or GM-excluded', () => {
    expect(resolveShopWares('s', shopWith({ ref: 'nope', dragonbreath: { tier: 'base' } }), dbCatalog)).toEqual([]);
    const excl = new Map([['x', { id: 'x', name: 'X', price: 1, strikes: {}, noShop: true }]]);
    expect(resolveShopWares('s', shopWith({ ref: 'x', dragonbreath: { tier: 'base' } }), excl)).toEqual([]);
  });
});
