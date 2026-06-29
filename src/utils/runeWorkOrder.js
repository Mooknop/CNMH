// Rune work orders (#802, R3 of the rune-shopping epic #799).
//
// "Apply to a weapon" at a shop: the shop takes the weapon and returns it with
// the rune etched **24 hours after purchase, or the next time the party is in
// that town — whichever is later**. While it's away, an order holds a snapshot
// of the weapon; on collection the rune is folded into a fresh inline copy that
// the player gets back. Pure helpers only — the hook (useRuneWork) wires these
// to the synced overlays, clock, and location.

import { toGameSeconds } from './gameTime';
import { newEntryUid } from './uid';
import { applyRune } from './runeSockets';

export const TURNAROUND_HOURS = 24;

// Build a work order from a purchase. `now` is the current clock; the order is
// ready at `now + 24h` AND only once the party is back in `locationId`.
export const createWorkOrder = ({ weapon, rune, shopTitle, locationId, now, price }) => {
  const paid = toGameSeconds(now || {});
  return {
    id: newEntryUid(),
    weaponUid: weapon && weapon.uid != null ? weapon.uid : null,
    weaponName: weapon && weapon.name ? weapon.name : 'weapon',
    weapon, // resolved snapshot, runed on collect
    runeRef: rune && rune.id != null ? rune.id : null,
    runeName: rune && rune.name ? rune.name : 'rune',
    paidAtSeconds: paid,
    readyAtSeconds: paid + TURNAROUND_HOURS * 3600,
    readyLocationId: locationId != null ? locationId : null,
    shopTitle: shopTitle || null,
    price: Number(price) || 0,
  };
};

// Ready when the turnaround has elapsed AND the party is back in the town where
// the order was placed — "24h OR next-in-town, whichever is later" is both true.
export const isOrderReady = (order, nowSeconds, locationId) =>
  !!order &&
  Number(nowSeconds) >= order.readyAtSeconds &&
  order.readyLocationId != null &&
  String(locationId) === String(order.readyLocationId);

// Display status for a pending order: ready, waiting on time, or waiting to be
// back in town (or both). Pure — the panel renders from this.
export const orderStatus = (order, nowSeconds, locationId) => {
  if (!order) return { ready: false, waitingTime: false, waitingPlace: false };
  const waitingTime = Number(nowSeconds) < order.readyAtSeconds;
  const waitingPlace = String(locationId) !== String(order.readyLocationId);
  return { ready: !waitingTime && !waitingPlace, waitingTime, waitingPlace };
};

// Weapons in an inventory that can be sent for etching: carry Strike data and a
// stable uid (so they can be pulled from the loadout). Slot-capacity validation
// is deferred to R5 (#804).
export const eligibleWeapons = (inventory) =>
  (Array.isArray(inventory) ? inventory : []).filter((it) => it && it.strikes && it.uid != null);

// Order staged runes so fundamentals land before property runes — applying
// potency first opens the property-slot capacity a property rune needs.
const runeApplyOrder = (r) => (r && r.type === 'fundamental' ? (r.fundamental === 'potency' ? 0 : 1) : 2);

// Apply a whole staged-rune array to a gear snapshot (#857 S7a), returning the
// fresh-uid runed entry to credit back. Each rune folds via the S6a applyRune
// (fundamentals set a tier, property runes append); an incompatible rune is
// skipped (applyRune → null) rather than aborting the rest.
export const applyRunesToGear = (gear, runes) => {
  const ordered = [...(Array.isArray(runes) ? runes : [])].sort((a, b) => runeApplyOrder(a) - runeApplyOrder(b));
  return ordered.reduce((g, r) => applyRune(g, r) || g, gear);
};

// Build a handoff work order from a staged gear (#857 S7a): one order holding the
// gear snapshot + the staged rune array, runed on collect via applyRunesToGear.
// `runeName` is a joined summary + `weaponName` the gear name, so RuneWorkPanel
// renders a multi-rune order unchanged; `price` sums the staged runes.
export const createHandoffOrder = ({ gear, runes, shopTitle, locationId, now }) => {
  const list = Array.isArray(runes) ? runes : [];
  const paid = toGameSeconds(now || {});
  return {
    id: newEntryUid(),
    weaponUid: gear && gear.uid != null ? gear.uid : null,
    weaponName: gear && gear.name ? gear.name : 'gear',
    weapon: gear,
    runes: list,
    runeName: list.map((r) => r && r.name).filter(Boolean).join(', ') || 'runes',
    paidAtSeconds: paid,
    readyAtSeconds: paid + TURNAROUND_HOURS * 3600,
    readyLocationId: locationId != null ? locationId : null,
    shopTitle: shopTitle || null,
    price: list.reduce((sum, r) => sum + (Number(r && r.price) || 0), 0),
  };
};

// Fold a property rune onto a weapon snapshot, returning a fresh-uid inline
// entry to credit back to the owner. Property runes only for now (#802);
// potency/striking + slot validation come later (#804). The resolver
// (finishItem) re-resolves a string runeRef in `runes.property` against the
// catalog, so a mixed array of ids + already-resolved objects is fine.
export const foldRuneIntoWeapon = (weapon, runeRef) => {
  const base = weapon && typeof weapon === 'object' ? weapon : {};
  const runes = base.runes && typeof base.runes === 'object' ? base.runes : {};
  const property = Array.isArray(runes.property) ? runes.property : [];
  const present = property.some((p) => (typeof p === 'string' ? p : p && p.id) === runeRef);
  const nextProperty = runeRef != null && !present ? [...property, runeRef] : property;
  // Drop transient loadout fields; the owner's tree re-derives placement.
  const { state, hand, ...rest } = base;
  return { ...rest, uid: newEntryUid(), runes: { ...runes, property: nextProperty } };
};
