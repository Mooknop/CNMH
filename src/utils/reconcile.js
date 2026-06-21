// Reconciliation engine (#556, epic #555). Pure + testable: given a resolved
// character, its raw authored doc, and the live durable overlays, compute the
// list of durable live↔doc divergences as typed, appliable change descriptors.
// The GM dashboard (#557) renders these and commits the selected ones into the
// character doc. This module only computes + applies *in memory* — it never
// touches the content DO or any overlay store.
//
// A PendingChange:
//   {
//     kind,        // one of PENDING_KINDS
//     charId,      // resolved character id
//     overlay,     // which durable overlay it came from (so #557 can clear it)
//     overlayRef,  // key within that overlay to clear after commit (e.g. item name)
//     label,       // short human label (the item name)
//     detail,      // human description of the change ("3 → 1", "used up")
//     before,      // doc value before
//     after,       // live value to commit
//     apply(rawDoc) -> nextRaw   // pure; takes a FRESH raw doc, returns the next
//   }
//
// `apply` deliberately takes the raw doc as an argument (rather than closing
// over the compute-time doc) so #557 can re-read the freshest doc before
// committing — guarding against clobbering a concurrent GM edit. It is
// idempotent: re-applying an already-committed change is a no-op.

import { isConsumable, remainingQuantity, flattenInventory } from './InventoryUtils';

export const PENDING_KINDS = {
  CONSUMABLE_REMOVE: 'consumable-remove',
  CONSUMABLE_DECREMENT: 'consumable-decrement',
  GOLD_SET: 'gold-set', // #558
  LOADOUT_PLACE: 'loadout-place', // #559
  ITEM_ADD: 'item-add', // #665
  ITEM_REMOVE: 'item-remove', // #665
};

// The overlays whose divergences are allowed to propagate into the doc. Defined
// as data so the dashboard and tests share one source of truth. `consumed` is
// live today; the rest are wired by their sub-issues (see the computer table).
export const DURABLE_OVERLAYS = ['consumed', 'gold', 'loadout', 'acquired', 'removed'];

// Session-only overlays that must NEVER reach the doc. Listed so a test can
// assert the engine never surfaces a change sourced from one of them.
export const EPHEMERAL_OVERLAYS = ['hp', 'conditions', 'focus', 'slots', 'effects', 'heropoints'];

// Match a resolved item back to its authored doc entry: by stable per-entry uid
// when both have one, else by name (legacy inline entries). Mirrors
// ConsumablesCleanup's matchesRaw.
const matchesRaw = (entry, item) => {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.uid != null && item.uid != null) return entry.uid === item.uid;
  return entry.name === item.name;
};

// Recursive doc-inventory edits (entries may be nested in container contents).
// Both rebuild immutably so a caller's raw doc is never mutated.
const removeEntry = (list, item) =>
  (Array.isArray(list) ? list : []).reduce((acc, e) => {
    if (matchesRaw(e, item)) return acc;
    if (e && e.container && Array.isArray(e.container.contents)) {
      acc.push({ ...e, container: { ...e.container, contents: removeEntry(e.container.contents, item) } });
    } else {
      acc.push(e);
    }
    return acc;
  }, []);

const setEntryQuantity = (list, item, quantity) =>
  (Array.isArray(list) ? list : []).map((e) => {
    if (matchesRaw(e, item)) return { ...e, quantity };
    if (e && e.container && Array.isArray(e.container.contents)) {
      return { ...e, container: { ...e.container, contents: setEntryQuantity(e.container.contents, item, quantity) } };
    }
    return e;
  });

// ── Per-overlay computers ────────────────────────────────────────────────────
// Each returns PendingChange[] for one durable overlay. Only `consumed` is
// implemented in this slice; the rest land in their sub-issues.

const computeConsumed = (resolved, consumed) => {
  const used = consumed && typeof consumed === 'object' ? consumed : {};
  return flattenInventory(resolved.inventory)
    .filter(isConsumable)
    .flatMap((item) => {
      const count = used[item.name] || 0;
      if (count <= 0) return [];
      const authored = item.quantity ?? 1;
      const remaining = remainingQuantity(item, used); // max(0, authored - count)
      const base = {
        charId: resolved.id,
        overlay: 'consumed',
        overlayRef: item.name,
        label: item.name,
        before: authored,
      };
      if (remaining <= 0) {
        return [{
          ...base,
          kind: PENDING_KINDS.CONSUMABLE_REMOVE,
          detail: `used up (${authored} → 0)`,
          after: 0,
          apply: (raw) => ({ ...raw, inventory: removeEntry(raw.inventory, item) }),
        }];
      }
      return [{
        ...base,
        kind: PENDING_KINDS.CONSUMABLE_DECREMENT,
        detail: `${authored} → ${remaining}`,
        after: remaining,
        apply: (raw) => ({ ...raw, inventory: setEntryQuantity(raw.inventory, item, remaining) }),
      }];
    });
};

// Gold (#558). Gold lives only in the live `cnmh_gold_<id>` overlay today — the
// doc carries no gold field — so the divergence is the live value vs the doc's
// gold (absent ⇒ 0), and committing writes/updates `gold` on the doc. The
// overlay is the live source of truth and stays put (not cleared on commit): it
// already equals the value we wrote, so there's no further divergence.
const computeGold = (resolved, raw, goldOverlay) => {
  if (typeof goldOverlay !== 'number' || !Number.isFinite(goldOverlay)) return [];
  const docGold = Number(raw.gold) || 0;
  if (goldOverlay === docGold) return [];
  return [{
    kind: PENDING_KINDS.GOLD_SET,
    charId: resolved.id,
    overlay: 'gold',
    overlayRef: 'gold',
    label: 'Gold',
    detail: `${docGold} → ${goldOverlay} gp`,
    before: docGold,
    after: goldOverlay,
    apply: (rawDoc) => ({ ...rawDoc, gold: goldOverlay }),
  }];
};

// overlay name -> computer. Stubs return [] until their sub-issue wires them, so
// the engine + descriptor model are in place now (the kinds already exist).
const COMPUTERS = {
  consumed: (resolved, _raw, overlay) => computeConsumed(resolved, overlay),
  gold: (resolved, raw, overlay) => computeGold(resolved, raw, overlay),
  loadout: () => [], // #559
  acquired: () => [], // #665
  removed: () => [], // #665
};

/**
 * Compute the durable live↔doc divergences for one character.
 * @param {Object} resolved - resolved character (ContentContext `characters` entry)
 * @param {Object} raw      - raw authored doc (ContentContext `rawCharacters` entry)
 * @param {Object} overlays - durable overlays keyed by name, e.g.
 *                            { consumed, gold, loadout, acquired, removed }.
 *                            Ephemeral keys are ignored even if present.
 * @returns {Array} PendingChange[]
 */
export const computePendingChanges = (resolved, raw, overlays) => {
  if (!resolved || !raw) return [];
  const ov = overlays && typeof overlays === 'object' ? overlays : {};
  return DURABLE_OVERLAYS.flatMap((key) => COMPUTERS[key](resolved, raw, ov[key]));
};

export default computePendingChanges;
