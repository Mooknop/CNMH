// Chambered-ammunition resolver (epic #672, S1). Pure helpers — no React/Foundry.
//
// Models PF2e capacity/reload weapons (e.g. Ashka's Crescent Cross, a Combination
// weapon with Capacity 3 / Reload 1). A capacity weapon holds several chambers;
// each is Reloaded individually as its own action, and the ranged Strike only
// fires from a loaded chamber. A chamber holds either the weapon's default
// infinite bolt (Activate 0, no on-hit) or a special-ammunition item from
// inventory (e.g. Beacon Shot — Activate 1, on-hit effect).
//
// Content shape this reads (added to src/data/snapshot.json in the S1 content PR):
//
//   Ranged strike (crescent-cross "Crescent Cross Bolt"):
//     { "capacity": 3, "reload": 1, "ammoType": "bolt", traits:[…, "Capacity 3"] }
//
//   Special ammo (beacon-shot) — an `ammunition` block on the item:
//     "ammunition": {
//       "types": ["arrow", "bolt"],   // weapon ammo types this loads into
//       "activate": 1,                // extra actions to fire (manipulate)
//       "traits": ["Manipulate"],
//       "effectId": "beacon-shot",    // catalog effect applied on hit
//       "onHit": true
//     }
//
// This slice is data + resolver only: no chamber state, no behaviour change.

/**
 * The weapon's chamber capacity (how many bolts it holds), or null when the
 * strike isn't a capacity weapon. Prefers the structured `capacity` field and
 * falls back to parsing the `Capacity N` display trait.
 *
 * @param {Object} strike - a weapon strike (item.strikes[i])
 * @returns {number|null}
 */
export function weaponCapacity(strike) {
  if (!strike) return null;
  if (typeof strike.capacity === 'number' && strike.capacity > 0) return strike.capacity;
  for (const t of strike.traits || []) {
    const m = String(t).match(/^Capacity\s+(\d+)$/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > 0) return n;
    }
  }
  return null;
}

/**
 * The action cost to Reload one chamber. Prefers the structured `reload` field
 * and falls back to a `Reload N` display trait. Returns null when the strike
 * declares no reload cost (i.e. not a reloaded weapon).
 *
 * @param {Object} strike
 * @returns {number|null}
 */
