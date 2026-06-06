import { useContext, useEffect, useState } from 'react';
import { CharacterContext } from '../contexts/CharacterContext';
import { useSession } from '../contexts/SessionContext';
import { getDaysCommitted } from '../utils/downtimeUtils';

// Derives how many party PCs have committed all their granted downtime days.
// Mirrors useExplorationReady: subscribes to each PC's cnmh_downtime_<id> key
// so callers rerender on any commit.
//
// Returns { readyCount, total, allReady }.
export function useDowntimePartyReady(blockDays) {
  const { characters } = useContext(CharacterContext) || {};
  const { getState, subscribe } = useSession();

  const ids = (characters || []).map((c) => c.id);
  const idKey = ids.join(',');

  const [, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const unsubs = ids.map((id) => subscribe(id, 'downtime', bump));
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey, subscribe]);

  const days = blockDays || 0;
  const total = ids.length;
  const readyCount = ids.filter((id) => {
    const dt = getState(id, 'downtime');
    return getDaysCommitted(dt?.ledger) >= days;
  }).length;

  return { readyCount, total, allReady: total > 0 && readyCount === total };
}

export default useDowntimePartyReady;
