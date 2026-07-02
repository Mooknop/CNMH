// Rune-socket model (#857 S6a) — the foundation for the Runesmithing tab (S6b)
// and its checkout commit (S7). Pure helpers over the app's structured rune block
// (`runes: { potency, striking|resilient, property: [] }`): derive a socket view,
// find compatible runes for a socket, and apply a rune (fundamental OR property).
//
// Unlike the prototype's flat `slots:[{type,rune}]`, sockets are DERIVED:
//   • one potency socket (the +N fundamental),
//   • one striking socket (weapons) / resilient socket (armor),
//   • property sockets numbering the potency tier (potency unlocks property).
// Applying a fundamental SETS a tier (potency number / striking|resilient key);
// applying a property rune APPENDS to `runes.property` (capacity = potency).
//
// This generalises runeWorkOrder.foldRuneIntoWeapon (which appends property runes
// only) and lives ALONGSIDE it — the live property-only etch flow keeps using the
// old helper until S7 retires it and switches the commit to applyRune.

import { newEntryUid } from './uid';
import { isArmor } from './InventoryUtils';
import { propertySlotCapacity } from './weaponRunes';
import { armorPropertySlotCapacity } from './armorRunes';
import { accessoryEligible, isAccessoryHost } from './accessoryRunes';
import { runeTarget } from './runeClassify';

// runeTarget is the canonical rune classifier (#885); re-exported here so the
// socket helpers + their callers keep importing it from one place.
export { runeTarget };

/** What a piece of gear is for rune purposes: 'weapon' (has Strikes), 'armor'
 *  (has an armor block), 'ring' (a power ring — #967 R4), else null (not
 *  runesmithable). The power ring is neither weapon nor armor, so it's detected
 *  by the explicit `powerRing` marker the R1 catalog item carries. */
export const gearTarget = (item) => {
  if (!item || typeof item !== 'object') return null;
  if (item.powerRing) return 'ring';
  if (item.strikes) return 'weapon';
  if (isArmor(item)) return 'armor';
  return null;
};

/** A power ring's property-socket capacity is its GRADE, not a potency rune:
 *  the resolved grade merges `ringSockets` (R1 `overrides`) onto the item. */
export const ringSocketCapacity = (item) => Number(item && item.ringSockets) || 0;

const runesOf = (item) => (item && item.runes && typeof item.runes === 'object' ? item.runes : {});

const propertyCapacity = (item, target) =>
  target === 'armor' ? armorPropertySlotCapacity(runesOf(item))
    : target === 'ring' ? ringSocketCapacity(item)
      : propertySlotCapacity(runesOf(item));

/**
 * Derive the socket view for a piece of gear, in display order: potency, the
 * target's second fundamental (striking | resilient), then one property socket
 * per potency tier, then — on any usage-tagged host (#1033 S5) — the single
 * accessory socket. Each socket: { type, target, filled, value?/rune?, index? }.
 * Returns [] for gear that is neither runesmithable nor an accessory host; an
 * accessory-ONLY host (a cloak, a shield — no gearTarget) carries just the one
 * accessory socket.
 */
export const gearSockets = (item) => {
  const target = gearTarget(item);
  const runes = runesOf(item);
  const sockets = [];
  if (target) {
    const property = Array.isArray(runes.property) ? runes.property : [];
    const cap = propertyCapacity(item, target);

    // A power ring has NO fundamental sockets — its imbue capacity is fixed by
    // grade (ringSockets), so every socket is a property (imbue) socket. Weapon
    // and armor lead with their two fundamentals (potency + striking|resilient)
    // before the potency-gated property sockets.
    if (target !== 'ring') {
      sockets.push({ type: 'potency', target, filled: (runes.potency || 0) > 0, value: runes.potency || 0 });
      if (target === 'weapon') {
        sockets.push({ type: 'striking', target, filled: !!runes.striking, value: runes.striking || null });
      } else {
        sockets.push({ type: 'resilient', target, filled: !!runes.resilient, value: runes.resilient || null });
      }
    }
    for (let i = 0; i < cap; i += 1) {
      sockets.push({ type: 'property', target, index: i, filled: property[i] != null, rune: property[i] != null ? property[i] : null });
    }
  }
  // The one accessory slot rides AFTER the target sockets — orthogonal to
  // gearTarget, so a dual-host (armor-runed Explorer's Clothing) shows both.
  if (isAccessoryHost(item)) {
    sockets.push({ type: 'accessory', target: 'accessory', filled: runes.accessory != null, rune: runes.accessory != null ? runes.accessory : null });
  }
  return sockets;
};

/**
 * Project a piece of gear as if its staged FUNDAMENTAL runes were already
 * applied, so the socket board reflects in-progress staging (#879): staging +1
 * potency on a +0 item opens, in the same visit, the property slot that tier
 * unlocks. `stagedRunes` is the `socketKey → rune` map for one gear (fundamental
 * keys are `potency`/`striking`/`resilient`). Staged PROPERTY runes are
 * deliberately not folded in — they render against the projected sockets via the
 * caller's staged map, keeping property-socket indices aligned. A staged rune
 * that won't apply (e.g. a non-upgrade) is skipped. Returns the gear unchanged
 * when nothing applies.
 */
