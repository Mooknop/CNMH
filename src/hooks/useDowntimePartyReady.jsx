import { useContext, useEffect, useState } from 'react';
import { CharacterContext } from '../contexts/CharacterContext';
import { useSession } from '../contexts/SessionContext';
import { getDaysCommitted, periodState } from '../utils/downtimeUtils';

// Derives how many party PCs have committed all their granted downtime days.
// Mirrors useExplorationReady: subscribes to each PC's cnmh_downtime_<id> key
// so callers rerender on any commit. Only days committed in the active period
// (matching startedAt) count — a prior period's ledger reads as empty.
//
// Returns { readyCount, total, allReady }.
export function useDowntimePartyReady(blockDays, startedAt) {
  const { characters } = useContext(CharacterContext) || {};
  const { getState, subscribe } = useSession();

  const ids = (characters || []).map((c) => c.id);
  const idKey = ids.join(',');

  const [, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    // Re-derive on commits (downtime) and on craft-project changes — a project
    // awaiting a finish decision pauses its owner's readiness.
    const unsubs = ids.flatMap((id) => [
      subscribe(id, 'downtime', bump),
      subscribe(id, 'craftprojects', bump),
    ]);
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey, subscribe]);

  // Guard: a zero/null blockDays means no active block — nobody is "ready".
  // Without this, getDaysCommitted(ledger) >= 0 is trivially true for everyone.
  const days = blockDays != null && blockDays > 0 ? blockDays : null;
  const total = ids.length;
  const readyCount = days == null ? 0 : ids.filter((id) => {
    const dt = getState(id, 'downtime');
    const daysDone = getDaysCommitted(periodState(dt, startedAt).ledger) >= days;
    // A project awaiting its finish decision holds the party — the player must
    // choose to complete or keep working before time advances.
    const cp = getState(id, 'craftprojects');
    const awaiting = (cp?.projects || []).some((p) => p.status === 'awaiting-decision');
    return daysDone && !awaiting;
  }).length;

  return { readyCount, total, allReady: days != null && total > 0 && readyCount === total };
}

export default useDowntimePartyReady;
