import { buildChildrenMap, getChildren } from './loreUtils';
import { isRunestoneEntry, resolveRunestone } from './runestone';
import { resolveScroll, resolveWand, castRank, SCROLL_BY_RANK, WAND_BY_RANK } from './spellItems';
import { getItemRarity } from './InventoryUtils';

// Shop selectors over the app-managed wares store `cnmh_shops_global` (#696 S1).
//
// A "shop" is a Location lore entry that has an entry in the store with at least
// one ware: `shops[loreId] = { wares: [{ ref, price?, stock? }] }`. The `shop`
// lore tag is flavor only — the store is the source of truth, since wares are
// authored in-app (GM editor, S2), not in the read-only lore vault.

// True when `loreId` has ≥1 ware in the store. This is the player-facing
// predicate (a shop is worth browsing only when it has something to sell).
export function isShop(loreId, shops) {
  const wares = shops && loreId != null ? shops[loreId]?.wares : null;
  return Array.isArray(wares) && wares.length > 0;
}

// True when `loreId` has a store entry at all, regardless of ware count — the
// GM editor's "is a shop" (#822 S1). A shop is declared explicitly ("Set up as
// shop") and can exist with zero wares, so the editor keys off entry presence,
// not isShop's ≥1-ware test.
export function isSetUp(loreId, shops) {
  return !!(shops && loreId != null && shops[loreId]);
}

// True when the shop is revealed to players (#822). Legacy entries authored
// before the field existed have no `revealed` key and default to visible, so
// they don't vanish; only an explicit `revealed:false` hides a shop.
export function isShopRevealed(loreId, shops) {
  const entry = shops && loreId != null ? shops[loreId] : null;
  return !!entry && entry.revealed !== false;
}

// True when the shop is open for trading (#822). Legacy entries with no `open`
// key default to open; only an explicit `open:false` marks a shop closed.
export function isShopOpen(loreId, shops) {
  const entry = shops && loreId != null ? shops[loreId] : null;
  return !!entry && entry.open !== false;
}

// True when the shop offers spellcasting services — gating the player
// Spellcasting tab (#857 S1). An explicit boolean `offersSpellcasting` wins;
// when the key is absent it DERIVES from stock — a shop with ≥1 generative
// scroll/wand offering (#812) is treated as offering spellcasting, so shops that
// already stock arcana surface the tab without re-authoring. Unlike the static
// revealed/open defaults, the fallback is computed, not a fixed value. Once a GM
// saves a shop in the post-S1 editor the flag is written explicitly and owns the
// answer; the derived fallback only covers pre-S1 entries that are never re-saved.
export function shopOffersSpellcasting(loreId, shops) {
  const entry = shops && loreId != null ? shops[loreId] : null;
  if (!entry) return false;
  if (typeof entry.offersSpellcasting === 'boolean') return entry.offersSpellcasting;
  return spellItemOfferings(loreId, shops).length > 0;
}

// True when the shop offers runesmithing — gating the player Runesmithing tab
// (#857 S1). An explicit boolean `offersRunes` wins; when absent it DERIVES from
// stock — a shop with ≥1 Runestone ware (#801) is treated as offering runes, so
// existing rune-stocking shops keep the feature. Same explicit-wins-else-derived
// shape as shopOffersSpellcasting.
export function shopOffersRunes(loreId, shops) {
  const entry = shops && loreId != null ? shops[loreId] : null;
  if (!entry) return false;
  if (typeof entry.offersRunes === 'boolean') return entry.offersRunes;
  const wares = Array.isArray(entry.wares) ? entry.wares : [];
  return wares.some(isRunestoneEntry);
}

// Shop-flagged direct children of the current location that players may see,
// title-sorted (reuses the containment `parent` edge via loreUtils). `entries`
// is the full lore list. A child is included only when it both has wares
// (isShop) and is revealed (#822): an explicit `revealed:false` hides it; a
// legacy shop with no `revealed` field stays visible. A closed shop is NOT
// filtered here — it still appears, but as not-trading (see isShopOpen / the
// storefront closed state).
export function getShopsForLocation(locationId, entries, shops) {
  if (!locationId || !shops) return [];
  const childrenMap = buildChildrenMap(entries);
  return getChildren({ id: locationId }, childrenMap).filter(
    (e) => isShop(e.id, shops) && isShopRevealed(e.id, shops)
  );
}

