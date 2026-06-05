import { useContext, useEffect, useState } from 'react';
import { CharacterContext } from '../contexts/CharacterContext';
import { useSession } from '../contexts/SessionContext';
import { useSyncedState } from './useSyncedState';

// Derives whether the whole party is ready to leave the exploration Activity
// state and move. "Ready" = every party PC has locked in an exploration
// activity (its `cnmh_exploration_<id>` is non-null), OR the GM has flipped the
// `cnmh_exploreoverride_global` override.
//
// Readiness is purely derived: each PC's pick is a synced key, so every client
// computes the same answer. We subscribe to all party picks and recompute on
// any change (sendUpdate notifies local subscribers too, so the picker's own
// client reacts immediately).
//
// Returns:
//   ready     — allChosen || override (drives the Activity → Movement switch)
//   allChosen — every party PC has a non-null pick
//   override  — GM "Start movement" override
//   ids       — party PC ids considered
export function useExplorationReady() {
  const { characters } = useContext(CharacterContext) || {};
  const { getState, subscribe } = useSession();
  const [override] = useSyncedState('cnmh_exploreoverride_global', false);

  const ids = (characters || []).map((c) => c.id);
  const idKey = ids.join(',');

  const [, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const unsubs = ids.map((id) => subscribe(id, 'exploration', bump));
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey, subscribe]);

  const allChosen =
    ids.length > 0 && ids.every((id) => getState(id, 'exploration') != null);

  return { ready: allChosen || override, allChosen, override, ids };
}

export default useExplorationReady;