export function reloadCost(strike) {
  if (!strike) return null;
  if (typeof strike.reload === 'number' && strike.reload >= 0) return strike.reload;
  for (const t of strike.traits || []) {
    const m = String(t).match(/^Reload\s+(\d+)$/i);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

/** Whether a strike is a capacity/chambered weapon (has a positive capacity). */
export const isCapacityWeapon = (strike) => weaponCapacity(strike) != null;

/**
 * The ammo type a weapon strike fires (e.g. "bolt"), lower-cased, or null.
 * @param {Object} strike
 * @returns {string|null}
 */
export function weaponAmmoType(strike) {
  const t = strike?.ammoType;
  return typeof t === 'string' && t ? t.toLowerCase() : null;
}

/**
 * The item's `ammunition` metadata block, or null when the item isn't loadable
 * special ammunition.
 * Shape: { types: string[], activate?: number, traits?: string[], effectId?, onHit?: boolean }
 *
 * @param {Object} item
 * @returns {Object|null}
 */
export function ammoBlock(item) {
  const block = item?.ammunition;
  if (!block || typeof block !== 'object' || Array.isArray(block)) return null;
  return block;
}

/**
 * Whether an inventory item is special ammunition that can load the given weapon
 * strike. True when the item carries an `ammunition` block whose `types` include
 * the weapon's ammo type. A capacity weapon with no declared ammoType accepts
 * any ammunition; ammo with no declared types loads any matching weapon.
 *
 * @param {Object} item        - candidate inventory consumable
 * @param {Object} weaponStrike - the ranged strike being loaded
 * @returns {boolean}
 */
export function isAmmoEligible(item, weaponStrike) {
  const block = ammoBlock(item);
  if (!block || !isCapacityWeapon(weaponStrike)) return false;
  const weaponType = weaponAmmoType(weaponStrike);
  const ammoTypes = (block.types || []).map((t) => String(t).toLowerCase());
  if (!weaponType || ammoTypes.length === 0) return true;
  return ammoTypes.includes(weaponType);
}

/**
 * The extra action cost to fire a loaded chamber, charged on top of the Strike's
 * own action: 0 for a plain bolt (no `ammunition` block) and N for special ammo
 * (its `ammunition.activate`).
 *
 * @param {Object} ammoRef - the default-bolt descriptor or a special-ammo item
 * @returns {number}
 */
export function ammoActivateCost(ammoRef) {
  const block = ammoBlock(ammoRef);
  if (!block) return 0;
  return typeof block.activate === 'number' && block.activate > 0 ? block.activate : 0;
}

/**
 * The weapon's default infinite bolt — the chamber's fallback load. Untracked
 * (no inventory decrement), Activate 0, no on-hit effect. Named after the strike
 * (e.g. "Crescent Cross Bolt").
 *
 * @param {Object} strike
 * @returns {{ name: string, default: true, infinite: true, activate: 0, onHit: false }}
 */
export function defaultAmmo(strike) {
  return {
    name: strike?.name || 'Bolt',
    default: true,
    infinite: true,
    activate: 0,
    onHit: false,
  };
}

// ── Chamber state (epic #672, S2) ────────────────────────────────────────────
//
// The mutable per-weapon loading state lives in the synced overlay
//   cnmh_chambers_<characterId> = { [weaponUid]: ChamberState }
// where ChamberState = { chambers: Array<null | AmmoRef>, pointer: number }.
// `chambers.length` equals the weapon's capacity (S1); `null` is an empty
// chamber; `pointer` is the chamber the next fire defaults to (auto-advanced
// after firing in S4). These helpers are pure — the useChambers hook owns the
// writes, getStrikes reads the load state through them.

/**
 * A fresh, all-empty chamber state for a weapon of the given capacity.
 * @param {number} capacity
 * @returns {{ chambers: Array<null>, pointer: number }}
 */
export function emptyChamberState(capacity) {
  const n = typeof capacity === 'number' && capacity > 0 ? Math.floor(capacity) : 0;
  return { chambers: new Array(n).fill(null), pointer: 0 };
}

/**
 * Coerce a possibly-absent or malformed stored chamber state into a well-formed
 * one sized to `capacity`: extra chambers are dropped, missing chambers padded
 * empty, and the pointer wrapped into range. Always returns a fresh object.
 *
 * @param {Object|null|undefined} state - stored ChamberState (may be partial)
 * @param {number} capacity
 * @returns {{ chambers: Array<null|Object>, pointer: number }}
 */
export function normalizeChamberState(state, capacity) {
  const base = emptyChamberState(capacity);
  const len = base.chambers.length;
  if (state && Array.isArray(state.chambers)) {
    for (let i = 0; i < len; i += 1) {
      const c = state.chambers[i];
      base.chambers[i] = c == null ? null : c;
    }
  }
  if (len > 0 && Number.isInteger(state?.pointer)) {
    base.pointer = ((state.pointer % len) + len) % len;
  }
  return base;
}

/** How many chambers hold ammo. */
export function loadedCount(state) {
  if (!state || !Array.isArray(state.chambers)) return 0;
  return state.chambers.reduce((n, c) => (c != null ? n + 1 : n), 0);
}

/** Index of the first loaded chamber, or -1 when all are empty. */
export function firstLoadedChamber(state) {
  if (!state || !Array.isArray(state.chambers)) return -1;
  return state.chambers.findIndex((c) => c != null);
}

/** Index of the first empty chamber, or -1 when every chamber is full. */
export function nextEmptyChamber(state) {
  if (!state || !Array.isArray(state.chambers)) return -1;
  return state.chambers.findIndex((c) => c == null);
}

/** The ammo ref the pointer currently rests on (null when empty/out of range). */
export function pointerChamber(state) {
  if (!state || !Array.isArray(state.chambers)) return null;
  const i = Number.isInteger(state.pointer) ? state.pointer : 0;
  return state.chambers[i] ?? null;
}
