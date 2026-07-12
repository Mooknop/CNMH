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
  eligibleAugmentations,
  eligibleSpellItems,
  isRuneServiceWare,
  isSpellItemWare,
  shopHostKind,
  isShopExcluded,
} from './shopUtils';
import { augmentationFits } from './augmentations';

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

// ── Augmentations on sale items (#1404) ──────────────────────────────────────
// An augmentation rides ORTHOGONALLY on a rune sale item, exactly as it does on an
// inventory entry (#1202): `saleItem.augmentation = { ref, choice? }` beside the
// `runes` block, its price folded into fullPrice. Both the random roll and the GM
// editor produce that same shape; expandWare/resolveInventoryItem then carry it
// into inventory unchanged.

// Default chance a rolled item that CAN take an admitted augmentation gets one; a
// per-offering `saleAugmentChance` (0..1) overrides. Gated on the offering actually
// admitting a fitting augmentation, so a shop with no augmentation service (and every
// existing roll, whose item pool has no augmentation docs) is untouched — no augment,
// no extra RNG draw, identical sequence.
const AUGMENT_ROLL_CHANCE = 0.25;
const augmentRollChance = (offering) => {
  const v = Number(offering && offering.saleAugmentChance);
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : AUGMENT_ROLL_CHANCE;
};

// The augmentations an offering admits that fit `hostItem` (target + shield size
// gate). Empty until U3 seeds augmentations / the shop offers the service.
const fittingSaleAugmentations = (offering, hostItem, items) =>
  eligibleAugmentations(offering, items).filter((a) => augmentationFits(hostItem, a));

// Roll an augmentation onto a host, or null. Returns `{ ref, choice?, price }`
// (price for folding into the sale total). No RNG is consumed when nothing is
// admissible or the chance is 0, so it can't perturb an aug-free roll's sequence.
const rollSaleAugmentation = (offering, hostItem, items, rng) => {
  const chance = augmentRollChance(offering);
  if (chance <= 0) return null;
  const pool = fittingSaleAugmentations(offering, hostItem, items);
  if (!pool.length) return null;
  if (rng() >= chance) return null;
  const aug = pick(pool, rng);
  const out = { ref: String(aug.id), price: Number(aug.price) || 0 };
  if (Array.isArray(aug.choices) && aug.choices.length) out.choice = pick(aug.choices, rng);
  return out;
};

// Fold a rolled/selected augmentation into a built sale item: attach the `{ ref,
// choice? }` binding and add its price to fullPrice/price. Identity when `aug` is
// null. `aug` carries `price`; the stored binding drops it.
const withSaleAugmentation = (saleItem, aug, discount) => {
  if (!saleItem || !aug) return saleItem;
  const binding = { ref: String(aug.ref) };
  if (aug.choice != null) binding.choice = aug.choice;
  const fullPrice = (Number(saleItem.fullPrice) || 0) + (Number(aug.price) || 0);
  return { ...saleItem, augmentation: binding, fullPrice, price: discounted(fullPrice, discount) };
};

// Resolve a GM-selected `sel.augmentation` ({ ref, choice? }) against the offering's
// admitted set and the chosen host, returning the `{ ref, choice?, price }` shape
// withSaleAugmentation folds — or null when it isn't offered / doesn't fit.
const selectedSaleAugmentation = (offering, sel, hostItem, items) => {
  const pick_ = sel && sel.augmentation;
  if (!pick_ || pick_.ref == null || !hostItem) return null;
  const form = fittingSaleAugmentations(offering, hostItem, items)
    .find((a) => String(a.id) === String(pick_.ref));
  if (!form) return null;
  const out = { ref: String(form.id), price: Number(form.price) || 0 };
  if (pick_.choice != null && Array.isArray(form.choices) && form.choices.map(String).includes(String(pick_.choice))) {
    out.choice = pick_.choice;
  }
  return out;
};

