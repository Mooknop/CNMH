// Item-targeted consumable effects (#339 / #254 folded track).
//
// Some consumables affect a specific INVENTORY ITEM, not the drinking creature
// (oils: Oil of Weightlessness, Anticorrosion Oil; later, affixed talismans).
// The creature-effect path (cnmh_effects_<charId>) has no home for these, so
// they live in a parallel overlay keyed by the owning character:
//
//   cnmh_itemeffects_<charId> = [ {
//     id, itemId, itemName, label, note?, source, appliedBy,
//     expireAtSecs?,        // absolute game-seconds end; pruned by the clock sweep
//     ts
//   } ]
//
// The effect is display-only (an inventory badge/note) — the mechanical
// consequence (negligible Bulk, rust protection) is a reminder the player/GM
// reads, mirroring how creature effect-consumables surface as status reminders.
// React-free: accepts hooks' return values as plain args (like consumables.js).
import { newEntryUid } from './uid';

const writeLocal = (key, value) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
};

/** Synced-state key for a character's item-effect overlay. */
export const itemEffectsKey = (charId) => `cnmh_itemeffects_${charId}`;

/** Stable identity for an inventory item (authored id, else name). */
export const itemKeyOf = (item) => item?.id ?? item?.name ?? null;

/** Active item effects recorded against a given inventory item. */
export const itemEffectsFor = (overlay, item) => {
  const key = itemKeyOf(item);
  if (key == null) return [];
  return (Array.isArray(overlay) ? overlay : []).filter(
    (e) => e.itemId === key || e.itemId === item?.name
  );
};

/** Badge label for an item-target consumable (falls back to its note). */
export const itemEffectLabel = (meta) => meta?.label || meta?.note || 'Active';

/**
 * Stamp each item's active item-effects onto it (as `activeEffects`) for display
 * — mirrors how the consumed overlay stamps `quantity`. Items with none pass
 * through unchanged. (#339)
 * @param {Array} items
 * @param {Array} overlay - cnmh_itemeffects_<charId>
 */
export const stampItemEffects = (items, overlay) =>
  (Array.isArray(items) ? items : []).map((it) => {
    const fx = itemEffectsFor(overlay, it);
    return fx.length ? { ...it, activeEffects: fx } : it;
  });

/**
 * Apply an item-targeted consumable: append an entry to the owner's item-effect
 * overlay (with optional clock expiry) and log it. Returns the next overlay so
 * the caller can hand it to setSyncedState/sendUpdate.
 *
 * @param {Object}   user       - { id, name } applying the oil
 * @param {Object}   targetItem - the inventory item being treated
 * @param {string}   itemName   - the consumable's name (the oil)
 * @param {Object}   meta       - consumableMeta(item); label/note/durationMinutes
 * @param {number}   [nowSecs]  - current absolute game seconds (stamps expiry)
 * @param {Function} getState   - (charId, key) => value  (current overlay read)
 * @param {Function} sendUpdate - (charId, key, value) => void
 * @param {Function} appendLog  - ({ type, charId, text }) => void
 * @returns {Array} the next overlay
 */
export function applyItemEffect({ user, targetItem, itemName, meta, nowSecs, getState, sendUpdate, appendLog }) {
  const entry = {
    id:        newEntryUid(),
    itemId:    itemKeyOf(targetItem),
    itemName:  targetItem?.name || 'item',
    label:     itemEffectLabel(meta),
    ...(meta?.note ? { note: meta.note } : {}),
    source:    itemName,
    appliedBy: user.id,
    ...(typeof nowSecs === 'number' && meta?.durationMinutes
      ? { expireAtSecs: nowSecs + meta.durationMinutes * 60 }
      : {}),
    ts: Date.now(),
  };
  const current = getState ? getState(user.id, 'itemeffects') : null;
  const next = [...(Array.isArray(current) ? current : []), entry];

  writeLocal(itemEffectsKey(user.id), next);
  if (sendUpdate) sendUpdate(user.id, 'itemeffects', next);

  if (appendLog) {
    const durationLabel = meta?.durationMinutes ? ` (${meta.durationMinutes} min)` : '';
    appendLog({
      type:   'action',
      charId: user.id,
      text:   `${user.name} applied ${itemName} to ${entry.itemName}${durationLabel}`,
    });
  }
  return next;
}

/**
 * Split an item-effect overlay into the entries still active vs. expired at the
 * given game time. Used by the clock-expiry sweep.
 * @returns {{ next: Array, expired: Array }}
 */
export function pruneExpiredItemEffects(overlay, nowSecs) {
  const list = Array.isArray(overlay) ? overlay : [];
  const expired = list.filter(
    (e) => typeof e.expireAtSecs === 'number' && e.expireAtSecs <= nowSecs
  );
  if (expired.length === 0) return { next: list, expired };
  return { next: list.filter((e) => !expired.includes(e)), expired };
}