export const projectStagedGear = (gear, stagedRunes) => {
  if (!gear || !stagedRunes || typeof stagedRunes !== 'object') return gear;
  return ['potency', 'striking', 'resilient'].reduce((g, key) => {
    const rune = stagedRunes[key];
    return rune ? applyRune(g, rune) || g : g;
  }, gear);
};

/**
 * The runes in `stock` that can fill `socketType` on `item`: same target, and —
 * for a fundamental socket — the matching fundamental kind. A potency rune only
 * qualifies if it raises the current tier (an upgrade, never a side- or down-
 * grade); a striking/resilient rune only if it differs from what's equipped.
 * The accessory socket (#1033 S5) matches by usage tags instead (and closes
 * once inscribed — one rune, no upgrade path). `stock` is an array of rune docs
 * (property or fundamental).
 */
export const compatibleRunes = (item, socketType, stock) => {
  if (socketType === 'accessory') {
    return (Array.isArray(stock) ? stock : []).filter((r) => accessoryEligible(item, r));
  }
  const target = gearTarget(item);
  if (!target) return [];
  const runes = runesOf(item);
  return (Array.isArray(stock) ? stock : []).filter((r) => {
    if (runeTarget(r) !== target) return false;
    if (socketType === 'property') return r.type === 'property';
    if (r.type !== 'fundamental' || r.fundamental !== socketType) return false;
    if (socketType === 'potency') return (r.tier || 0) > (runes.potency || 0);
    return runes[socketType] !== r.tierKey; // striking | resilient differs from equipped
  });
};

/**
 * Apply one rune to a piece of gear, returning a fresh-uid runed snapshot (the
 * shape useRuneWork credits back), or `null` when it can't be applied:
 * incompatible target, no free property slot, a duplicate property rune, or a
 * non-upgrade fundamental. Transient loadout fields (state/hand) are dropped so
 * the owner's tree re-derives placement.
 */
export const applyRune = (gear, rune) => {
  if (!gear || !rune) return null;

  // Accessory runes (#1033 S1) bypass the single-target model entirely: the
  // host is classified by usage tags (accessoryEligible), not gearTarget, so a
  // cloak (no target) and an armor-runed Explorer's Clothing (target 'armor')
  // both take the one accessory slot the same way.
  if (runeTarget(rune) === 'accessory') {
    if (rune.type !== 'property' || !accessoryEligible(gear, rune)) return null;
    const { state, hand, ...rest } = gear;
    return { ...rest, uid: newEntryUid(), runes: { ...runesOf(gear), accessory: rune.id } };
  }

  const target = gearTarget(gear);
  if (!target || runeTarget(rune) !== target) return null;
  const runes = runesOf(gear);
  const property = Array.isArray(runes.property) ? runes.property : [];
  let nextRunes;

  if (rune.type === 'property') {
    const used = property.filter(Boolean).length;
    const present = property.some((p) => (typeof p === 'string' ? p : p && p.id) === rune.id);
    if (used >= propertyCapacity(gear, target) || present) return null;
    nextRunes = { ...runes, property: [...property, rune.id] };
  } else if (rune.type === 'fundamental' && rune.fundamental === 'potency') {
    if ((runes.potency || 0) >= (rune.tier || 0)) return null;
    nextRunes = { ...runes, potency: rune.tier };
  } else if (rune.type === 'fundamental' && rune.fundamental === 'striking' && target === 'weapon') {
    if (runes.striking === rune.tierKey) return null;
    nextRunes = { ...runes, striking: rune.tierKey };
  } else if (rune.type === 'fundamental' && rune.fundamental === 'resilient' && target === 'armor') {
    if (runes.resilient === rune.tierKey) return null;
    nextRunes = { ...runes, resilient: rune.tierKey };
  } else {
    return null;
  }

  const { state, hand, ...rest } = gear;
  return { ...rest, uid: newEntryUid(), runes: nextRunes };
};

/**
 * Whether a piece of gear belongs on the storefront etch list (#1033 S5).
 * Target gear (weapon / armor / power ring) always shows, as before. An
 * accessory-ONLY host (a cloak, boots, a shield — no target sockets) shows
 * only when the shop stocks at least one rune it could actually take, so
 * every light-bulk trinket in a full inventory doesn't flood the board — and
 * an already-inscribed one drops off again (one rune per item, nothing left
 * to etch; its inscription still shows on any dual-host card and in the
 * inventory ItemModal). `stock` is the shop's rune-doc list (the same one
 * the socket picker reads).
 */
export const inEtchList = (item, stock) =>
  !!gearTarget(item) ||
  (isAccessoryHost(item) && compatibleRunes(item, 'accessory', stock).length > 0);
