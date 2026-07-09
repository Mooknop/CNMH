import { usePartyActivity } from './usePartyActivity';
import { useSyncedState } from './useSyncedState';
import { APP, globalKey } from '../sync/keys';

// Derives whether the whole party is ready to leave the exploration Activity
// state and move. "Ready" = every party PC has locked in an exploration activity
// (its `cnmh_exploration_<id>` is non-null), OR the GM has flipped the
// `cnmh_exploreoverride_global` override.
//
// Readiness is purely derived: each PC's pick is a synced key, so every client
// computes the same answer. Built on the shared usePartyActivity reader (a pick
// counts as 'ready'); recomputes on any party pick change.
//
// Returns:
//   ready     — allChosen || override (drives the Activity → Movement switch)
//   allChosen — every party PC has a non-null pick
//   override  — GM "Start movement" override
//   ids       — party PC ids considered
export function useExplorationReady() {
  const [override] = useSyncedState(globalKey(APP.EXPLOREOVERRIDE), false);
  const { party, total } = usePartyActivity('exploration', {
    deriveStatus: (state) => (state != null ? 'ready' : 'planning'),
  });

  const ids = party.map((p) => p.char.id);
  const allChosen = total > 0 && party.every((p) => p.status === 'ready');

  return { ready: allChosen || override, allChosen, override, ids };
}

export default useExplorationReady;
