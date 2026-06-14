// src/hooks/useCharacterLiveState.js
// Reactive view of a single character's full live-state map for the GM
// Character-State inspector (#229) and party dashboard (#230).
//
// SessionContext.getState reads a non-reactive ref and getAllState returns the
// live object — neither re-renders on sync. This hook subscribes to every known
// registry type plus whatever types the character already has, re-snapshotting
// the whole map (copied, so the ref isn't shared) whenever any of them changes.
// Brand-new *unrecognised* keys that appear with no prior subscription are the
// one gap; `refresh()` re-reads on demand to cover that (e.g. on modal open).
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../contexts/SessionContext';
import { LIVE_STATE_REGISTRY } from '../utils/liveStateRegistry';

const KNOWN_TYPES = LIVE_STATE_REGISTRY.map((d) => d.type);

/**
 * @param {string|null} charId
 * @returns {{ liveState: Object, refresh: () => void }}
 */
export function useCharacterLiveState(charId) {
  const { getAllState, subscribe } = useSession();

  const snapshot = useCallback(
    () => ({ ...(getAllState(charId) || {}) }),
    [getAllState, charId],
  );

  const [liveState, setLiveState] = useState(snapshot);
  const refresh = useCallback(() => setLiveState(snapshot()), [snapshot]);

  useEffect(() => {
    if (!charId) {
      setLiveState({});
      return undefined;
    }
    setLiveState(snapshot());
    const present = Object.keys(getAllState(charId) || {});
    const types = Array.from(new Set([...KNOWN_TYPES, ...present]));
    const unsubs = types.map((type) =>
      subscribe(charId, type, () => setLiveState(snapshot())),
    );
    return () => unsubs.forEach((u) => u());
  }, [charId, subscribe, getAllState, snapshot]);

  return { liveState, refresh };
}

export default useCharacterLiveState;
