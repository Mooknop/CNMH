import { useState, useRef, useEffect, useCallback } from 'react';
import { useSession, isSandboxWritable } from '../contexts/SessionContext';

// Drop-in replacement for useLocalStorage. Identical [value, setValue] API.
// Keys shaped `cnmh_<type>_<characterId>` are synced via the campaign session;
// any other key (or no SessionProvider) degrades to plain localStorage.

const readLocal = (key) => {
  try {
    const item = window.localStorage.getItem(key);
    return item !== null ? { found: true, value: JSON.parse(item) } : { found: false };
  } catch {
    return { found: false };
  }
};

const writeLocal = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('useSyncedState write failed:', error);
  }
};

const removeLocal = (key) => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable — nothing to purge */
  }
};

// `options.authoritative` marks a GM-authoring write that must survive the
// offline-sandbox freeze even on a per-character resource key (e.g. setting
// party gold from the GM dashboard while Foundry is offline). Player resource
// burns on the same key stay frozen — only callers that opt in bypass.
export const useSyncedState = (key, initialValue, options) => {
  const authoritative = !!options?.authoritative;
  const { getState, sendUpdate, subscribe, connected, foundryConnected, hydrations } = useSession();
  const hydrated = (hydrations || 0) > 0;

  const match = typeof key === 'string' ? key.match(/^cnmh_([^_]+)_(.+)$/) : null;
  const synced = !!match;
  const stateType = match ? match[1] : null;
  const characterId = match ? match[2] : null;

  // Kept in a ref so the reconcile effect can build the default without the
  // (usually inline, identity-unstable) initialValue churning its deps.
  const initialRef = useRef(initialValue);
  initialRef.current = initialValue;
  const defaultValue = useCallback(
    () => (typeof initialRef.current === 'function' ? initialRef.current() : initialRef.current),
    [],
  );

  const computeInitial = () => {
    if (synced) {
      const server = getState(characterId, stateType);
      if (server !== undefined) return server;
      // Hydrated and the server has NO entry for this key: that absence is
      // authoritative — a leftover localStorage copy (e.g. an acquired overlay
      // cleared server-side) must not resurrect. The effect below also purges
      // the stale local entry.
      if (hydrated) return defaultValue();
    }
    const local = readLocal(key);
    if (local.found) return local.value;
    return defaultValue();
  };

  const [value, setValue] = useState(computeInitial);

  // Track the latest value so functional updaters never read a stale closure.
  const latest = useRef(value);
  const prevKey = useRef(key);

  // When the key changes (e.g. switching characters on a shared hook instance),
  // re-derive the value for the new key synchronously. Without this the previous
  // key's value lingers until a server UPDATE for the new key happens to arrive.
  let current = value;
  if (prevKey.current !== key) {
    prevKey.current = key;
    current = computeInitial();
    setValue(current);
  }
  latest.current = current;

  // Which (key, hydration) the render→subscribe gap-read below has already run
  // for. Once per token only: after that the live subscription covers every
  // change, and re-reading on later effect re-runs would loop forever under
  // test mocks that rebuild the session per render AND return a fresh object
  // per getState call (adopt → re-render → adopt …). A new FULL_STATE bumps
  // `hydrations`, minting a new token so each snapshot reconciles exactly once.
  const gapRead = useRef(null);

  useEffect(() => {
    if (!synced) return undefined;
    const unsubscribe = subscribe(characterId, stateType, (incoming) => {
      latest.current = incoming;
      setValue(incoming);
      writeLocal(key, incoming);
    });
    // Close the render→subscribe gap: FULL_STATE (or a peer UPDATE) that lands
    // after computeInitial ran but before this effect subscribed would
    // otherwise be missed forever — this instance stays frozen at initialValue
    // while later-mounted consumers of the same key read the store fresh (the
    // familiar-maneuvers E2E flake: an always-mounted modal's useEncounter
    // never saw the seeded encounter). Safe against clobbering local writes:
    // sendUpdate keeps the serverState cache current too.
    const token = `${hydrations || 0}|${key}`;
    if (gapRead.current !== token) {
      gapRead.current = token;
      const server = getState(characterId, stateType);
      if (server !== undefined && server !== latest.current) {
        latest.current = server;
        setValue(server);
        writeLocal(key, server);
      } else if (server === undefined && hydrated) {
        // The snapshot is authoritative and holds nothing for this key: reset
        // to the default and purge the stale localStorage copy, so a value the
        // server dropped (reconciled overlay, session reset) can't live on in
        // one browser forever.
        const fallback = defaultValue();
        latest.current = fallback;
        setValue(fallback);
        removeLocal(key);
      }
    }
    return unsubscribe;
  }, [synced, characterId, stateType, key, subscribe, getState, hydrations, hydrated, defaultValue]);

  const setAndSync = useCallback((updater) => {
    // Offline sandbox (#553): when the DO is up but Foundry isn't, synced
    // (campaign) writes are inert — no local value change, no localStorage, no
    // sync — so the UI freezes at the last-synced state and nothing gets
    // consumed. Exceptions: local-only keys (no character match), GM-authored
    // `_global` campaign state, and inventory-organization writes (loadout /
    // invested) — see isSandboxWritable.
    if (synced && connected && !foundryConnected && !authoritative && !isSandboxWritable(stateType, characterId)) return;
    const next = typeof updater === 'function' ? updater(latest.current) : updater;
    latest.current = next;
    setValue(next);
    writeLocal(key, next);
    if (synced) sendUpdate(characterId, stateType, next, { force: authoritative });
  }, [key, synced, characterId, stateType, sendUpdate, connected, foundryConnected, authoritative]);

  return [current, setAndSync];
};

export default useSyncedState;
