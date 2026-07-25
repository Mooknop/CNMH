import { useCallback, useSyncExternalStore } from 'react';

// Device-local preference store (#1575 D3). The app had no prefs rail — synced
// keys are campaign state and localStorage was only ever an implementation
// detail of useSyncedState. This is the deliberate third thing: a setting that
// belongs to THIS DEVICE (e.g. "this phone rolls physical dice"), never synced,
// surviving reloads, reactive across every mounted consumer in the tab.
//
// PRIMITIVE VALUES ONLY (boolean/string/number): getSnapshot re-reads
// localStorage each call and useSyncExternalStore compares with Object.is — an
// object value would re-render forever. Enforce by convention.

const PREFIX = 'cnmh-devicepref-';
const listeners = new Set();

const read = (name, fallback) => {
  try {
    const raw = window.localStorage.getItem(PREFIX + name);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};

// Exported for non-hook callers and tests.
export const setDevicePref = (name, value) => {
  try {
    window.localStorage.setItem(PREFIX + name, JSON.stringify(value));
  } catch {
    // Private mode / quota: the in-tab notify below still works for this session.
  }
  listeners.forEach((listener) => listener());
};

const subscribe = (callback) => {
  listeners.add(callback);
  return () => listeners.delete(callback);
};

export function useDevicePref(name, fallback = false) {
  const value = useSyncExternalStore(
    subscribe,
    useCallback(() => read(name, fallback), [name, fallback])
  );
  const set = useCallback((next) => setDevicePref(name, next), [name]);
  return [value, set];
}

export default useDevicePref;
