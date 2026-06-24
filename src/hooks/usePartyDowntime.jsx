import { useContext, useEffect, useState } from 'react';
import { CharacterContext } from '../contexts/CharacterContext';
import { useSession } from '../contexts/SessionContext';
import { getCharacterColor } from '../utils/CharacterUtils';
import { periodState } from '../utils/downtimeUtils';

// Reads every party PC's cnmh_downtime_<id> for the active period and returns a
// uniform view for the Party Ledger + presence rail. Subscribes to all PCs so
// the ledger re-renders as teammates edit or lock in (sendUpdate notifies local
// subscribers too, so the viewer's own edits reflect immediately).
//
// Each entry: { char, color, isYou, plan, status, paired, ledger }. Colors come
// from the PC's position in the roster (getCharacterColor), computed before any
// reordering. With `youFirst` (default) the viewer's row is sorted to the top.
//
// Returns { party, readyCount, total }.
export function usePartyDowntime(startedAt, youId, { youFirst = true } = {}) {
  const { characters } = useContext(CharacterContext) || {};
  const { getState, subscribe } = useSession();

  const roster = characters || [];
  const idKey = roster.map((c) => c.id).join(',');
  const [, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const unsubs = roster.map((c) => subscribe(c.id, 'downtime', bump));
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey, subscribe]);

  const party = roster.map((char, index) => {
    const { plan, status, paired, ledger } = periodState(getState(char.id, 'downtime'), startedAt);
    return {
      char,
      color: getCharacterColor(index),
      isYou: char.id === youId,
      plan,
      status,
      paired,
      ledger,
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

export default usePartyDowntime;
