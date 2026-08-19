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
//
// `options.mergeIncoming(incoming, previous)` lets a caller reshape a
// REMOTE update before it lands (#283) — e.g. a bridge-originated encounter
// push that omits a field it doesn't own so it doesn't clobber the value
// this client already holds for it. Applied only to values arriving via the
// live subscription / gap-read; the initial mount-time read (server or
// localStorage) has no "previous" to merge against and is unaffected.
export const useSyncedState = (key, initialValue, options) => {
  const authoritative = !!options?.authoritative;
  const mergeIncoming = options?.mergeIncoming;
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

  // The value AND the key it was derived for, as one state atom (#1605).
  //
  // They must live in the same `useState` or the re-key path below is unsafe.
  // That path is a render-phase update, and React does not promise a
  // render-phase update survives: when the hook already carries a deferred
  // update (`baseQueue`), the re-derived value is committed but `baseState` is
  // not advanced, so a later pass replays from `baseState` and snaps the value
  // back to what it held before the key changed. If the "already derived for
  // this key" marker were a separate ref — or even a separate state atom, which
  // rebases on its own queue — it would NOT snap back with it: the marker would
  // still read as the new key, the re-derive would never run again, and the
  // hook would return the OLD key's value for good. That is the first-PC-focus
  // dossier bug (#1605): the ally card committed HP once and then re-rendered
  // empty, with no setter call in between and no further key change to repair
  // it. One atom means key and value roll back together, so a rebased render
  // simply re-derives and the hook self-heals.
  const [stored, setStored] = useState(() => ({ key, value: computeInitial() }));

  // Set the value for whatever key the atom currently holds, bailing out when
  // nothing moved (an identical object would otherwise force a re-render, since
  // the atom is a fresh wrapper each time).
  const setValue = useCallback((next) => {
    setStored((s) => (Object.is(s.value, next) ? s : { key: s.key, value: next }));
  }, []);

  // Track the latest value so functional updaters never read a stale closure.
  const latest = useRef(stored.value);

  // When the key changes (e.g. switching characters on a shared hook instance),
  // re-derive the value for the new key synchronously. Without this the previous
  // key's value lingers until a server UPDATE for the new key happens to arrive.
  let current = stored.value;
  if (stored.key !== key) {
    current = computeInitial();
    setStored({ key, value: current });
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
      const merged = mergeIncoming ? mergeIncoming(incoming, latest.current) : incoming;
      latest.current = merged;
      setValue(merged);
      writeLocal(key, merged);
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
        const merged = mergeIncoming ? mergeIncoming(server, latest.current) : server;
        latest.current = merged;
        setValue(merged);
        writeLocal(key, merged);
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
  }, [synced, characterId, stateType, key, subscribe, getState, hydrations, hydrated, defaultValue, setValue, mergeIncoming]);

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
  }, [key, synced, characterId, stateType, sendUpdate, connected, foundryConnected, authoritative, setValue]);

  return [current, setAndSync];
};

export default useSyncedState;
