import { APP, syncKey } from '../sync/keys';
import { recordConsumed } from './consumedLedger';
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

/**
 * The uid of a talisman already affixed to a given host, or null (#1657). An item
 * carries ONE talisman at a time, so this is the occupancy check. `exceptUid`
 * lets the talisman being (re-)affixed ignore its OWN current binding, which is
 * not an obstacle to itself.
 */
export const talismanOnHost = (overlay, hostUid, exceptUid = null) => {
  for (const [tUid, hUid] of Object.entries(overlay && typeof overlay === 'object' ? overlay : {})) {
    if (hUid === hostUid && tUid !== exceptUid) return tUid;
  }
  return null;
};

/**
 * Valid host items for a talisman: the right type, not the talisman itself, and
 * — per the #1657 ruling — not already carrying another talisman. Passing the
 * affix overlay is what enables the occupancy filter; every picker surface
 * (ItemModal, GmGearModal, take10Activities) passes it, so the rule is inherited
 * rather than re-implemented. To free an occupied host the player unaffixes,
 * which returns the talisman to inventory.
 * @param {Array}  items     candidate host items (flat inventory)
 * @param {Object} talisman  the talisman being affixed
 * @param {Object} overlay   cnmh_affixed_<charId>
 */
export const validAffixHosts = (items, talisman, overlay) => {
  const type = affixTargetType(talisman);
  const selfUid = itemUidOf(talisman);
  return (Array.isArray(items) ? items : []).filter(
    (it) => itemUidOf(it) !== selfUid
      && hostMatchesType(it, type)
      && !talismanOnHost(overlay, itemUidOf(it), selfUid)
  );
};

/** The host uid a talisman is affixed to, or null. */
export const affixedHostUid = (overlay, talismanUid) =>
  (overlay && typeof overlay === 'object' ? overlay[talismanUid] : undefined) ?? null;

/**
 * Bind a talisman to a host, returning the next overlay (immutable). At most ONE
 * talisman per host (#1657): a host already carrying another talisman REFUSES the
 * bind and the overlay comes back unchanged. (Contrast shieldAttach.attach, which
 * displaces the incumbent — a talisman is consumed on activation, so silently
 * evicting one would strand it; the player unaffixes deliberately instead.)
 */
export const affix = (overlay, talismanUid, hostUid) => {
  const cur = overlay && typeof overlay === 'object' ? overlay : {};
  if (cur[talismanUid] === hostUid) return cur;            // already there
  if (talismanOnHost(cur, hostUid, talismanUid)) return cur; // occupied → refused
  return { ...cur, [talismanUid]: hostUid };
};

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
 * Activate-and-consume a talisman: bump its consumed-overlay count and drop its
 * affix binding — both by uid (#1659). Both writers accept a functional updater.
 * The shared path for all three activation surfaces (#254/#339).
 * @param {Object}   talisman
 * @param {Function} setConsumed  - setter for cnmh_consumed_<charId>
 * @param {Function} setAffixed   - setter for cnmh_affixed_<charId>
 */
export const deactivateTalisman = ({ talisman, setConsumed, setAffixed }) => {
  if (!talisman) return;
  if (setConsumed) {
    setConsumed((cur) => recordConsumed(cur, talisman));
  }
  if (setAffixed) {
    setAffixed((cur) => unaffix(cur, itemUidOf(talisman)));
  }
};

/**
 * Group affixed talismans by their host uid, resolving uids to items from a
 * flat item list: { [hostUid]: [talismanItem, …] }. Talismans whose uid no
 * longer resolves (stale) are skipped.
 *
 * The ARRAY return is deliberate even though #1657 caps a host at one talisman.
 * The overlay is live synced state (cnmh_affixed_<charId>) held in the Durable
 * Object, not repo content, so a character bound before the cap landed may still
 * hold a double binding. Returning every talisman on the host keeps such a state
 * VISIBLE and removable (each renders its own unaffix control) instead of
 * stranding the extras in an overlay with no UI to reach them. Going forward the
 * writers only ever produce arrays of length ≤ 1, so this is a legacy-tolerance
 * shape, not an invitation — display surfaces must not imply multi is expected.
 *
 * @param {Object} overlay    cnmh_affixed_<charId>
 * @param {Array}  flatItems  flattened inventory (top-level + container contents)
 * @returns {Object} { [hostUid]: [talismanItem, …] } — one entry per host in
 *   any state written since #1657; possibly more for legacy bindings.
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