// Resolve a shop's wares into displayable items: each ware `ref` → catalog item,
// with `price` overridden when the ware sets one (else the variant/catalog price)
// and `stock` carried through when present. Unresolved refs are dropped.
//
// A ware may pin a `level` to stock a specific variant of a multi-level item
// (#798): the matching `variants[]` entry is merged over the base (name/price/
// effect/consumable — same merge as resolveInventoryItem) and the `variants`
// array is dropped from the resolved ware. Every resolved ware carries a
// `wareKey` that is unique per stocked variant — the bare `ref` for a flat item,
// `"${ref}@${level}"` for a variant — so the cart and React/test keys don't
// collide when a shop stocks two variants of the same item (both share `id`).
//
// A rune sold as a Runestone (#801) is a `{ ref: 'runestone', runeRef }` ware:
// resolved from the rune catalog (`runeMap`) via R1's resolveRunestone into a
// runestone display item (name/value = stone + rune), with a per-rune wareKey.
export function resolveShopWares(loreId, shops, catalogMap, runeMap) {
  const wares = shops && loreId != null ? shops[loreId]?.wares : null;
  if (!Array.isArray(wares) || !catalogMap) return [];
  return wares
    .map((w) => {
      // Generative spell-item offerings (#812 S6) are surfaced separately via
      // spellItemOfferings/eligibleSpellItems (the Spellcasting Services tab) —
      // never expanded into the flat wares list, which would flood it.
      if (isSpellItemWare(w)) return null;
      if (!w || w.ref == null) return null;

      if (isRunestoneEntry(w)) {
        const resolved = resolveRunestone({ ref: 'runestone', runeRef: w.runeRef }, runeMap);
        const override = typeof w.price === 'number' && Number.isFinite(w.price) ? w.price : null;
        if (override != null) resolved.price = override;
        resolved.wareKey = w.runeRef != null ? `runestone@${w.runeRef}` : 'runestone';
        if (w.stock != null) resolved.stock = w.stock;
        return resolved;
      }

      const item = catalogMap.get(String(w.ref));
      if (!item) return null;

      let resolved = { ...item };
      let wareKey = String(w.ref);
      if (w.level != null && Array.isArray(item.variants)) {
        const variant = item.variants.find((v) => v.level === w.level);
        if (variant) {
          const { variants, ...base } = resolved;
          resolved = { ...base, ...variant };
          wareKey = `${w.ref}@${w.level}`;
        }
      }

      // Keep the catalog item's own name as `baseName` so groupWares can
      // headline a multi-form ladder by its base ("Tonic") rather than the
      // cheapest variant's merged name ("Minor Tonic") (#880).
      resolved.baseName = item.name;
      const override = typeof w.price === 'number' && Number.isFinite(w.price) ? w.price : null;
      const price = override != null ? override : resolved.price;
      resolved.price = Number.isFinite(price) ? price : 0;
      resolved.wareKey = wareKey;
      if (w.stock != null) resolved.stock = w.stock;
      return resolved;
    })
    .filter(Boolean);
}

// ── Generative spell-item offerings (#812 S6) ───────────────────────────────
// A shop can sell a Scroll/Wand of ANY catalog spell up to an ITEM LEVEL, filtered
// by tradition and rarity — priced from the base-template resolver (spellItems.js)
// rather than enumerating one catalog item per spell. The authored ware is the
// compact spec `{ spellItem:'scroll'|'wand', maxLevel, traditions?, rarities?,
// priceMod? }`; selectors below expand it on demand. The cap is the derived item
// level (not the spell rank), so a single cap is fair across kinds: a rank-2 wand
// (item level 5) is gated higher than a rank-2 scroll (item level 3). The buyer's
// own tradition access is NOT a filter here — that stays the cast-time check; the
// shop simply decides what it stocks.

const ALL_TRADITIONS = ['arcane', 'divine', 'occult', 'primal'];
const SPELL_ITEM_TABLE = { scroll: SCROLL_BY_RANK, wand: WAND_BY_RANK };
const BULK_L_WEIGHT = 0.1; // Bulk L, as finishItem stores it.

// The highest cast rank whose derived scroll/wand item level is ≤ maxLevel, for a
// kind. 0 when even the rank-1 item exceeds maxLevel (a wand needs item level ≥ 3,
// so maxLevel 1–2 yields no wands — the asymmetry that makes a level cap fairer
// than a rank cap). Inherently bounded by the table maxima (scroll 10 / wand 9),
// since it only considers ranks the base-template table actually prices.
export function maxRankForLevel(kind, maxLevel) {
  const table = SPELL_ITEM_TABLE[kind];
  const lvl = Number(maxLevel);
  if (!table || !Number.isFinite(lvl)) return 0;
  let best = 0;
  for (const [rank, row] of Object.entries(table)) {
    if (row.level <= lvl) best = Math.max(best, Number(rank));
  }
  return best;
}

