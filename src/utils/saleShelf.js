// src/utils/saleShelf.js
// Sale Shelf roll + resolve engine (#1135, epic #1134).
//
// A service shop can carry a GM-rolled Sale Shelf: one-of-a-kind discounted
// goods that persist as CONCRETE wares (nothing random expands at render time, so
// every client sees the same shelf). Two kinds:
//   • rune item   — a random base gear from the offering's own window given a
//                   random VALID rune set (fundamentals + properties), priced by
//                   the #548 resolvers and discounted;
//   • scroll pack — four same-rank scrolls drawn from the shop's eligible scrolls,
//                   sold at 3/4 price as a single ware.
//
// Prices are BAKED at roll time (robust to later catalog edits); `fullPrice`
// feeds the strike-through display. This module is pure — the roll functions take
// an injectable RNG (default Math.random) so tests are deterministic; the resolve
// selector turns stored sale wares into display items shaped like resolveShopWares
// output so groupWares / the cart treat them uniformly.

import { newEntryUid } from './uid';
import { runeTarget } from './runeClassify';
import { accessoryEligible } from './accessoryRunes';
import { buildWeaponName, resolveWeapon } from './weaponRunes';
import { buildArmorName, resolveArmor } from './armorRunes';
import { SCROLL_BY_RANK } from './spellItems';
import { baseSpellItemArt } from './InventoryUtils';
import { FUNDAMENTAL_RUNES, fundamentalRuneMap } from '../data/fundamentalRunes';
import {
  offeringTargets,
  maxLevelForTarget,
  eligibleRunes,
  eligibleSpellItems,
  isRuneServiceWare,
  isSpellItemWare,
  shopHostKind,
  isShopExcluded,
} from './shopUtils';

// Fundamental tiers, derived from the single-source rune docs (#857 S6a). Each
// tier carries the numeric potency `tier` (weapon/armor) or `tierKey`
// (striking/resilient) plus the canonical item `level` used to fit the window.
const fundTiers = (target, fundamental) =>
  FUNDAMENTAL_RUNES.filter((r) => r.target === target && r.fundamental === fundamental);
const WEAPON_POTENCY_TIERS = fundTiers('weapon', 'potency');
const WEAPON_STRIKING_TIERS = fundTiers('weapon', 'striking');
const ARMOR_POTENCY_TIERS = fundTiers('armor', 'potency');
const ARMOR_RESILIENT_TIERS = fundTiers('armor', 'resilient');

// How many times to reroll a duplicate rune item before accepting it (best-effort
// distinctness across a shelf — a tiny window can only offer so many items).
const DISTINCT_RETRIES = 5;

// ── RNG helpers ──────────────────────────────────────────────────────────────
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];
// An integer count in [0, max] inclusive.
const pickCount = (max, rng) => Math.floor(rng() * (Math.max(0, max) + 1));
// Up to `n` distinct elements drawn without replacement, in random order.
const sampleDistinct = (pool, n, rng) => {
  const bag = [...pool];
  const out = [];
  const take = Math.min(n, bag.length);
  for (let i = 0; i < take; i += 1) {
    out.push(bag.splice(Math.floor(rng() * bag.length), 1)[0]);
  }
  return out;
};

// A discount fraction in [0, 0.99]; absent/invalid ⇒ 0 (full price).
const clampDiscount = (v) => {
  const d = Number(v);
  return Number.isFinite(d) ? Math.min(Math.max(d, 0), 0.99) : 0;
};
const discounted = (fullPrice, discount) => Math.round(fullPrice * (1 - discount));

// The window-admitted PROPERTY runes (ring + accessory runes are `type:'property'`
// too), grouped by lowercased target — reusing eligibleRunes so the level/rarity/
// target window is honored exactly as the Runesmithing tab sees it.
const admittedRunesByTarget = (offering, runes) => {
  const byId = new Map((Array.isArray(runes) ? runes : []).map((r) => [String(r.id), r]));
  const map = new Map();
  eligibleRunes(offering, runes).forEach((spec) => {
    const doc = byId.get(String(spec.runeRef));
    if (!doc) return;
    const t = String(runeTarget(doc) || '').toLowerCase();
    if (!map.has(t)) map.set(t, []);
    map.get(t).push(doc);
  });
  return map;
};

// Base gear of a given host kind the shop may auto-surface: classified by
// shopHostKind directly (bypassing eligibleHostItems' general-runesmith exemption
// — the shelf is generated goods, so a general runesmith rolls across all targets)
// and honoring the #1105 never-sell flag.
const hostsOfKind = (items, kind) =>
  (Array.isArray(items) ? items : []).filter(
    (it) => it && it.id != null && !isShopExcluded(it) && shopHostKind(it) === kind
  );