// The window-admitted PROPERTY runes (ring + accessory runes are `type:'property'`
// too), grouped by lowercased target — reusing eligibleRunes so the level/rarity/
// target window is honored exactly as the Runesmithing tab sees it.
export const admittedRunesByTarget = (offering, runes) => {
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
export const hostsOfKind = (items, kind) =>
  (Array.isArray(items) ? items : []).filter(
    (it) => it && it.id != null && !isShopExcluded(it) && shopHostKind(it) === kind
  );

// The rune-target a base item resolves as, keyed off its own fields (the same
// classification saleRuneKind applies to a resolved base). Used by both the
// display resolver and the manual builder.
const runeHostKind = (item) =>
  item.powerRing ? 'ring' : item.strikes ? 'weapon' : item.armor ? 'armor' : 'accessory';

// The fundamental tiers that fit a level cap for a weapon/armor target:
// `potency` (required) and `second` (striking | resilient, optional). Empty for
// ring/accessory targets, which carry no fundamentals.
export const fundamentalTiersForTarget = (target, cap) => {
  if (target !== 'weapon' && target !== 'armor') return { potency: [], second: [] };
  const isWeapon = target === 'weapon';
  return {
    potency: (isWeapon ? WEAPON_POTENCY_TIERS : ARMOR_POTENCY_TIERS).filter((t) => t.level <= cap),
    second: (isWeapon ? WEAPON_STRIKING_TIERS : ARMOR_RESILIENT_TIERS).filter((t) => t.level <= cap),
  };
};

// The baked full price of a runed base, shared by the random roll and the manual
// builder so both price identically. `base` carries `price` (+ name/material/
// traits for weapon/armor); `propDocs` are the resolved property/accessory rune
// DOCS (weapon/armor feed the #548 resolvers; ring/accessory sum base + rune).
const priceRuneWare = (kind, base, runeBlock, propDocs) => {
  if (kind === 'weapon' || kind === 'armor') {
    const resolveFn = kind === 'weapon' ? resolveWeapon : resolveArmor;
    return resolveFn(base, { ...runeBlock, property: propDocs }).price;
  }
  return (Number(base.price) || 0) + propDocs.reduce((s, p) => s + (Number(p.price) || 0), 0);
};

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
    const fullPrice = priceRuneWare(target, base, runeBlock, props);
    const item = { sale: 'rune', saleId: newEntryUid(), ref: String(host.id), runes: runeBlock, fullPrice, price: discounted(fullPrice, discount) };
    return withSaleAugmentation(item, rollSaleAugmentation(offering, host, items, rng), discount);
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
    const fullPrice = priceRuneWare('ring', grade, runeBlock, props);
    return { sale: 'rune', saleId: newEntryUid(), ref: String(host.id), level: grade.level, runes: runeBlock, fullPrice, price: discounted(fullPrice, discount) };
  }

  // accessory: a deliberate host + exactly one accessory rune it accepts.
  const hosts = hostsOfKind(items, 'accessory')
    .concat(hostsOfKind(items, 'shield'))
    .filter((it) => targetRunes.some((r) => accessoryEligible(it, r)));
  const host = pick(hosts, rng);
  const rune = pick(targetRunes.filter((r) => accessoryEligible(host, r)), rng);
  const fullPrice = priceRuneWare('accessory', host, {}, [rune]);
  const item = { sale: 'rune', saleId: newEntryUid(), ref: String(host.id), runes: { accessory: String(rune.id) }, fullPrice, price: discounted(fullPrice, discount) };
  return withSaleAugmentation(item, rollSaleAugmentation(offering, host, items, rng), discount);
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
const saleRuneKind = runeHostKind;

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
  } else if (kind === 'ring' && propNames.length) {
    // A ring has no fundamental potency, so its runes never enter a #548-style
    // name. Prefix them onto the graded base so the shelf reads what it is —
    // e.g. "Spellstoring Power Ring (Iron)".
    name = `${propNames.join(' ')} ${base.name}`;
  } else if (kind === 'accessory' && runes.accessory != null) {
    const rn = runeName(runes.accessory, runeMap, fundMap);
    if (rn) name = `${rn} ${base.name}`;
  }

  // Inline the augmentation doc (#1404) so the sale-card preview shows its detail
  // (the U1 ItemModal section reads `augmentation.name`), and note it in the name.
  // The stored binding is `{ ref, choice? }`; expandWare reconstructs it on purchase.
  let augmentation;
  if (w.augmentation && w.augmentation.ref != null) {
    const augDoc = catalogMap.get(String(w.augmentation.ref));
    if (augDoc) {
      augmentation = w.augmentation.choice != null ? { ...augDoc, choice: w.augmentation.choice } : { ...augDoc };
      name = `${name} + ${augDoc.name}`;
    }
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
    ...(augmentation ? { augmentation } : {}),
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

// ── Manual build + per-item reroll (per-item customization) ───────────────────
// The GM can hand-author a shelf slot instead of taking the random roll: pick a
// base item + runes (rune gear) or a rank + four spells (scroll pack). These
// builders emit the SAME baked shape and pricing as the roll functions (shared
// priceRuneWare / SCROLL_BY_RANK) at the offering's discount, and preserve the
// caller's saleId so a slot keeps its identity across an edit.

/**
 * Build one runed sale ware from explicit GM selections, or null when the base /
 * runes don't resolve against the offering's window. `sel` is
 * `{ ref, level?, runes:{ potency?, striking?|resilient?, property?:[ids], accessory?:id } }`;
 * property/accessory ids must be admitted by the offering, else they're dropped.
 */
export function buildRuneSaleItem(offering, saleId, sel, items, runeDocs) {
  if (!isRuneServiceWare(offering) || !sel || sel.ref == null) return null;
  const item = (Array.isArray(items) ? items : []).find(
    (it) => it && it.id != null && String(it.id) === String(sel.ref)
  );
  if (!item || isShopExcluded(item)) return null;

  const kind = runeHostKind(item);
  const discount = clampDiscount(offering.saleDiscount);
  const admitted = admittedRunesByTarget(offering, runeDocs).get(kind) || [];
  const byId = new Map(admitted.map((r) => [String(r.id), r]));
  const runes = sel.runes || {};
  const propDocs = (Array.isArray(runes.property) ? runes.property : [])
    .map((id) => byId.get(String(id)))
    .filter(Boolean);

  const runeBlock = {};
  if (kind === 'weapon' || kind === 'armor') {
    if (runes.potency) runeBlock.potency = Number(runes.potency);
    const secondKey = kind === 'weapon' ? 'striking' : 'resilient';
    if (runes[secondKey]) runeBlock[secondKey] = runes[secondKey];
    if (propDocs.length) runeBlock.property = propDocs.map((p) => String(p.id));
    const base = { name: item.name, price: item.price, material: item.material, traits: item.traits };
    const fullPrice = priceRuneWare(kind, base, runeBlock, propDocs);
    const saleItem = { sale: 'rune', saleId, ref: String(item.id), runes: runeBlock, fullPrice, price: discounted(fullPrice, discount) };
    return withSaleAugmentation(saleItem, selectedSaleAugmentation(offering, sel, item, items), discount);
  }

  if (kind === 'ring') {
    if (!Array.isArray(item.variants)) return null;
    const grade = item.variants.find((v) => v.level === sel.level);
    if (!grade) return null;
    if (propDocs.length) runeBlock.property = propDocs.map((p) => String(p.id));
    const fullPrice = priceRuneWare('ring', grade, runeBlock, propDocs);
    const saleItem = { sale: 'rune', saleId, ref: String(item.id), level: grade.level, runes: runeBlock, fullPrice, price: discounted(fullPrice, discount) };
    return withSaleAugmentation(saleItem, selectedSaleAugmentation(offering, sel, item, items), discount);
  }

  // accessory: exactly one accessory rune the host accepts.
  const rune = byId.get(String(runes.accessory));
  if (!rune || !accessoryEligible(item, rune)) return null;
  const fullPrice = priceRuneWare('accessory', item, {}, [rune]);
  const saleItem = { sale: 'rune', saleId, ref: String(item.id), runes: { accessory: String(rune.id) }, fullPrice, price: discounted(fullPrice, discount) };
  return withSaleAugmentation(saleItem, selectedSaleAugmentation(offering, sel, item, items), discount);
}

/**
 * Build one four-scroll pack from an explicit rank + spell choices, or null when
 * the offering isn't a scroll offering / the rank covers no eligible spells.
 * `sel` is `{ rank, scrolls:[spellRef,…] }` (duplicates allowed); the list is
 * padded/trimmed to four with the first eligible spell. Prices at 3/4 like the roll.
 */
export function buildScrollPackWare(offering, saleId, sel, spells) {
  if (!isSpellItemWare(offering) || offering.spellItem !== 'scroll') return null;
  const rank = Number(sel?.rank);
  if (!Number.isInteger(rank) || !SCROLL_BY_RANK[rank]) return null;

  // Eligible scroll blocks at this rank, keyed by spellRef.
  const byRef = new Map();
  eligibleSpellItems(offering, spells).forEach((entry) => {
    const block = entry.scroll || {};
    const r = block.rank != null ? Number(block.rank) : SCROLL_RANK_BY_LEVEL.get(entry.level);
    if (r !== rank) return;
    byRef.set(String(block.spellRef), block);
  });
  if (!byRef.size) return null;
  const fallback = byRef.values().next().value;

  const refs = Array.isArray(sel.scrolls) ? sel.scrolls : [];
  const scrolls = [];
  for (let i = 0; i < 4; i += 1) {
    const block = byRef.get(String(refs[i])) || fallback;
    const scroll = { spellRef: block.spellRef };
    if (block.rank != null) scroll.rank = block.rank;
    scrolls.push(scroll);
  }
  const rankPrice = SCROLL_BY_RANK[rank].price;
  return { sale: 'scrollpack', saleId, rank, scrolls, fullPrice: 4 * rankPrice, price: 3 * rankPrice };
}

/**
 * Reroll a single shelf slot in place: return a NEW shelf array with only the
 * `saleId` slot replaced by a fresh roll from its originating offering (found on
 * `shopEntry.wares`), keeping the same saleId + position. Unchanged when the slot
 * is missing or nothing admissible rolls.
 */
export function rerollSaleItem(shopEntry, saleId, items, runes, spells, rng = Math.random) {
  const shelf = Array.isArray(shopEntry?.saleShelf) ? shopEntry.saleShelf : [];
  const wares = Array.isArray(shopEntry?.wares) ? shopEntry.wares : [];
  const idx = shelf.findIndex((w) => w && w.saleId === saleId);
  if (idx < 0) return shelf;

  const cur = shelf[idx];
  let next = null;
  if (cur.sale === 'rune') {
    const off = wares.find(isRuneServiceWare);
    if (off) next = rollRuneSaleItem(off, items, runes, rng);
  } else if (cur.sale === 'scrollpack') {
    const off = wares.find((w) => isSpellItemWare(w) && w.spellItem === 'scroll');
    if (off) next = rollScrollPack(off, spells, rng);
  }
  if (!next) return shelf;

  const out = shelf.slice();
  out[idx] = { ...next, saleId };
  return out;
}

// ── Editor option enumerators ────────────────────────────────────────────────
/**
 * The per-target choices a rune-item editor offers, constrained to the offering's
 * window. Keyed by target → `{ hosts, potency?, second?, properties? }` (weapon/
 * armor carry fundamentals + property runes; ring carries graded hosts + property
 * runes; accessory carries hosts each with the runes they accept). A target is
 * omitted when it can't produce an item right now.
 */
export function saleRuneEditOptions(offering, items, runes) {
  if (!isRuneServiceWare(offering)) return {};
  const admitted = admittedRunesByTarget(offering, runes);
  const out = {};
  offeringTargets(offering).forEach((target) => {
    const targetRunes = admitted.get(target) || [];
    const cap = maxLevelForTarget(offering, target);

    if (target === 'weapon' || target === 'armor') {
      const hosts = hostsOfKind(items, target);
      const { potency, second } = fundamentalTiersForTarget(target, cap);
      if (!hosts.length || !potency.length) return;
      out[target] = {
        hosts: hosts.map((h) => ({ id: String(h.id), name: h.name })),
        potency: potency.map((t) => ({ tier: t.tier, name: t.name, level: t.level })),
        second: second.map((t) => ({ key: t.tierKey, name: t.name, level: t.level })),
        properties: targetRunes.map((r) => ({ id: String(r.id), name: r.name })),
      };
    } else if (target === 'ring') {
      const hosts = hostsOfKind(items, 'ring')
        .filter((it) => Array.isArray(it.variants) && it.variants.some((v) => v.level <= cap));
      if (!hosts.length) return;
      out.ring = {
        hosts: hosts.map((h) => ({
          id: String(h.id),
          name: h.name,
          variants: h.variants.filter((v) => v.level <= cap).map((v) => ({ level: v.level, name: v.name })),
        })),
        properties: targetRunes.map((r) => ({ id: String(r.id), name: r.name })),
      };
    } else {
      const hosts = hostsOfKind(items, 'accessory')
        .concat(hostsOfKind(items, 'shield'))
        .filter((it) => targetRunes.some((r) => accessoryEligible(it, r)));
      if (!hosts.length) return;
      out.accessory = {
        hosts: hosts.map((h) => ({
          id: String(h.id),
          name: h.name,
          runes: targetRunes.filter((r) => accessoryEligible(h, r)).map((r) => ({ id: String(r.id), name: r.name })),
        })),
      };
    }
  });
  return out;
}

/**
 * The scroll-pack editor's rank options: `[{ rank, spells:[{ id, name }] }]`
 * (rank-ascending), each rank listing the eligible spells drawn from the
 * offering's window. Empty for a non-scroll offering / no eligible spells.
 */
export function saleScrollPackOptions(offering, spells) {
  if (!isSpellItemWare(offering) || offering.spellItem !== 'scroll') return [];
  const spellMap = new Map((Array.isArray(spells) ? spells : []).map((s) => [String(s.id), s]));
  const byRank = new Map();
  eligibleSpellItems(offering, spells).forEach((entry) => {
    const block = entry.scroll || {};
    const rank = block.rank != null ? Number(block.rank) : SCROLL_RANK_BY_LEVEL.get(entry.level);
    if (!Number.isInteger(rank) || !SCROLL_BY_RANK[rank]) return;
    if (!byRank.has(rank)) byRank.set(rank, new Map());
    const m = byRank.get(rank);
    const ref = String(block.spellRef);
    if (!m.has(ref)) m.set(ref, spellMap.get(ref)?.name || '(unknown spell)');
  });
  return [...byRank.keys()]
    .sort((a, b) => a - b)
    .map((rank) => ({
      rank,
      spells: [...byRank.get(rank)].map(([id, name]) => ({ id, name })),
    }));
}
