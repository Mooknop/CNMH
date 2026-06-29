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
import { runeTarget } from './runeClassify';

// runeTarget is the canonical rune classifier (#885); re-exported here so the
// socket helpers + their callers keep importing it from one place.
export { runeTarget };

/** What a piece of gear is for rune purposes: 'weapon' (has Strikes), 'armor'
 *  (has an armor block), else null (not runesmithable). */
export const gearTarget = (item) => {
  if (!item || typeof item !== 'object') return null;
  if (item.strikes) return 'weapon';
  if (isArmor(item)) return 'armor';
  return null;
};

const runesOf = (item) => (item && item.runes && typeof item.runes === 'object' ? item.runes : {});

const propertyCapacity = (item, target) =>
  target === 'armor' ? armorPropertySlotCapacity(runesOf(item)) : propertySlotCapacity(runesOf(item));

/**
 * Derive the socket view for a piece of gear, in display order: potency, the
 * target's second fundamental (striking | resilient), then one property socket
 * per potency tier. Each socket: { type, target, filled, value?/rune?, index? }.
 * Returns [] for non-runesmithable gear.
 */
export const gearSockets = (item) => {
  const target = gearTarget(item);
  if (!target) return [];
  const runes = runesOf(item);
  const sockets = [
    { type: 'potency', target, filled: (runes.potency || 0) > 0, value: runes.potency || 0 },
  ];
  if (target === 'weapon') {
    sockets.push({ type: 'striking', target, filled: !!runes.striking, value: runes.striking || null });
  } else {
    sockets.push({ type: 'resilient', target, filled: !!runes.resilient, value: runes.resilient || null });
  }
  const property = Array.isArray(runes.property) ? runes.property : [];
  const cap = propertyCapacity(item, target);
  for (let i = 0; i < cap; i += 1) {
    sockets.push({ type: 'property', target, index: i, filled: property[i] != null, rune: property[i] != null ? property[i] : null });
  }
  return sockets;
};

/**
 * The runes in `stock` that can fill `socketType` on `item`: same target, and —
 * for a fundamental socket — the matching fundamental kind. A potency rune only
 * qualifies if it raises the current tier (an upgrade, never a side- or down-
 * grade); a striking/resilient rune only if it differs from what's equipped.
 * `stock` is an array of rune docs (property or fundamental).
 */
export const compatibleRunes = (item, socketType, stock) => {
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
  const target = gearTarget(gear);
  if (!gear || !rune || !target || runeTarget(rune) !== target) return null;
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
