import { useContext, useEffect, useState } from 'react';
import { CharacterContext } from '../contexts/CharacterContext';
import { useSession } from '../contexts/SessionContext';
import { periodState } from '../utils/downtimeUtils';
import { APP } from '../sync/keys';

// Derives how many party PCs have locked in their downtime plan. Mirrors
// useExplorationReady: subscribes to each PC's cnmh_downtime_<id> key so callers
// rerender on any change. "Ready" is the explicit Party-Ledger lock-in
// (status === 'ready') in the active period — a prior period's stamp reads as
// 'planning'. A craft project awaiting its finish decision still holds its owner.
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
    // idKey is the stable signature of `ids` (a fresh array each render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey, subscribe]);

  // Guard: a zero/null blockDays means no active block — nobody is "ready".
  const days = blockDays != null && blockDays > 0 ? blockDays : null;
  const total = ids.length;
  const readyCount = days == null ? 0 : ids.filter((id) => {
    const dt = getState(id, APP.DOWNTIME);
    const locked = periodState(dt, startedAt).status === 'ready';
    // A project awaiting its finish decision holds the party — the player must
    // choose to complete or keep working before time advances.
    const cp = getState(id, APP.CRAFTPROJECTS);
    const awaiting = (cp?.projects || []).some((p) => p.status === 'awaiting-decision');
    return locked && !awaiting;
  }).length;

  return { readyCount, total, allReady: days != null && total > 0 && readyCount === total };
}

export default useDowntimePartyReady;
