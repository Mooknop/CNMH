import { APP, syncKey } from '../sync/keys';
import { itemUidOf } from './affix';
import { contributes } from './wornGear';

// Resonant-power / wayfinder model for aeon stones (#928 — engine spine).
//
// Several aeon stones grant their headline benefit only as a *Resonant Power* —
// active only while the stone is slotted into a *wayfinder* (PF2e). Modeling the
// stone as a plain invested item would wrongly make a resonant-only benefit
// (e.g. Pearly White Spindle's void resistance, #911) always-on while merely
// invested. This is the socket relationship + resonant-active resolution that
// gates those powers.
//
// The relationship is a per-character overlay keyed by the *socket* (wayfinder),
// mirroring the talisman-affix overlay (utils/affix.js) — keying by the wayfinder
// gives "one stone per socket" by construction:
//
//   cnmh_wayfinder_<charId> = { [wayfinderUid]: aeonStoneUid }
//
// Content authors a `resonant` block on the stone; `applyResonant` hoists it to
// the stone's top level ONLY when the stone is resonant-active, so the existing
// readers surface it with zero reader changes:
//   resonant.resistance    → resistance      (worn-resistance field, #911)
//   resonant.modifiers      → modifiers        (passive-bonus family, #922/#730)
//   resonant.grantedSpells  → grantedSpells    (innate-spell family, #914)
//
// React-free; the slot/unslot writers and the resolution live here so both the
// reactive hooks and the imperative persistent-tick path can share them.

/** Synced-state key for a character's wayfinder-slot overlay. */
export const wayfinderKey = (charId) => syncKey(APP.WAYFINDER, charId);

/** Whether an item is an aeon stone (can be slotted into a wayfinder). */
export const isAeonStone = (item) =>
  /^aeon-stone/.test(String(item?.id || '')) || /^aeon stone/i.test(String(item?.name || ''));

/** Whether an item is a wayfinder (has a socket for one aeon stone). */
export const isWayfinder = (item) =>
  /wayfinder/i.test(String(item?.id || '')) || /wayfinder/i.test(String(item?.name || ''));

/** The stone uid slotted into a wayfinder, or null. */
export const slottedStoneUid = (overlay, wayfinderUid) =>
  (overlay && typeof overlay === 'object' ? overlay[wayfinderUid] : undefined) ?? null;

/** The wayfinder uid a stone is slotted into, or null. */
export const wayfinderOfStone = (overlay, stoneUid) => {
  if (!overlay || typeof overlay !== 'object' || stoneUid == null) return null;
  for (const [wfUid, sUid] of Object.entries(overlay)) {
    if (sUid === stoneUid) return wfUid;
  }
  return null;
};

/** Set of stone uids currently slotted somewhere (for filtering displays). */
export const slottedStoneUidSet = (overlay) =>
  new Set(Object.values(overlay && typeof overlay === 'object' ? overlay : {}).filter((v) => v != null));

/**
 * Slot a stone into a wayfinder, returning the next overlay (immutable). A stone
 * lives in one socket, so it is first removed from any other wayfinder holding
 * it; the target wayfinder's previous stone (if any) is displaced.
 */
export const slotStone = (overlay, wayfinderUid, stoneUid) => {
  const next = { ...(overlay && typeof overlay === 'object' ? overlay : {}) };
  // Remove the stone from any other socket it currently occupies.
  for (const [wfUid, sUid] of Object.entries(next)) {
    if (sUid === stoneUid) delete next[wfUid];
  }
  next[wayfinderUid] = stoneUid;
  return next;
};

/** Empty a wayfinder's socket, returning the next overlay (immutable). */
export const unslotStone = (overlay, wayfinderUid) => {
  const next = { ...(overlay && typeof overlay === 'object' ? overlay : {}) };
  delete next[wayfinderUid];
  return next;
};

/** Aeon stones a wayfinder can hold (excludes the wayfinder itself). */
export const validSlotStones = (items, wayfinder) => {
  const selfUid = itemUidOf(wayfinder);
  return (Array.isArray(items) ? items : []).filter(
    (it) => isAeonStone(it) && itemUidOf(it) !== selfUid
  );
};

/**
 * The stone uids whose resonant power is currently active. A resonant power is
 * active when the stone is slotted into a wayfinder that is worn AND invested,
 * the stone itself is invested, and — per the PF2e "one wayfinder with a slotted
 * resonant aeon stone" limit — it is the first qualifying binding. Returns a Set
 * of 0 or 1 uids, deterministic by the wayfinder's inventory order.
 *
 * @param {Array}    inventory  - effective (state-stamped) inventory
 * @param {Object}   overlay    - cnmh_wayfinder_<charId>
 * @param {Function} isInvested - (uid) => boolean
 * @returns {Set<string>}
 */
export const resonantActiveStoneUids = (inventory, overlay, isInvested) => {
  const active = new Set();
  if (!overlay || typeof overlay !== 'object') return active;
  const items = Array.isArray(inventory) ? inventory : [];
  const byUid = new Map(items.map((it) => [itemUidOf(it), it]));
  const inv = typeof isInvested === 'function' ? isInvested : () => false;
  // Walk wayfinders in inventory order so the one-per-character winner is stable.
  for (const wf of items) {
    if (!isWayfinder(wf)) continue;
    const wfUid = itemUidOf(wf);
    const stoneUid = slottedStoneUid(overlay, wfUid);
    if (stoneUid == null) continue;
    const stone = byUid.get(stoneUid);
    if (!stone || !isAeonStone(stone)) continue;
    // Host wayfinder must be worn+invested; the stone must be invested.
    if (!contributes(wf, inv)) continue;
    if (!inv(stoneUid)) continue;
    active.add(stoneUid);
    break; // one resonant aeon stone per character
  }
  return active;
};

/**
 * Hoist a stone's `resonant` block to its top level so the standard readers see
 * it (resistance / modifiers / grantedSpells). Returns the item unchanged when
 * it carries no `resonant` block. Non-destructive (returns a new object).
 */
export const resonantMerge = (stoneItem) => {
  const r = stoneItem?.resonant;
  if (!r || typeof r !== 'object') return stoneItem;
  const merged = { ...stoneItem };
  if (r.resistance && typeof r.resistance === 'object') {
    merged.resistance = r.resistance;
  }
  if (Array.isArray(r.modifiers) && r.modifiers.length) {
    merged.modifiers = [...(Array.isArray(stoneItem.modifiers) ? stoneItem.modifiers : []), ...r.modifiers];
  }
  if (Array.isArray(r.grantedSpells) && r.grantedSpells.length) {
    merged.grantedSpells = [
      ...(Array.isArray(stoneItem.grantedSpells) ? stoneItem.grantedSpells : []),
      ...r.grantedSpells,
    ];
  }
  return merged;
};

/**
 * Return the inventory with every resonant-active stone's `resonant` block
 * hoisted (via resonantMerge); non-active items are returned untouched
 * (referentially identical). The single home for turning the slot overlay into
 * an inventory the family readers already understand.
 *
 * @param {Array}    inventory  - effective (state-stamped) inventory
 * @param {Object}   overlay    - cnmh_wayfinder_<charId>
 * @param {Function} isInvested - (uid) => boolean
 * @returns {Array}
 */
export const applyResonant = (inventory, overlay, isInvested) => {
  const items = Array.isArray(inventory) ? inventory : [];
  const active = resonantActiveStoneUids(items, overlay, isInvested);
  if (!active.size) return items;
  return items.map((it) => (active.has(itemUidOf(it)) ? resonantMerge(it) : it));
};
