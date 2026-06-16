import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import { useEncounter } from './useEncounter';

// Command Sheet reach gate (#430). Reads the bridge adjacency relay
// (`cnmh_adjacency_global` = { [entryId]: [adjacentEntryId, …] }, keyed by the
// Foundry combatant id, which equals the app order entryId) and answers "is the
// viewer's token adjacent to <entryId>?" for reach-limited support actions.
//
// Graceful by design: when there's no relay data (bridge offline, no tokens on a
// map) or the viewer has no order entry, `inReach` returns true — we never
// hard-disable an action on absent/stale position data.
export const useAdjacency = (charId) => {
  const [map] = useSyncedState('cnmh_adjacency_global', {});
  const { encounter } = useEncounter();

  const hasData = !!map && Object.keys(map).length > 0;
  const viewerEntryId =
    (encounter?.order || []).find((e) => e.kind === 'pc' && e.charId === charId)?.entryId || null;

  const inReach = useCallback(
    (entryId) => {
      if (!hasData || !viewerEntryId || !entryId) return true;
      return (map[viewerEntryId] || []).includes(entryId);
    },
    [hasData, viewerEntryId, map]
  );

  return { hasData, viewerEntryId, inReach };
};

export default useAdjacency;
