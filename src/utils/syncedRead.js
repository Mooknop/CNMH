// Reading a synced per-character value outside React (#1649, #1671).
//
// Lifted verbatim out of turnEffects.js, which was its first home: the
// encounter-end cleanup (then useEncounter's endEncounter, now the GM sweep in
// partySweep.js) needed the identical read and is not a turn-boundary concern,
// and the pattern already had three hand-rolled copies elsewhere
// (useReconciliation.jsx, usePartyGold.jsx, applyEarnIncome.js). One
// primitive, one place.

import { syncKey } from '../sync/keys';

// `undefined` for "no local copy", so an absent entry is distinguishable from a
// stored `null` — same absent/present contract the session cache uses.
export const readLocal = (key) => {
  try {
    const item = window.localStorage.getItem(key);
    return item === null ? undefined : JSON.parse(item);
  } catch { return undefined; }
};

/**
 * Read a synced per-character value the way the rest of the app does (#1649):
 * the session cache is the authority, localStorage is only a fallback.
 *
 * Callers used to read localStorage alone, and a value that merely ARRIVED on
 * this client never gets there: useSyncedState's computeInitial takes it from
 * the session store during render, and the writeLocal only happens on the
 * subscribe / gap-read path and on sendUpdate. So a client that received a
 * grant, effect, stance or playing flag held it in the session cache and in
 * React state but not in localStorage — and the reader looked in the one place
 * it wasn't, silently doing nothing until some client that had WRITTEN the
 * entry ran the same code.
 *
 * The fallback still matters: with no SessionProvider (NOOP_SESSION) or in the
 * offline sandbox — where sendUpdate returns before touching the cache but a
 * direct writeLocal caller already hit storage — localStorage is all there is.
 *
 * `getState` is required, not optional. Degrading to localStorage when no
 * reader is supplied IS the bug, and its failure mode is a silent no-op that no
 * caller would notice; throwing makes a half-wired caller fail immediately.
 *
 * @param {Function} getState  - (charId, stateType) => value, from useSession
 * @param {string}   charId
 * @param {string}   stateType - an APP.* key type
 */
export const readThrough = (getState, charId, stateType) => {
  if (typeof getState !== 'function') {
    throw new TypeError('readThrough requires a getState reader (see #1649)');
  }
  const cached = getState(charId, stateType);
  if (cached !== undefined) return cached;
  return readLocal(syncKey(stateType, charId));
};

/** readThrough for keys whose value is a list; anything else reads as empty. */
export const readThroughList = (getState, charId, stateType) => {
  const value = readThrough(getState, charId, stateType);
  return Array.isArray(value) ? value : [];
};
