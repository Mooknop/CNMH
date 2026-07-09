import { APP, syncKey } from '../sync/keys';
// Talisman affixing (#254/#339 folded track).
//
// A talisman is a discrete Consumable inventory item that gets *affixed* to a
// host item (a 10-minute activity), then *activated* (consuming it). The affix
// relationship is item→item, stored in a per-character overlay keyed by the
// talisman's inventory uid:
//
//   cnmh_affixed_<charId> = { [talismanUid]: hostUid }
//
// Display: an affixed talisman is shown as an indented child line under its host
// (and removed from its normal inventory position). React-free.

/** Synced-state key for a character's affix overlay. */
export const affixedKey = (charId) => syncKey(APP.AFFIXED, charId);

/** Stable inventory identity (the loadout uid, else id, else name). */
export const itemUidOf = (item) => item?.uid ?? item?.id ?? item?.name ?? null;

/** Whether an item is a talisman (can be affixed). */
export const isTalisman = (item) =>
  Array.isArray(item?.traits) && item.traits.some((t) => String(t).toLowerCase() === 'talisman');

/** The item type a talisman affixes to ('weapon'|'armor'|'shield'), or null = any. */
export const affixTargetType = (talisman) => talisman?.talisman?.affixTo || null;

/**
 * Whether a candidate host item matches an affix target type. Weapons carry
 * `strikes`, armor an `armor` block, shields a `shield` block. A null/unknown
 * type matches any non-talisman item (GM-trust fallback).
 */
export const hostMatchesType = (host, type) => {
  if (!host || isTalisman(host)) return false;
  switch (type) {
    case 'weapon': return !!host.strikes;
    case 'armor':  return !!host.armor;
    case 'shield': return !!host.shield;
    default:       return true; // unspecified → any item
  }
};

/** Valid host items for a talisman (excludes itself + other talismans). */
export const validAffixHosts = (items, talisman) => {
  const type = affixTargetType(talisman);
  const selfUid = itemUidOf(talisman);
  return (Array.isArray(items) ? items : []).filter(
    (it) => itemUidOf(it) !== selfUid && hostMatchesType(it, type)
  );
};

/** The host uid a talisman is affixed to, or null. */
export const affixedHostUid = (overlay, talismanUid) =>
  (overlay && typeof overlay === 'object' ? overlay[talismanUid] : undefined) ?? null;

/** Bind a talisman to a host, returning the next overlay (immutable). */
export const affix = (overlay, talismanUid, hostUid) => ({
  ...(overlay && typeof overlay === 'object' ? overlay : {}),
  [talismanUid]: hostUid,
});

/** Remove a talisman's affix binding, returning the next overlay (immutable). */
export const unaffix = (overlay, talismanUid) => {
  const next = { ...(overlay && typeof overlay === 'object' ? overlay : {}) };
  delete next[talismanUid];
  return next;
};

/** Set of talisman uids that are currently affixed (for filtering displays). */
export const affixedUidSet = (overlay) =>
  new Set(Object.keys(overlay && typeof overlay === 'object' ? overlay : {}));

/** The affixed talismans as resolved items, from a flat item list. */
export const affixedTalismanItems = (overlay, flatItems) => {
  const uids = affixedUidSet(overlay);
  return (Array.isArray(flatItems) ? flatItems : []).filter((it) => uids.has(itemUidOf(it)));
};

/**
 * Activate-and-consume a talisman: bump its consumed-overlay count (by name) and
 * drop its affix binding (by uid). Both writers accept a functional updater. The
 * shared path for all three activation surfaces (#254/#339).
 * @param {Object}   talisman
 * @param {Function} setConsumed  - setter for cnmh_consumed_<charId>
 * @param {Function} setAffixed   - setter for cnmh_affixed_<charId>
 */
export const deactivateTalisman = ({ talisman, setConsumed, setAffixed }) => {
  if (!talisman) return;
  if (setConsumed) {
    setConsumed((cur) => ({ ...(cur || {}), [talisman.name]: ((cur || {})[talisman.name] || 0) + 1 }));
  }
  if (setAffixed) {
    setAffixed((cur) => unaffix(cur, itemUidOf(talisman)));
  }
};

/**
 * Group affixed talismans by their host uid, resolving uids to items from a
 * flat item list: { [hostUid]: [talismanItem, …] }. Talismans whose uid no
 * longer resolves (stale) are skipped.
 * @param {Object} overlay    cnmh_affixed_<charId>
 * @param {Array}  flatItems  flattened inventory (top-level + container contents)
 */
export const affixedTalismansByHost = (overlay, flatItems) => {
  const byUid = new Map((Array.isArray(flatItems) ? flatItems : []).map((it) => [itemUidOf(it), it]));
  const out = {};
  for (const [talismanUid, hostUid] of Object.entries(overlay && typeof overlay === 'object' ? overlay : {})) {
    const tItem = byUid.get(talismanUid);
    if (!tItem) continue;
    (out[hostUid] = out[hostUid] || []).push(tItem);
  }
  return out;
};
