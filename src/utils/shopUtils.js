import { buildChildrenMap, getChildren } from './loreUtils';
import { isRunestoneEntry, resolveRunestone } from './runestone';
import { runeTarget } from './runeClassify';
import { accessoryEligible } from './accessoryRunes';
import { isTalisman, affixTargetType } from './affix';
import { isWhetstone } from './whetstone';
import { resolveScroll, resolveWand, castRank, mechanicalHeightenRanks, SCROLL_BY_RANK, WAND_BY_RANK } from './spellItems';
import { getItemRarity, baseSpellItemArt } from './InventoryUtils';
import { isCatalyst, catalystTargetSpell } from './catalyst';
import {
  dragonbreathMeta,
  dragonbreathDisplayName,
  dragonbreathTierPrice,
  dragonbreathTierLevel,
} from './dragonbreath';

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
  return wares.some((w) => isRunestoneEntry(w) || isRuneServiceWare(w));
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
// A GM-flagged "never sell" catalog item (#1105): unique / racial / story gear
// (Izzy's Gourd Head, a quest McGuffin) the shop must never surface — neither
// generatively (rune-service base gear) nor through a stale explicit ware.
// Toggled from the GM shop host-management panel; a plain `noShop` boolean on
// the item doc so it round-trips through the content DO like any other field.
export const isShopExcluded = (item) => !!(item && item.noShop);

// A dragonbreath weapon ware (#1210 M4g): a base-weapon `ref` carrying a
// `dragonbreath: { tier, dragonType }` template block. The GM stocks a specific
// templated weapon (a Greater Red Dragonbreath Longsword) rather than a plain
// catalog item — these are loot-grade, never player-crafted — so it is authored
// in its own GmShops section and attached to the base at resolve time. A bought
// copy lands as a lean `{ ref, dragonbreath }` entry (expandWare) that
// re-resolves off the base weapon.
export const isDragonbreathWare = (w) =>
  !!(w && w.ref != null && w.ref !== 'runestone' && !isSpellItemWare(w) && !isRuneServiceWare(w) && dragonbreathMeta(w));

