import { useContext, useEffect, useState } from 'react';
import { CharacterContext } from '../contexts/CharacterContext';
import { useSession } from '../contexts/SessionContext';
import { getCharacterColor } from '../utils/CharacterUtils';

// Shared party-roster reader for the presence rail + party boards. Enumerates the
// campaign PCs, subscribes to each one's cnmh_<stateType>_<id> key (so callers
// re-render as teammates change/lock in), and returns a uniform per-PC view:
//   { char, color, isYou, state, status }
// where `state` is the raw synced value and `status` is derived by `deriveStatus`
// (default: every PC 'planning'). Colors come from roster position, computed
// before any reordering; with `youFirst` (default) the viewer is sorted first.
//
// Returns { party, readyCount, total }. readyCount counts status === 'ready'.
//
// Generalizes the downtime/exploration party hooks: usePartyDowntime layers the
// period-scoped plan/paired/ledger on top; useExplorationReady reads the tally.
export function usePartyActivity(stateType, { youId, deriveStatus, youFirst = true } = {}) {
  const { characters } = useContext(CharacterContext) || {};
  const { getState, subscribe } = useSession();

  const roster = characters || [];
  const idKey = roster.map((c) => c.id).join(',');
  const [, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const unsubs = roster.map((c) => subscribe(c.id, stateType, bump));
    return () => unsubs.forEach((u) => u());
    // idKey is the stable signature of `roster` (a fresh array each render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey, subscribe, stateType]);

  const status = deriveStatus || (() => 'planning');
  const party = roster.map((char, index) => {
    const state = getState(char.id, stateType);
    return {
      char,
      color: getCharacterColor(index),
      isYou: char.id === youId,
      state,
      status: status(state, char),
    };
  });

  const ordered = youFirst
    ? [...party.filter((p) => p.isYou), ...party.filter((p) => !p.isYou)]
    : party;

  return {
    party: ordered,
    readyCount: party.filter((p) => p.status === 'ready').length,
    total: party.length,
  };
}

export default usePartyActivity;
