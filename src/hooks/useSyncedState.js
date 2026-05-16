import { useState, useRef, useEffect, useCallback } from 'react';
import { useSession } from '../contexts/SessionContext';

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

export const useSyncedState = (key, initialValue) => {
  const { getState, sendUpdate, subscribe } = useSession();

  const match = typeof key === 'string' ? key.match(/^cnmh_([^_]+)_(.+)$/) : null;
  const synced = !!match;
  const stateType = match ? match[1] : null;
  const characterId = match ? match[2] : null;

  const [value, setValue] = useState(() => {
    if (synced) {
      const server = getState(characterId, stateType);
      if (server !== undefined) return server;
    }
    const local = readLocal(key);
    if (local.found) return local.value;
    return typeof initialValue === 'function' ? initialValue() : initialValue;
  });

  // Track the latest value so functional updaters never read a stale closure.
  const latest = useRef(value);
  latest.current = value;

  useEffect(() => {
    if (!synced) return undefined;
    return subscribe(characterId, stateType, (incoming) => {
      latest.current = incoming;
      setValue(incoming);
      writeLocal(key, incoming);
    });
  }, [synced, characterId, stateType, key, subscribe]);

  const setAndSync = useCallback((updater) => {
    const next = typeof updater === 'function' ? updater(latest.current) : updater;
    latest.current = next;
    setValue(next);
    writeLocal(key, next);
    if (synced) sendUpdate(characterId, stateType, next);
  }, [key, synced, characterId, stateType, sendUpdate]);

  return [value, setAndSync];
};

export default useSyncedState;