export function resolveShopWares(loreId, shops, catalogMap, runeMap) {
  const wares = shops && loreId != null ? shops[loreId]?.wares : null;
  if (!Array.isArray(wares) || !catalogMap) return [];
  return wares
    .map((w) => {
      // Generative spell-item offerings (#812 S6) are surfaced separately via
      // spellItemOfferings/eligibleSpellItems (the Spellcasting Services tab) —
      // never expanded into the flat wares list, which would flood it.
      if (isSpellItemWare(w)) return null;
      // Generative rune-service offerings (#982 G1) are surfaced via
      // runeOfferings/eligibleRunes (the Runesmithing tab), not the flat list.
      if (isRuneServiceWare(w)) return null;
      if (!w || w.ref == null) return null;

      if (isRunestoneEntry(w)) {
        const resolved = resolveRunestone({ ref: 'runestone', runeRef: w.runeRef }, runeMap);
        const override = typeof w.price === 'number' && Number.isFinite(w.price) ? w.price : null;
        if (override != null) resolved.price = override;
        resolved.wareKey = w.runeRef != null ? `runestone@${w.runeRef}` : 'runestone';
        if (w.stock != null) resolved.stock = w.stock;
        return resolved;
      }

      // A dragonbreath weapon ware (#1210 M4g): resolve the base weapon, attach
      // the template block, and present it as the dragonbreath weapon — its
      // derived name, tier level, and price (pack tier price + base, unless the
      // GM overrode it). A distinct `id`/`wareKey` (base+tier+type) keeps each
      // templated weapon its own single-form browse group, so a shop can stock a
      // plain longsword and a Red Dragonbreath longsword side by side. The `ref`
      // is carried so the bought copy re-resolves off the base (expandWare).
      if (isDragonbreathWare(w)) {
        const base = catalogMap.get(String(w.ref));
        if (!base || isShopExcluded(base)) return null;
        const meta = dragonbreathMeta(w);
        const { variants, ...rest } = base;
        const resolved = { ...rest };
        resolved.dragonbreath = { tier: meta.tier, dragonType: meta.dragonType };
        resolved.name = dragonbreathDisplayName(resolved, base.name);
        resolved.baseName = base.name;
        resolved.level = dragonbreathTierLevel(meta.tier);
        const override = typeof w.price === 'number' && Number.isFinite(w.price) ? w.price : null;
        resolved.price = override != null
          ? override
          : dragonbreathTierPrice(meta.tier) + (Number(base.price) || 0);
        const traits = Array.isArray(base.traits) ? base.traits.slice() : [];
        if (!traits.includes('Magical')) traits.push('Magical');
        resolved.traits = traits;
        const key = `dragonbreath:${w.ref}:${meta.tier}:${String(meta.dragonType || '').toLowerCase()}`;
        resolved.id = key;
        resolved.ref = String(w.ref);
        resolved.wareKey = key;
        if (w.stock != null) resolved.stock = w.stock;
        return resolved;
      }

      const item = catalogMap.get(String(w.ref));
      // Drop a stale explicit ware for a now-excluded item — the flag is an
      // absolute "never sell", so it wins over an authored ref too.
      if (!item || isShopExcluded(item)) return null;

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

// The display-only spell fields the shop preview shows (via <SpellMechanics>) so
// a buyer sees the whole spell — traits, action cost, defense, range, area,
// targets, duration, trigger, description, degrees of success, and heightening.
// A curated subset (no id/traditions/baseLevel) keeps the browse ware lean; only
// present fields are carried.
const SPELL_DISPLAY_FIELDS = [
  'name', 'level', 'traits', 'actions', 'defense', 'range', 'area',
  'targets', 'duration', 'trigger', 'description', 'degrees', 'heightened',
];
const spellMechanics = (spell) => {
  const out = {};
  for (const f of SPELL_DISPLAY_FIELDS) {
    if (spell[f] != null) out[f] = spell[f];
  }
  return out;
};

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
export function eligibleSpellItems(ware, spells, catalogMap) {
  if (!isSpellItemWare(ware)) return [];
  const kind = ware.spellItem;
  const cap = maxRankForLevel(kind, ware.maxLevel);
  if (cap < 1) return [];

  const trads = offeringTraditions(ware);
  const rars = offeringRarities(ware);
  const resolveFn = kind === 'scroll' ? resolveScroll : resolveWand;
  // Shared base scroll/wand art (#936), stamped on every generated ware so the
  // browse crest renders. Null (no base item / no image set yet) ⇒ no art key.
  const baseArt = baseSpellItemArt(kind, catalogMap);
  const mod = typeof ware.priceMod === 'number' && Number.isFinite(ware.priceMod) && ware.priceMod > 0
    ? ware.priceMod
    : null;

  const out = [];
  for (const spell of Array.isArray(spells) ? spells : []) {
    if (!spell || isCantrip(spell)) continue;
    const spellTrads = Array.isArray(spell.traditions) ? spell.traditions : null;
    if (!spellTrads || spellTrads.length === 0) continue; // focus spell — no scroll/wand pricing

    const baseRank = castRank(spell, {});
    if (baseRank == null || baseRank < 1 || baseRank > cap) continue;
    if (!spellTrads.some((t) => trads.includes(String(t).toLowerCase()))) continue;
    if (!rars.includes(spellRarity(spell))) continue;

    // A scroll/wand inherits its spell's rarity — stamp the rarity trait on.
    const rarityTrait = getItemRarity(spell);

    // One ware per mechanically-distinct cast rank within the shop's level cap
    // (#937): the base rank, plus each heightened rank that actually changes the
    // spell. The base rank keeps the minimal `{spellRef}` block + un-suffixed
    // wareKey (so it round-trips like before and useBuyItems lands a plain item);
    // a heightened rank carries a `rank` override and a rank-distinct wareKey.
    // All share one `id`, so groupWares collapses them into a single browse
    // entry with a buy form per rank.
    for (const rank of mechanicalHeightenRanks(spell)) {
      if (rank > cap) continue;
      const heightened = rank > baseRank;
      const block = heightened ? { spellRef: String(spell.id), rank } : { spellRef: String(spell.id) };
      const derived = resolveFn(spell, block);
      const traits = rarityTrait ? [rarityTrait, ...derived.traits] : [...derived.traits];
      const price = mod != null ? Math.round(derived.price * mod) : derived.price;

      out.push({
        id: `${kind}-of-${spell.id}`,
        name: derived.name,
        level: derived.level,
        price,
        weight: BULK_L_WEIGHT,
        traits,
        // The spell's own mechanics text, so the shop preview card shows what a
        // Scroll/Wand of X actually does (#936 follow-up).
        ...(spell.description ? { description: spell.description } : {}),
        // The full spell block (traits, action cost, defense, range, area,
        // targets, duration, trigger, description, degrees, heightening) so the
        // preview can render the whole spell via <SpellMechanics>. Browse-only —
        // reuid() strips it, landing a minimal { spellRef, rank? } in inventory.
        spell: spellMechanics(spell),
        ...(baseArt ? { image: baseArt.image, ...(baseArt.imagePosition != null ? { imagePosition: baseArt.imagePosition } : {}) } : {}),
        [kind]: block,
        wareKey: heightened ? `${kind}:${spell.id}:${rank}` : `${kind}:${spell.id}`,
      });
    }
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
  // Count distinct spells, not rank-forms: heightened offerings (#937) emit
  // several wares per spell (all sharing one `id`), but the summary speaks in
  // spells ("23 eligible spells"), so collapse by id.
  const count = new Set(eligibleSpellItems(ware, spells).map((e) => e.id)).size;
  const tradLabel = traditions.length === ALL_TRADITIONS.length ? 'all traditions' : traditions.join('/');
  const text = `${kind === 'scroll' ? 'Scrolls' : 'Wands'} · ${tradLabel} · ${rarities.join('+')} · up to item level ${maxLevel} · ${count} eligible spell${count === 1 ? '' : 's'}`;
  return { kind, maxLevel, cap, count, traditions, rarities, text };
}

// ── Auto-stocked catalysts (Magic+ arsenal M3c, #1209) ──────────────────────
// A shop that offers Spellcasting Services also carries every CATALYST whose
// augmented spell falls inside that shop's spell envelope — the union of spells
// its scroll/wand offerings actually cover (eligibleSpellItems). Computed at
// resolve time from the catalog; nothing is written to the stored wares,
// mirroring the generative rune-service host/talisman auto-stock (#1044/#1211).
// Spellguns stay MANUAL wares — only catalysts ride the spell envelope, because a
// catalyst is bound to one spell and is only worth stocking where that spell sells.

// The set of spell ids a shop's spell-item offerings actually cover (deduped
// across offerings + heightened rank-forms, which all share one spellRef).
export function offeredSpellIds(loreId, shops, spells, catalogMap) {
  const out = new Set();
  for (const ware of spellItemOfferings(loreId, shops)) {
    for (const it of eligibleSpellItems(ware, spells, catalogMap)) {
      const block = it.scroll || it.wand;
      if (block && block.spellRef != null) out.add(String(block.spellRef));
    }
  }
  return out;
}

// Catalysts implied by a shop's spell envelope: those whose `catalystFor` spell
// is offered. Each is returned as a resolved flat ware ({ ...item, wareKey }), so
// the storefront groups + sells it like any hand-stocked item. Gated on
// shopOffersSpellcasting so a shop that offers no spellcasting never carries them;
// an excluded item (#1105 noShop) is skipped. The caller dedupes against
// hand-stocked wares by item id, so a GM's explicit catalyst ware (custom
// price/stock, or one outside the envelope) always wins.
export function eligibleCatalysts(loreId, shops, spells, items, catalogMap) {
  if (!shopOffersSpellcasting(loreId, shops)) return [];
  const offered = offeredSpellIds(loreId, shops, spells, catalogMap);
  if (!offered.size) return [];
  const out = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!isCatalyst(item) || isShopExcluded(item)) continue;
    const spellId = catalystTargetSpell(item);
    if (spellId == null || !offered.has(String(spellId))) continue;
    const price = Number.isFinite(item.price) ? item.price : 0;
    out.push({ ...item, baseName: item.name, price, wareKey: `catalyst:${item.id}` });
  }
  return out;
}

// ── Generative rune-service offerings (#982 G1) ─────────────────────────────
// A shop can sell runes for a TARGET (weapon | armor | ring | accessory) up to
// a max rune LEVEL, filtered by rarity — expanded from the rune catalog on
// demand instead of stocking one { ref:'runestone', runeRef } ware per rune
// (the pre-generative model). The authored ware is the compact spec:
//   { runeService:true, targets?:[...],
//     maxLevel: number | { weapon?, armor?, ring?, accessory? }, rarities?:[...] }
// directly mirroring the spell-item offering (spellItemOfferings/eligibleSpellItems).
// FUNDAMENTAL runes (potency/striking/resilient) are NOT offered here — those are
// stocked as their own item wares; the generative service covers PROPERTY runes,
// which is also where the ring (#967) and accessory (#1033 S4) runes live.

export const RUNE_TARGETS = ['weapon', 'armor', 'shield', 'ring', 'accessory'];

// A ware is a generative rune-service offering (not a flat item/runestone ref).
export function isRuneServiceWare(w) {
  return !!(w && w.runeService === true);
}

// Target filter: an explicit non-empty list, else every target. (Empty/unset =
// all, mirroring offeringTraditions.) Exported for the Sale Shelf roller (#1135),
// which picks a target uniformly among an offering's admissible targets.
export const offeringTargets = (ware) => {
  const t = Array.isArray(ware.targets) ? ware.targets.filter(Boolean) : [];
  return t.length ? t.map((x) => String(x).toLowerCase()) : RUNE_TARGETS;
};

// The max rune level a target is offered up to. A scalar `maxLevel` caps every
// selected target; an object `{ weapon?, armor?, ring?, accessory? }` caps per
// target (a target with no finite cap is not offered). Returns 0 when there is no cap.
// Exported so the GM authoring editor (#982 G2) can read a stored per-target cap.
export const maxLevelForTarget = (ware, target) => {
  const ml = ware ? ware.maxLevel : null;
  const raw = ml !== null && typeof ml === 'object' ? ml[target] : ml;
  const lvl = Number(raw);
  return Number.isFinite(lvl) && lvl > 0 ? lvl : 0;
};

// A rune's rarity (lowercased). Explicit `rune.rarity` wins; else a rarity trait
// (getItemRarity, for forward-compat); else common. Runes carry no traits today
// (#982 G1), so the explicit field is the signal a rarity filter reads.
export const runeRarity = (rune) =>
  String((rune && rune.rarity) || getItemRarity(rune) || 'common').toLowerCase();

// The rune-service offerings on a shop, in authored order, each tagged with a
// stable `offeringKey` for React/test keys.
export function runeOfferings(loreId, shops) {
  const wares = shops && loreId != null ? shops[loreId]?.wares : null;
  if (!Array.isArray(wares)) return [];
  return wares.filter(isRuneServiceWare).map((w) => ({
    ...w,
    offeringKey: `runeService:${offeringTargets(w).join('+')}:${RUNE_TARGETS.map((t) => maxLevelForTarget(w, t)).join('/')}:${offeringRarities(w).join('+')}`,
  }));
}

// Expand one rune-service offering into the runestone ware specs it covers. A
// PROPERTY rune is kept when ALL hold: its target ∈ the offering's targets, its
// level ≤ that target's cap, and its rarity is allowed (rarity-unset ⇒ common
// only). Each entry is a runestone ware spec { ref:'runestone', runeRef, wareKey }
// — the same shape a hand-stocked runestone has — so resolveShopWares/resolveRunestone
// (R1) price + display it unchanged and G3 can feed it straight into the socket
// picker. Deduped by rune id.
export function eligibleRunes(ware, runes) {
  if (!isRuneServiceWare(ware)) return [];
  const targets = offeringTargets(ware);
  const rars = offeringRarities(ware);
  const seen = new Set();
  const out = [];
  for (const rune of Array.isArray(runes) ? runes : []) {
    if (!rune || rune.type !== 'property') continue;
    const target = String(runeTarget(rune) || '').toLowerCase();
    if (!targets.includes(target)) continue;
    const cap = maxLevelForTarget(ware, target);
    if (cap < 1 || Number(rune.level) > cap) continue;
    if (!rars.includes(runeRarity(rune))) continue;
    const id = String(rune.id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ ref: 'runestone', runeRef: rune.id, wareKey: `rune:${id}` });
  }
  return out;
}

// A human-readable coverage summary for one rune-service offering plus its live
// eligible-rune count, for the G2 authoring preview. Mirrors the offering
// defaults exactly: targets empty = all; rarities empty = common only.
//   → { targets[], rarities[], count, text }
// e.g. "Runes · weapon/ring · common · weapon ≤8, ring ≤10 · 14 eligible runes".
export function runeOfferingSummary(ware, runes) {
  const targets = offeringTargets(ware || {});
  const rarities = offeringRarities(ware || {});
  const count = eligibleRunes(ware, runes).length;
  const tgtLabel = targets.length === RUNE_TARGETS.length ? 'all targets' : targets.join('/');
  const caps = RUNE_TARGETS.filter((t) => targets.includes(t) && maxLevelForTarget(ware, t) > 0)
    .map((t) => `${t} ≤${maxLevelForTarget(ware, t)}`)
    .join(', ');
  const text = `Runes · ${tgtLabel} · ${rarities.join('+')} · ${caps || 'no level cap'} · ${count} eligible rune${count === 1 ? '' : 's'}`;
  return { targets, rarities, count, text };
}

// ── Rune-service base gear (#1044) ──────────────────────────────────────────
// A shop that sells runes for SPECIFIC targets also stocks the mundane base
// gear those runes etch onto — a weapon-rune smith carries base weapons, an
// accessory-rune tailor carries cloaks and boots. A GENERAL runesmith (no
// explicit target list, i.e. every target) is exempt: it's an etching service,
// not a gear shop. Matching is live against the same window eligibleRunes
// reads: a target's base gear appears only when the offering actually admits
// ≥1 rune for it, and an accessory host only when an admitted accessory rune
// fits its usage tags — a footwear-runes-only shop stocks boots, not umbrellas.

// Traits that disqualify an item as mundane BASE gear (bombs are Alchemical
// Consumable weapons; magic/invested gear isn't a blank to etch).
const MUNDANE_BLOCKERS = /^(magical|invested|alchemical|consumable)$/i;
const isMundaneBase = (item) => {
  if (!item || item.id == null) return false;
  if ((Array.isArray(item.traits) ? item.traits : []).some((t) => MUNDANE_BLOCKERS.test(String(t)))) return false;
  // Pre-runed catalog entries (a +1 cold iron longsword) aren't base gear; the
  // empty `runes: {}` block the base catalog carries is fine.
  const r = item.runes;
  return !(r && (r.potency || r.striking || r.resilient ||
    (Array.isArray(r.property) && r.property.length) || r.accessory));
};

// The accessory candidates are the DELIBERATE hosts — authored tags, shields,
// containers. The bare derived 'light' tag would sweep every negligible-bulk
// item (potions, ammunition) into the shop window.
const isDeliberateHost = (item) =>
  (Array.isArray(item.accessoryTags) && item.accessoryTags.length > 0) ||
  !!item.shield || !!item.container;

/**
 * The base-gear category an item can be generatively offered as (#1105) —
 * weapon | armor | accessory | shield | ring, or null when a shop never
 * auto-surfaces it. Mirrors eligibleHostItems' own classification so the GM
 * host-management panel groups the catalog exactly as the shop sees it (a
 * dual-role item like Explorer's Clothing resolves to armor first). The
 * `noShop` flag is orthogonal — an excluded item still has a host kind; the
 * panel shows the kind and the exclusion toggle side by side.
 */
export const shopHostKind = (item) => {
  if (!item || item.id == null) return null;
  if (item.powerRing) return 'ring';
  if (!isMundaneBase(item)) return null;
  // A shield — even one carrying a bash `strikes` block — is a shield host, not
  // a weapon: mirrors gearTarget's shield-before-strikes precedence (#1177), so
  // its runesmithing target and its shop kind agree.
  if (item.shield) return 'shield';
  if (item.strikes) return 'weapon';
  if (item.armor) return 'armor';
  if (isDeliberateHost(item)) return 'accessory';
  return null;
};

/**
 * The catalog items a rune-service offering implies as buyable base gear, in
 * catalog order, deduped by id (Explorer's Clothing is both base armor and an
 * accessory host). Returns [] for a non-service ware and for the exempt
 * general runesmith. `items` is the item catalog; `runes` the rune catalog.
 */
export function eligibleHostItems(ware, items, runes) {
  if (!isRuneServiceWare(ware)) return [];
  const explicit = Array.isArray(ware.targets)
    ? ware.targets.filter(Boolean).map((t) => String(t).toLowerCase())
    : [];
  // No explicit list = every target = the general runesmith; an explicit list
  // covering every target is the same shop spelled out.
  if (explicit.length === 0 || explicit.length >= RUNE_TARGETS.length) return [];

  // Which targets the level/rarity window actually admits runes for, plus the
  // admitted accessory docs (needed for per-host usage matching).
  const byId = new Map((Array.isArray(runes) ? runes : []).map((r) => [String(r.id), r]));
  const admitted = new Set();
  const accessoryDocs = [];
  eligibleRunes(ware, runes).forEach((spec) => {
    const doc = byId.get(String(spec.runeRef));
    const target = String(runeTarget(doc) || '');
    admitted.add(target);
    if (target === 'accessory') accessoryDocs.push(doc);
  });

  const out = [];
  const seen = new Set();
  const push = (item) => {
    const id = String(item.id);
    if (!seen.has(id)) { seen.add(id); out.push(item); }
  };
  for (const item of Array.isArray(items) ? items : []) {
    // A GM-excluded item (#1105) is never offered as base gear — this is where
    // Izzy's Gourd Head (a racial container) used to leak into accessory hosts.
    if (!item || item.id == null || isShopExcluded(item)) continue;
    // The Power Ring is magic (so not "mundane base"), but it IS the ring
    // target's base gear — the blank a ring rune imbues into.
    if (item.powerRing) {
      if (explicit.includes('ring') && admitted.has('ring')) push(item);
      continue;
    }
    if (!isMundaneBase(item)) continue;
    // A shield is its own target (#1177) — never weapon base gear, even when it
    // carries a bash `strikes` block (spiked steel shield). So the weapon branch
    // excludes shields, and the shield branch stocks them for a shield service.
    if (explicit.includes('weapon') && admitted.has('weapon') && item.strikes && !item.shield) push(item);
    if (explicit.includes('armor') && admitted.has('armor') && item.armor) push(item);
    if (explicit.includes('shield') && admitted.has('shield') && item.shield) push(item);
    if (explicit.includes('accessory') && isDeliberateHost(item) &&
        accessoryDocs.some((r) => accessoryEligible(item, r))) push(item);
  }
  return out;
}

// ── Rune-service talismans (#1211 G6) ───────────────────────────────────────
// A shop that sells runes for SPECIFIC gear targets (weapon/armor/shield) also
// stocks the affix-to-that-gear TALISMANS, up to the same per-target level cap —
// a shield-rune smith carries shield talismans, a weapon smith weapon talismans.
// Like eligibleHostItems this exempts the general / all-target runesmith (an
// etching service, not a consumables counter). Unlike it the gate is the level
// CAP alone: talismans aren't runes, so there's no rune-admission coupling — the
// cap being 0 (target not offered) is what excludes them. Each in-cap GRADE
// becomes its own resolved ware (variant merged, `variants` stripped, distinct
// wareKey), mirroring eligibleSpellItems, so groupWares shows the grade ladder
// and the cart/reuid price each form independently. Honors #1105 noShop; deduped.
const TALISMAN_TARGETS = new Set(['weapon', 'armor', 'shield']);

export function eligibleTalismans(ware, items) {
  if (!isRuneServiceWare(ware)) return [];
  const explicit = Array.isArray(ware.targets)
    ? ware.targets.filter(Boolean).map((t) => String(t).toLowerCase())
    : [];
  // Empty list = general runesmith; a full list is that shop spelled out — both exempt.
  if (explicit.length === 0 || explicit.length >= RUNE_TARGETS.length) return [];

  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || item.id == null || isShopExcluded(item) || !isTalisman(item)) continue;
    const affixTo = String(affixTargetType(item) || '').toLowerCase();
    if (!TALISMAN_TARGETS.has(affixTo) || !explicit.includes(affixTo)) continue;
    const cap = maxLevelForTarget(ware, affixTo);
    if (cap < 1) continue;

    // Each grade is its own form; a grade-less talisman is a single synthetic grade.
    const grades = Array.isArray(item.variants) && item.variants.length
      ? item.variants
      : [{ level: item.level, name: item.name, price: item.price }];
    const { variants, ...base } = item;
    for (const g of grades) {
      if (Number(g.level) > cap) continue;
      const key = `talisman:${item.id}@${g.level}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...base, ...g, baseName: item.name, wareKey: key });
    }
  }
  return out;
}

// ── Rune-service whetstones (#1212) ─────────────────────────────────────────
// A shop that offers WEAPON runesmithing also counters the apply-to-weapon
// WHETSTONE consumables, up to the weapon target's rune level cap and inside
// the offering's rarity window. Unlike host gear / talismans, the general
// (all-target) runesmith is NOT exempt — it offers weapon runesmithing too,
// and the whetstone catalog is small and level-gated, so there's no base-gear
// flood to guard against. Honors #1105 noShop; hand-stocked wares win (the
// caller dedupes by item id, so a GM's explicit whetstone ware keeps its
// custom price/stock).
export function eligibleWhetstones(ware, items) {
  if (!isRuneServiceWare(ware)) return [];
  if (!offeringTargets(ware).includes('weapon')) return [];
  const cap = maxLevelForTarget(ware, 'weapon');
  if (cap < 1) return [];
  const rarities = offeringRarities(ware);
  const out = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || item.id == null || isShopExcluded(item) || !isWhetstone(item)) continue;
    if (Number(item.level || 0) > cap) continue;
    if (!rarities.includes(String(getItemRarity(item) || 'common').toLowerCase())) continue;
    const price = Number.isFinite(item.price) ? item.price : 0;
    out.push({ ...item, baseName: item.name, price, wareKey: `whetstone:${item.id}` });
  }
  return out;
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