// A ware is a generative spell-item offering (not a flat item/runestone ref).
export function isSpellItemWare(w) {
  return !!(w && (w.spellItem === 'scroll' || w.spellItem === 'wand'));
}

// Tradition filter: an explicit non-empty list, else all four. (Empty/unset = all.)
const offeringTraditions = (ware) => {
  const t = Array.isArray(ware.traditions) ? ware.traditions.filter(Boolean) : [];
  return t.length ? t.map((x) => String(x).toLowerCase()) : ALL_TRADITIONS;
};

// Rarity filter: an explicit non-empty list, else COMMON ONLY. Note the
// deliberate asymmetry with traditions — a shop must opt in to uncommon/rare.
const offeringRarities = (ware) => {
  const r = Array.isArray(ware.rarities) ? ware.rarities.filter(Boolean) : [];
  return r.length ? r.map((x) => String(x).toLowerCase()) : ['common'];
};

// A spell's rarity (lowercased); common when it carries no rarity trait.
const spellRarity = (spell) => String(getItemRarity(spell) || 'common').toLowerCase();

const isCantrip = (spell) =>
  Array.isArray(spell.traits) && spell.traits.some((t) => String(t).toLowerCase() === 'cantrip');

// The just spell-item offerings on a shop, in authored order, each tagged with a
// stable `offeringKey` for React/test keys + the S8 summary rows.
export function spellItemOfferings(loreId, shops) {
  const wares = shops && loreId != null ? shops[loreId]?.wares : null;
  if (!Array.isArray(wares)) return [];
  return wares.filter(isSpellItemWare).map((w) => ({
    ...w,
    offeringKey: `${w.spellItem}:${Number(w.maxLevel) || 0}:${offeringTraditions(w).join('+')}:${offeringRarities(w).join('+')}`,
  }));
}

// Expand one offering into the list of purchasable, resolved scroll/wand items
// it covers. A spell is kept when ALL hold: its derived item level ≤ maxLevel
// (i.e. its cast rank ∈ [1 .. maxRankForLevel]), it shares ≥1 tradition with the
// filter, its rarity is allowed, and it is neither a focus spell nor a cantrip.
// Each entry is a minimal, re-resolvable item ({ scroll|wand: { spellRef } } +
// S1/S2-derived name/level/price/bulk/traits, the spell's rarity stamped on)
// with a stable distinct `wareKey`, so the cart + useBuyItems treat it like any
// other ware (reuid clones it; finishItem re-derives on resolution).
export function eligibleSpellItems(ware, spells) {
  if (!isSpellItemWare(ware)) return [];
  const kind = ware.spellItem;
  const cap = maxRankForLevel(kind, ware.maxLevel);
  if (cap < 1) return [];

  const trads = offeringTraditions(ware);
  const rars = offeringRarities(ware);
  const resolveFn = kind === 'scroll' ? resolveScroll : resolveWand;
  const mod = typeof ware.priceMod === 'number' && Number.isFinite(ware.priceMod) && ware.priceMod > 0
    ? ware.priceMod
    : null;

  const out = [];
  for (const spell of Array.isArray(spells) ? spells : []) {
    if (!spell || isCantrip(spell)) continue;
    const spellTrads = Array.isArray(spell.traditions) ? spell.traditions : null;
    if (!spellTrads || spellTrads.length === 0) continue; // focus spell — no scroll/wand pricing

    const rank = castRank(spell, {});
    if (rank == null || rank < 1 || rank > cap) continue;
    if (!spellTrads.some((t) => trads.includes(String(t).toLowerCase()))) continue;
    if (!rars.includes(spellRarity(spell))) continue;

    const derived = resolveFn(spell, {});
    // A scroll/wand inherits its spell's rarity — stamp the rarity trait on.
    const rarityTrait = getItemRarity(spell);
    const traits = rarityTrait ? [rarityTrait, ...derived.traits] : [...derived.traits];
    const price = mod != null ? Math.round(derived.price * mod) : derived.price;

    out.push({
      id: `${kind}-of-${spell.id}`,
      name: derived.name,
      level: derived.level,
      price,
      weight: BULK_L_WEIGHT,
      traits,
      [kind]: { spellRef: String(spell.id) },
      wareKey: `${kind}:${spell.id}`,
    });
  }
  return out;
}

