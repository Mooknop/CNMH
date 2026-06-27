// Move a rune (#803, R4 of the rune-shopping epic #799).
//
// Relocating a rune between a weapon and a runestone is a 1-hour exploration or
// downtime Crafting activity: a Standard DC check vs the level-based DC of the
// rune being moved. Degrees of success:
//   critical success — moves for free
//   success          — moves, but expend 10% of the rune's value
//   failure          — no effect
//   critical failure — the rune is destroyed
//
// Pure helpers only; useMoveRune wires these to the synced overlays, gold, and
// session log. Property runes only for now (matches R3's foldRuneIntoWeapon);
// potency/striking moves + slot validation come with R5 (#804).

import { getLevelBasedDc } from './InventoryUtils';
import { newEntryUid } from './uid';

export const MOVE_RUNE_HOURS = 1;

// Standard DC for a move: the level-based DC of the rune, floored at the level-1
// DC so an unleveled rune still has a sane DC (mirrors repairDc).
export const moveRuneDc = (runeLevel) => {
  const lvl = Math.max(1, Math.min(20, Math.round(Number(runeLevel) || 0)));
  return getLevelBasedDc(lvl);
};

// Gold (gp) expended to keep a rune on a plain success: 10% of the rune's value,
// rounded to the nearest gp. Critical success is free.
export const moveRuneCost = (runePrice) => Math.round((Number(runePrice) || 0) * 0.1);

// Outcome of a move check by degree of success:
//   moved     — the rune relocates to the destination
//   destroyed — the rune is lost entirely (critical failure)
//   costGp    — gold expended to complete the move (plain success only)
export const moveRuneOutcome = (degree, runePrice) => {
  switch (degree) {
    case 'criticalSuccess':
      return { moved: true, destroyed: false, costGp: 0 };
    case 'success':
      return { moved: true, destroyed: false, costGp: moveRuneCost(runePrice) };
    case 'criticalFailure':
      return { moved: false, destroyed: true, costGp: 0 };
    default: // failure
      return { moved: false, destroyed: false, costGp: 0 };
  }
};

// Remove a property rune from a weapon snapshot, returning a fresh-uid inline
// entry (the inverse of foldRuneIntoWeapon). Drops transient loadout fields so
// the owner's tree re-derives placement.
export const removeRuneFromWeapon = (weapon, runeRef) => {
  const base = weapon && typeof weapon === 'object' ? weapon : {};
  const runes = base.runes && typeof base.runes === 'object' ? base.runes : {};
  const property = Array.isArray(runes.property) ? runes.property : [];
  const nextProperty = property.filter(
    (p) => (typeof p === 'string' ? p : p && p.id) !== runeRef,
  );
  const { state, hand, ...rest } = base;
  return { ...rest, uid: newEntryUid(), runes: { ...runes, property: nextProperty } };
};

// A fresh runestone inventory entry holding `runeRef` (the form
// resolveInventoryItem resolves; see runestone.js).
export const runestoneEntryFor = (runeRef) => ({
  ref: 'runestone',
  runeRef,
  uid: newEntryUid(),
  quantity: 1,
});

// Property runes currently etched on a weapon, as movable candidates carrying
// the fields the panel needs ({ id, name, level, price }). Reads resolved rune
// docs (finishItem inlines them) but tolerates raw id strings.
export const weaponMovableRunes = (weapon) => {
  const property = weapon?.runes?.property;
  if (!Array.isArray(property)) return [];
  return property
    .map((p) => (typeof p === 'string' ? { id: p, name: p } : p))
    .filter((p) => p && p.id != null)
    .map((p) => ({ id: p.id, name: p.name || p.id, level: p.level, price: p.price }));
};