// ── Roll: rune sale item ─────────────────────────────────────────────────────
/**
 * Roll one discounted runed item from a rune-service offering's window, or null
 * when the window admits nothing. Returns the stored sale-ware shape
 * `{ sale:'rune', saleId, ref, runes, fullPrice, price }` (plus `level` for a
 * ring grade). `runes.property` / `runes.accessory` hold rune IDS (the inventory
 * applyRune model), while pricing/naming use the resolved rune docs.
 */
export function rollRuneSaleItem(offering, items, runes, rng = Math.random) {
  if (!isRuneServiceWare(offering)) return null;
  const admitted = admittedRunesByTarget(offering, runes);
  const discount = clampDiscount(offering.saleDiscount);

  // Which of the offering's targets can actually produce an item right now.
  const admissible = offeringTargets(offering).filter((target) => {
    const targetRunes = admitted.get(target) || [];
    if (targetRunes.length < 1) return false; // window admits ≥1 rune for the target
    if (target === 'weapon' || target === 'armor') {
      const cap = maxLevelForTarget(offering, target);
      const potency = (target === 'weapon' ? WEAPON_POTENCY_TIERS : ARMOR_POTENCY_TIERS)
        .filter((t) => t.level <= cap);
      if (!potency.length) return false; // no fundamental tier fits ⇒ zero-rune guard
      return hostsOfKind(items, target).length > 0;
    }
    if (target === 'ring') {
      const cap = maxLevelForTarget(offering, 'ring');
      return hostsOfKind(items, 'ring').some(
        (it) => Array.isArray(it.variants) && it.variants.some((v) => v.level <= cap)
      );
    }
    // accessory: a deliberate host that accepts one of the admitted accessory runes
    return hostsOfKind(items, 'accessory').concat(hostsOfKind(items, 'shield')).some(
      (it) => targetRunes.some((r) => accessoryEligible(it, r))
    );
  });
  if (!admissible.length) return null;

  const target = pick(admissible, rng);
  const targetRunes = admitted.get(target) || [];

  if (target === 'weapon' || target === 'armor') {
    const cap = maxLevelForTarget(offering, target);
    const isWeapon = target === 'weapon';
    const host = pick(hostsOfKind(items, target), rng);

    const potency = pick(
      (isWeapon ? WEAPON_POTENCY_TIERS : ARMOR_POTENCY_TIERS).filter((t) => t.level <= cap),
      rng
    );
    // Optionally add the second fundamental (striking | resilient) when one fits.
    const secondFit = (isWeapon ? WEAPON_STRIKING_TIERS : ARMOR_RESILIENT_TIERS)
      .filter((t) => t.level <= cap);
    const second = secondFit.length && rng() < 0.5 ? pick(secondFit, rng) : null;
    // 0…potency distinct property runes from the target's admitted pool.
    const props = sampleDistinct(targetRunes, pickCount(potency.tier, rng), rng);

    const runeBlock = { potency: potency.tier };
    if (second) runeBlock[isWeapon ? 'striking' : 'resilient'] = second.tierKey;
    if (props.length) runeBlock.property = props.map((p) => String(p.id));

    const base = { name: host.name, price: host.price, material: host.material, traits: host.traits };
    const resolveFn = isWeapon ? resolveWeapon : resolveArmor;
    const fullPrice = resolveFn(base, { ...runeBlock, property: props }).price;
    return { sale: 'rune', saleId: newEntryUid(), ref: String(host.id), runes: runeBlock, fullPrice, price: discounted(fullPrice, discount) };
  }

  if (target === 'ring') {
    const cap = maxLevelForTarget(offering, 'ring');
    const host = pick(
      hostsOfKind(items, 'ring').filter(
        (it) => Array.isArray(it.variants) && it.variants.some((v) => v.level <= cap)
      ),
      rng
    );
    const grade = pick(host.variants.filter((v) => v.level <= cap), rng);
    const sockets = Number(grade.overrides?.ringSockets ?? host.ringSockets) || 0;
    const props = sampleDistinct(targetRunes, pickCount(sockets, rng), rng);

    const runeBlock = {};
    if (props.length) runeBlock.property = props.map((p) => String(p.id));
    const fullPrice = (Number(grade.price) || 0) + props.reduce((s, p) => s + (Number(p.price) || 0), 0);
    return { sale: 'rune', saleId: newEntryUid(), ref: String(host.id), level: grade.level, runes: runeBlock, fullPrice, price: discounted(fullPrice, discount) };
  }

  // accessory: a deliberate host + exactly one accessory rune it accepts.
  const hosts = hostsOfKind(items, 'accessory')
    .concat(hostsOfKind(items, 'shield'))
    .filter((it) => targetRunes.some((r) => accessoryEligible(it, r)));
  const host = pick(hosts, rng);
  const rune = pick(targetRunes.filter((r) => accessoryEligible(host, r)), rng);
  const fullPrice = (Number(host.price) || 0) + (Number(rune.price) || 0);
  return { sale: 'rune', saleId: newEntryUid(), ref: String(host.id), runes: { accessory: String(rune.id) }, fullPrice, price: discounted(fullPrice, discount) };
}