// A human-readable coverage summary for one spell-item offering plus its live
// eligible-spell count, shared by the GM authoring preview (#819) and the player
// Spellcasting Services tab (#820). Mirrors the offering defaults exactly:
// traditions empty = all four; rarities empty = common only.
//   → { kind, maxLevel, cap, count, traditions[], rarities[], text }
// where `cap` is the derived top cast rank and `text` is e.g. "Wands ·
// arcane/occult · common+uncommon · up to item level 11 · 23 eligible spells".
export function spellOfferingSummary(ware, spells) {
  const kind = ware && ware.spellItem === 'wand' ? 'wand' : 'scroll';
  const maxLevel = Math.max(1, Number(ware?.maxLevel) || 1);
  const cap = maxRankForLevel(kind, maxLevel);
  const traditions = offeringTraditions(ware || {});
  const rarities = offeringRarities(ware || {});
  const count = eligibleSpellItems(ware, spells).length;
  const tradLabel = traditions.length === ALL_TRADITIONS.length ? 'all traditions' : traditions.join('/');
  const text = `${kind === 'scroll' ? 'Scrolls' : 'Wands'} · ${tradLabel} · ${rarities.join('+')} · up to item level ${maxLevel} · ${count} eligible spell${count === 1 ? '' : 's'}`;
  return { kind, maxLevel, cap, count, traditions, rarities, text };
}

// ── Player browse grouping (#857 S2) ────────────────────────────────────────
// Collapse resolved wares (resolveShopWares output) that share one catalog item
// into a single browse entry, so a multi-variant item (e.g. Healing Potion
// Minor/Lesser/Moderate) shows once with an add button per stocked form. The
// grouping key is the resolved `id`: variants of one item share it (tonic@1 and
// tonic@3 are both id 'tonic'), while a Runestone (id 'runestone-<rune>', #801)
// and a generative scroll/wand (id '<kind>-of-<spell>', #812) each carry a
// distinct id and so stay their own single-form group. Group order follows first
// appearance; forms sort cheapest-first to match the headline `from` price.
//
// Each form is the untouched resolved ware — it keeps its `wareKey`, so
// shopCart/useBuyItems add and price it exactly as the flat list does. The group
// `traits`/`description` are taken from the cheapest form. The headline `name`
// is the catalog item's `baseName` for a multi-form group (so a renamed Tonic
// ladder reads "Tonic", not "Minor Tonic" — #880) and the cheapest form's own
// name for a single-form group (the per-form label/level disambiguates in the UI).
export function groupWares(resolvedWares) {
  const order = [];
  const byId = new Map();
  (Array.isArray(resolvedWares) ? resolvedWares : []).forEach((ware) => {
    if (!ware || ware.id == null) return;
    const key = String(ware.id);
    if (!byId.has(key)) {
      byId.set(key, []);
      order.push(key);
    }
    byId.get(key).push(ware);
  });
  return order.map((key) => {
    const forms = byId
      .get(key)
      .slice()
      .sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
    const head = forms[0];
    const name = forms.length > 1 && head.baseName ? head.baseName : head.name;
    return {
      ref: key,
      name,
      traits: Array.isArray(head.traits) ? head.traits : [],
      description: head.description,
      // The cheapest form's R2 image (#881) — variants of one item share the
      // base item's art, so the headline crest renders it when present.
      image: head.image,
      imagePosition: head.imagePosition,
      forms,
      from: Number(head.price) || 0,
      formCount: forms.length,
    };
  });
}

// Map an item's traits to its chip-accent token (#857 S2), matching the design
// handoff's accentFor precedence exactly: Scroll/Wand/Magical → arcane; Healing
// → verdant; Weapon/Armor/Shield → iron; Alchemical → verdant; else gold. (Order
// matters — Healing beats the iron group, Alchemical loses to it.) Returns the
// bare token name; callers theme with `var(--${name})`.
export function traitAccent(item) {
  const traits = item && Array.isArray(item.traits) ? item.traits : [];
  const has = (t) => traits.includes(t);
  if (has('Scroll') || has('Wand') || has('Magical')) return 'arcane';
  if (has('Healing')) return 'verdant';
  if (has('Weapon') || has('Armor') || has('Shield')) return 'iron';
  if (has('Alchemical')) return 'verdant';
  return 'gold';
}
