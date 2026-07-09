// Spellgun hosts (Magic+ arsenal M2, epic #1206 / #1208).
//
// The Arcane Duelist's Gloves absorb spellguns: a worn item that holds 1 (or 2,
// Greater) spellguns and can Activate an absorbed one while a hand is empty. This
// mirrors the shield-attachment binding (shieldAttach.js) — an item→item overlay
// keyed by the absorbed spellgun's inventory uid — but is CAPACITY-limited (the
// first host that holds more than one bound item), so the bind helper takes the
// host's capacity:
//
//   cnmh_absorbed_<charId> = { [spellgunUid]: gloveUid }
//
// Unlike a talisman the spellgun is NOT consumed on absorb — retrieval returns it
// to inventory intact. It IS consumed when finally fired (SpellgunAttackModal),
// which also clears its binding. React-free.

import { itemUidOf } from './affix';
import { isSpellgun } from './spellgun';
import { APP, syncKey } from '../sync/keys';

/** Synced-state key for a character's spellgun-absorption overlay. */
export const absorbedKey = (charId) => syncKey(APP.ABSORBED, charId);

/** Whether an item is a spellgun host (carries a `spellgunHost` block). */
export const isSpellgunHost = (item) =>
  !!item && !!item.spellgunHost && typeof item.spellgunHost === 'object';

/** How many spellguns a host can hold (0 when it isn't a host). */
export const spellgunHostCapacity = (item) =>
  isSpellgunHost(item) ? (Number(item.spellgunHost.capacity) || 0) : 0;

/** The glove uid a spellgun is absorbed into, or null. */
export const absorbedHostUid = (overlay, spellgunUid) =>
  (overlay && typeof overlay === 'object' ? overlay[spellgunUid] : undefined) ?? null;

/** Set of spellgun uids currently absorbed (for filtering displays). */
export const absorbedUidSet = (overlay) =>
  new Set(Object.keys(overlay && typeof overlay === 'object' ? overlay : {}));

/** The spellgun uids currently absorbed into a given glove. */
export const absorbedOnHost = (overlay, gloveUid) =>
  Object.entries(overlay && typeof overlay === 'object' ? overlay : {})
    .filter(([, hostUid]) => hostUid === gloveUid)
    .map(([spellgunUid]) => spellgunUid);

/** How many spellguns are absorbed into a given glove. */
export const absorbedCountOn = (overlay, gloveUid) => absorbedOnHost(overlay, gloveUid).length;

/** Whether a glove has room for another spellgun (count < capacity). */
export const canAbsorb = (overlay, glove) =>
  absorbedCountOn(overlay, itemUidOf(glove)) < spellgunHostCapacity(glove);

/**
 * Absorb a spellgun into a glove, returning the next overlay (immutable).
 * Capacity is enforced here: if the glove is already full, the overlay is
 * returned UNCHANGED. Re-absorbing a spellgun already in this glove is a no-op;
 * moving it from another glove is allowed while there's room.
 */
export const absorb = (overlay, spellgunUid, glove) => {
  const cur = overlay && typeof overlay === 'object' ? overlay : {};
  const gloveUid = itemUidOf(glove);
  if (cur[spellgunUid] === gloveUid) return cur; // already here
  if (absorbedCountOn(cur, gloveUid) >= spellgunHostCapacity(glove)) return cur; // full
  return { ...cur, [spellgunUid]: gloveUid };
};

/** Retrieve an absorbed spellgun (clear its binding), returning the next overlay. */
export const retrieve = (overlay, spellgunUid) => {
  const next = { ...(overlay && typeof overlay === 'object' ? overlay : {}) };
  delete next[spellgunUid];
  return next;
};

/**
 * Group absorbed spellguns by host glove uid, resolving uids from a flat item
 * list: { [gloveUid]: [spellgunItem, …] }. Bindings whose spellgun uid no longer
 * resolves (stale) are skipped.
 */
export const absorbedSpellgunsByHost = (overlay, flatItems) => {
  const byUid = new Map((Array.isArray(flatItems) ? flatItems : []).map((it) => [itemUidOf(it), it]));
  const out = {};
  for (const [spellgunUid, gloveUid] of Object.entries(overlay && typeof overlay === 'object' ? overlay : {})) {
    const item = byUid.get(spellgunUid);
    if (!item) continue;
    (out[gloveUid] = out[gloveUid] || []).push(item);
  }
  return out;
};

/**
 * Valid host gloves for a spellgun: spellgun hosts (not the spellgun itself) that
 * still have free capacity. Used by the absorb picker.
 */
export const validSpellgunHosts = (items, spellgun, overlay) => {
  if (!isSpellgun(spellgun)) return [];
  const selfUid = itemUidOf(spellgun);
  return (Array.isArray(items) ? items : []).filter(
    (it) => isSpellgunHost(it) && itemUidOf(it) !== selfUid && canAbsorb(overlay, it)
  );
};