// ── Roll: scroll pack ────────────────────────────────────────────────────────
// Cast rank ← scroll item level (SCROLL_BY_RANK is a bijection over its levels),
// so a base (un-heightened) eligibleSpellItems entry — whose block carries no
// explicit rank — can still be grouped by the rank it fires at.
const SCROLL_RANK_BY_LEVEL = new Map(
  Object.entries(SCROLL_BY_RANK).map(([rank, row]) => [row.level, Number(rank)])
);

/**
 * Roll one 4-scroll pack from a scroll offering's window, or null when the
 * offering isn't a scroll offering or covers no spells. Returns the stored shape
 * `{ sale:'scrollpack', saleId, rank, scrolls:[4 × { spellRef, rank? }], fullPrice, price }`.
 * The four scrolls are drawn WITH REPLACEMENT (duplicates allowed — locked
 * decision); the pack sells at exactly 3/4 of four scrolls' price.
 */
export function rollScrollPack(offering, spells, rng = Math.random) {
  if (!isSpellItemWare(offering) || offering.spellItem !== 'scroll') return null;

  // Group eligible scrolls by the cast rank they fire at.
  const byRank = new Map();
  eligibleSpellItems(offering, spells).forEach((entry) => {
    const block = entry.scroll || {};
    const rank = block.rank != null ? Number(block.rank) : SCROLL_RANK_BY_LEVEL.get(entry.level);
    if (!Number.isInteger(rank) || !SCROLL_BY_RANK[rank]) return;
    if (!byRank.has(rank)) byRank.set(rank, []);
    byRank.get(rank).push(block);
  });
  const ranks = [...byRank.keys()];
  if (!ranks.length) return null;

  const rank = pick(ranks, rng);
  const pool = byRank.get(rank);
  const scrolls = [];
  for (let i = 0; i < 4; i += 1) {
    const block = pick(pool, rng);
    const scroll = { spellRef: block.spellRef };
    if (block.rank != null) scroll.rank = block.rank;
    scrolls.push(scroll);
  }
  const rankPrice = SCROLL_BY_RANK[rank].price;
  return { sale: 'scrollpack', saleId: newEntryUid(), rank, scrolls, fullPrice: 4 * rankPrice, price: 3 * rankPrice };
}

// ── Roll: whole shelf ────────────────────────────────────────────────────────
// Signature of a rune item for best-effort distinctness across a shelf (ref +
// grade + normalized rune ids). Property ids are sorted so slot order doesn't
// make two identical rune sets look distinct.
const runeItemSignature = (w) => {
  const r = w.runes || {};
  const props = [...(Array.isArray(r.property) ? r.property : [])].map(String).sort();
  return JSON.stringify([w.ref, w.level ?? null, r.potency ?? null, r.striking ?? r.resilient ?? null, r.accessory ?? null, props]);
};

/**
 * Roll a whole shelf for a shop, reading sale config off its offering wares:
 * `saleCount` (+ `saleDiscount`) on each rune-service offering, `salePacks` on
 * each scroll offering. Returns the `saleShelf` array (rune items then packs),
 * each with a fresh `saleId`. A reroll replaces the shelf wholesale, so this is
 * the sole producer of the stored array.
 */
export function rollSaleShelf(shopEntry, items, runes, spells, rng = Math.random) {
  const wares = Array.isArray(shopEntry?.wares) ? shopEntry.wares : [];
  const shelf = [];

  const seen = new Set();
  wares.filter(isRuneServiceWare).forEach((ware) => {
    const count = Math.floor(Number(ware.saleCount)) || 0;
    for (let i = 0; i < count; i += 1) {
      let chosen = null;
      for (let attempt = 0; attempt < DISTINCT_RETRIES; attempt += 1) {
        const cand = rollRuneSaleItem(ware, items, runes, rng);
        if (!cand) break; // nothing admissible — skip this slot
        chosen = cand;
        if (!seen.has(runeItemSignature(cand))) break; // fresh — keep it
      }
      if (chosen) { seen.add(runeItemSignature(chosen)); shelf.push(chosen); }
    }
  });

  wares.filter((w) => isSpellItemWare(w) && w.spellItem === 'scroll').forEach((ware) => {
    const count = Math.floor(Number(ware.salePacks)) || 0;
    for (let i = 0; i < count; i += 1) {
      const pack = rollScrollPack(ware, spells, rng);
      if (pack) shelf.push(pack);
    }
  });

  return shelf;
}

