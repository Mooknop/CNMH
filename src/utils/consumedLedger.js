// The consumed-consumables ledger (#1659).
//
//   cnmh_consumed_<charId> = { [itemUid]: burnCount }
//
// Historically this overlay was keyed by item *name*, which made it the odd one
// out among the item overlays (`cnmh_affixed`, `cnmh_attached`, `cnmh_itembroken`,
// `cnmh_removed`, `cnmh_itemhp` are all uid-keyed) and, worse, made two entries
// that happen to share a name each subtract the *whole* count: burn one Acid
// Flask while holding two stacks and both stacks lost one. #1652 widened
// `isConsumable` to honour the Consumable trait, which brought bombs, elixirs,
// catalysts and other buy-in-bulk items into range and made the collision likely.
//
// The migration is deliberately non-destructive — nothing rewrites stored state:
//
//   * every writer records against the item's **uid**;
//   * a reader takes the uid entry when there is one and falls back to the legacy
//     **name** entry when there isn't — never the sum of both;
//   * the first uid write *seeds* itself from the legacy name count, so switching
//     keys never resurrects already-burned copies.
//
// Because reads are either/or (uid xor name) rather than additive, a legacy name
// entry and its seeded uid successor can never subtract the same burn twice.
// Legacy entries simply stop being consulted for any entry that has since been
// burned, and disappear for good when the GM commits the reconciliation that
// folds them into authored quantities.

/**
 * Stable inventory identity for the ledger: the loadout uid, else id, else name.
 *
 * Deliberately a copy of `itemUidOf` from utils/affix.js rather than an import —
 * affix.js's `deactivateTalisman` is itself a ledger writer, and importing back
 * the other way would make the two modules circular. `consumedLedger.test.js`
 * asserts the two stay in lockstep.
 *
 * @param {Object} item
 * @returns {string|null}
 */
export const consumedKeyOf = (item) => item?.uid ?? item?.id ?? item?.name ?? null;

const asMap = (map) => (map && typeof map === 'object' ? map : {});
const has = (map, key) => key != null && Object.prototype.hasOwnProperty.call(map, key);
const at = (map, key) => Math.max(0, Number(map[key]) || 0);

/**
 * Burns recorded against one inventory entry, given its uid and name.
 *
 * The uid entry is authoritative; the name entry is consulted only when the uid
 * has no entry of its own. Never a sum — that either/or is the guard against
 * double-subtracting a burn across the two key shapes. (When an item has no uid
 * or id, `consumedKeyOf` *is* the name, so both lookups hit the same slot and
 * still count once.)
 *
 * @param {Object} consumedMap - value of cnmh_consumed_<charId>
 * @param {string|null} uid    - the entry's ledger key
 * @param {string|null} name   - the entry's item name (legacy key)
 * @returns {number}
 */
export const consumedCountBy = (consumedMap, uid, name) => {
  const map = asMap(consumedMap);
  if (has(map, uid)) return at(map, uid);
  if (has(map, name)) return at(map, name);
  return 0;
};

/** {@link consumedCountBy} for a resolved inventory item. */
export const consumedCountFor = (item, consumedMap) =>
  consumedCountBy(consumedMap, consumedKeyOf(item), item?.name);

/**
 * Which key a read of this entry actually resolves through — the uid when it
 * carries an entry, the legacy name when only that does, else the uid (the key a
 * write would create). Used by GM reconciliation to clear the right slot.
 *
 * @param {Object} consumedMap
 * @param {Object} item
 * @returns {string|null}
 */
export const consumedEntryKey = (consumedMap, item) => {
  const map = asMap(consumedMap);
  const uid = consumedKeyOf(item);
  if (has(map, uid)) return uid;
  if (has(map, item?.name)) return item?.name;
  return uid ?? item?.name ?? null;
};

// Every write lands on the uid key, seeded from whatever the entry currently
// reads (so a legacy name count carries forward exactly once, into the uid).
const bumpConsumedBy = (consumedMap, uid, name, delta) => {
  const map = asMap(consumedMap);
  const key = uid ?? name ?? null;
  if (key == null || !delta) return map;
  return { ...map, [key]: Math.max(0, consumedCountBy(map, uid, name) + delta) };
};

/**
 * Record `n` burns of an entry against its uid key.
 * @returns {Object} next overlay (immutable)
 */
export const recordConsumedBy = (consumedMap, uid, name, n = 1) =>
  bumpConsumedBy(consumedMap, uid, name, Number(n) || 0);

/** {@link recordConsumedBy} for a resolved inventory item. */
export const recordConsumed = (consumedMap, item, n = 1) =>
  recordConsumedBy(consumedMap, consumedKeyOf(item), item?.name, n);

/**
 * Undo `n` burns (the scroll-pip un-tap). Writes to the uid key like every other
 * writer, so an undo of a legacy burn migrates that entry too.
 * @returns {Object} next overlay (immutable)
 */
export const restoreConsumedBy = (consumedMap, uid, name, n = 1) =>
  bumpConsumedBy(consumedMap, uid, name, -(Number(n) || 0));

/** {@link restoreConsumedBy} for a resolved inventory item. */
export const restoreConsumed = (consumedMap, item, n = 1) =>
  restoreConsumedBy(consumedMap, consumedKeyOf(item), item?.name, n);
