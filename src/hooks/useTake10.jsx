import { useContext, useEffect, useState, useCallback } from 'react';
import { CharacterContext } from '../contexts/CharacterContext';
import { useSession } from '../contexts/SessionContext';
import { useSyncedState } from './useSyncedState';

// Coordination spine for the party "Take 10" flow (#560, epic #536).
//
// A Take 10 is broadcast over the session-level `cnmh_take10_global`:
//   { active, minutes, openedAt, startedBy }
// `openedAt` is a monotonically-fresh stamp (Date.now()) identifying the
// current beat. Each player marks themselves ready by stamping their own
// `cnmh_take10alloc_<charId>` with `readyAt === openedAt` — the same
// declarative-stamp idiom downtime uses, so starting a new beat invalidates
// every prior ready without any cross-client fan-out write.
//
// All-ready is purely derived: every party PC's alloc carries the live stamp.
// We subscribe to each PC's alloc key and recompute on any change (sendUpdate
// notifies local subscribers too, so the toggling client reacts immediately).
//
// Returns:
//   active     — a Take 10 is in progress
//   minutes    — block length to advance on completion (fixed 10 in Slice 1)
//   startedBy  — charId that launched it
//   start(min) — open a Take 10 (fresh openedAt stamp)
//   clear()    — close it (GM-side, on completion or cancel)
//   ready      — this charId has stamped readiness for the current beat
//   setReady(b)— stamp / unstamp this charId's readiness
//   allReady   — active && every party PC is ready for the current beat
//   ids        — party PC ids considered
export function useTake10(charId = null) {
  const { characters } = useContext(CharacterContext) || {};
  const { getState, subscribe } = useSession();
  const [global, setGlobal] = useSyncedState('cnmh_take10_global', {
    active: false,
    minutes: 10,
    openedAt: 0,
    startedBy: null,
  });
  const [alloc, setAlloc] = useSyncedState(`cnmh_take10alloc_${charId || 'nobody'}`, null);

  const ids = (characters || []).map((c) => c.id);
  const idKey = ids.join(',');
  const openedAt = global?.openedAt ?? 0;
  const active = !!global?.active;

  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const unsubs = ids.map((id) => subscribe(id, 'take10alloc', bump));
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey, subscribe]);

  const start = useCallback((minutes = 10) => {
    setGlobal({ active: true, minutes, openedAt: Date.now(), startedBy: charId });
  }, [setGlobal, charId]);

  const clear = useCallback(() => {
    setGlobal((prev) => ({ ...(prev || {}), active: false }));
  }, [setGlobal]);

  const setReady = useCallback((isReady) => {
    setAlloc((prev) => ({ ...(prev || {}), readyAt: isReady ? openedAt : null }));
  }, [setAlloc, openedAt]);

  const ready = active && alloc?.readyAt === openedAt;
  const readyCount = active
    ? ids.filter((id) => getState(id, 'take10alloc')?.readyAt === openedAt).length
    : 0;
  const allReady = active && ids.length > 0 && readyCount === ids.length;

  return {
    active,
    minutes: global?.minutes ?? 10,
    startedBy: global?.startedBy ?? null,
    start,
    clear,
    ready,
    setReady,
    allReady,
    readyCount,
    ids,
  };
}

export default useTake10;