// ── Resolve for display ──────────────────────────────────────────────────────
// The rune-target a stored rune sale ware resolves as, keyed off its base item.
const saleRuneKind = (item) => {
  if (item.powerRing) return 'ring';
  if (item.strikes) return 'weapon';
  if (item.armor) return 'armor';
  return 'accessory';
};

// Resolve a property/ring rune id → its display name, through the property-rune
// catalog first, then the fundamental-rune table.
const runeName = (id, runeMap, fundMap) => {
  const doc = (runeMap && runeMap.get(String(id))) || fundMap.get(String(id));
  return doc && doc.name ? doc.name : null;
};

const resolveRuneSaleWare = (w, catalogMap, runeMap) => {
  const item = catalogMap.get(String(w.ref));
  // Drop a stale sale ware whose base item is gone or now never-sell (#1105).
  if (!item || isShopExcluded(item)) return null;

  // Merge the graded variant (ring) over the base, else drop the variants array.
  let base = { ...item };
  if (w.level != null && Array.isArray(item.variants)) {
    const variant = item.variants.find((v) => v.level === w.level);
    if (variant) { const { variants, ...b } = base; base = { ...b, ...variant }; }
  }
  if (Array.isArray(base.variants)) { const { variants, ...b } = base; base = b; }

  const runes = w.runes || {};
  const kind = saleRuneKind(base);
  const fundMap = fundamentalRuneMap();
  const propNames = (Array.isArray(runes.property) ? runes.property : [])
    .map((id) => runeName(id, runeMap, fundMap))
    .filter(Boolean);

  let name = base.name;
  if (kind === 'weapon') {
    name = buildWeaponName({ potency: runes.potency || 0, striking: runes.striking, properties: propNames, material: base.material, base: base.name });
  } else if (kind === 'armor') {
    name = buildArmorName({ potency: runes.potency || 0, resilient: runes.resilient, properties: propNames, material: base.material, base: base.name });
  } else if (kind === 'accessory' && runes.accessory != null) {
    const rn = runeName(runes.accessory, runeMap, fundMap);
    if (rn) name = `${rn} ${base.name}`;
  }

  return {
    ...base,
    id: `sale-${w.saleId}`,
    ref: String(w.ref),
    saleId: w.saleId,
    name,
    price: Number.isFinite(w.price) ? w.price : 0,
    saleFullPrice: w.fullPrice,
    runes,
    sale: 'rune',
    stock: 1,
    wareKey: `sale:${w.saleId}`,
  };
};

const SCROLL_PACK_TRAITS = ['Consumable', 'Magical', 'Scroll'];

const resolveScrollPackWare = (w, catalogMap, spells) => {
  const scrolls = Array.isArray(w.scrolls) ? w.scrolls : [];
  if (!scrolls.length) return null; // no contents ⇒ stale, drop like any dead ref
  const spellMap = new Map((Array.isArray(spells) ? spells : []).map((s) => [String(s.id), s]));
  const names = scrolls.map((s) => spellMap.get(String(s.spellRef))?.name || '(unknown spell)');
  const art = baseSpellItemArt('scroll', catalogMap);
  return {
    id: `sale-${w.saleId}`,
    saleId: w.saleId,
    name: `Scroll Pack (Rank ${w.rank})`,
    description: `A pack of four scrolls: ${names.join(', ')}.`,
    traits: [...SCROLL_PACK_TRAITS],
    price: Number.isFinite(w.price) ? w.price : 0,
    saleFullPrice: w.fullPrice,
    scrolls,
    sale: 'scrollpack',
    stock: 1,
    wareKey: `sale:${w.saleId}`,
    ...(art ? { image: art.image, ...(art.imagePosition != null ? { imagePosition: art.imagePosition } : {}) } : {}),
  };
};

/**
 * Resolve a shop's stored sale wares into display items shaped like
 * resolveShopWares output, so groupWares / the cart treat them uniformly. Each
 * carries a distinct `id` (`sale-<saleId>`) so it groups as its own single-form
 * entry, `stock: 1`, `wareKey: 'sale:<saleId>'`, the discounted `price` with the
 * `saleFullPrice` strike-through, and a `sale` marker for the S3 badge. A ware
 * whose refs no longer resolve is dropped, same as a stale regular ware.
 */
export function resolveSaleWares(loreId, shops, catalogMap, runeMap, spells) {
  const shelf = shops && loreId != null ? shops[loreId]?.saleShelf : null;
  if (!Array.isArray(shelf) || !catalogMap) return [];
  return shelf
    .map((w) => {
      if (!w) return null;
      if (w.sale === 'scrollpack') return resolveScrollPackWare(w, catalogMap, spells);
      if (w.sale === 'rune') return resolveRuneSaleWare(w, catalogMap, runeMap);
      return null;
    })
    .filter(Boolean);
}
