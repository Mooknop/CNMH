import { APP, syncKey } from '../sync/keys';
// src/utils/itemBroken.js
// Broken-item overlay (#957 S4). Scepters (and future scepter-like items) gain
// the `broken` condition when their actuated ability is Overloaded. This is a
// lightweight player-writable overlay keyed by item uid — separate from the
// durability engine (#539), which is weapon/shield/armor-scoped.
//
// Overlay (synced as cnmh_itembroken_<charId>):
//   { [uid]: { repairable: boolean } }   // presence = broken
//
// Recovery model (source-faithful, per GM ruling): a broken item "can't be
// repaired before your next daily preparations". So a fresh break is NOT
// repairable; daily prep UNLOCKS repair (repairable → true) without clearing it;
// a Repair action or a minimum-rank slot sacrifice then clears it.

export const itemBrokenKey = (charId) => syncKey(APP.ITEMBROKEN, charId || 'unknown');

/** Is this item currently broken? */
export const isItemBroken = (overlay, uid) => !!(overlay && uid != null && overlay[uid]);

/** Is a broken item repairable yet (i.e. a daily prep has passed since it broke)? */
export const isRepairable = (overlay, uid) =>
  !!(overlay && uid != null && overlay[uid] && overlay[uid].repairable);

/** Mark an item broken (Overload). Not repairable until the next daily prep. */
export const breakItem = (overlay, uid) =>
  uid == null ? (overlay || {}) : { ...(overlay || {}), [uid]: { repairable: false } };

/** Clear broken for an item (a successful Repair). Never mutates. */
export const repairItem = (overlay, uid) => {
  if (!overlay || !(uid in overlay)) return overlay || {};
  const next = { ...overlay };
  delete next[uid];
  return next;
};

/**
 * Unlock repair for every broken item — daily prep lifts the "can't repair
 * before your next daily preparations" gate without auto-repairing. Returns the
 * same reference when nothing changed (so daily prep can skip a no-op write).
 */
export const unlockRepairs = (overlay) => {
  const entries = Object.entries(overlay || {});
  if (!entries.length || entries.every(([, v]) => v && v.repairable)) return overlay || {};
  const next = {};
  for (const [uid, v] of entries) {
    next[uid] = v && !v.repairable ? { ...v, repairable: true } : v;
  }
  return next;
};

/** Any broken item still locked (not yet repairable)? Drives the daily-prep reset. */
export const hasLockedBroken = (overlay) =>
  Object.values(overlay || {}).some((v) => v && !v.repairable);
