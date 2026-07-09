import { useContext, useEffect, useState, useCallback } from 'react';
import { CharacterContext } from '../contexts/CharacterContext';
import { useSession } from '../contexts/SessionContext';
import { useSyncedState } from './useSyncedState';
import { APP, syncKey, globalKey } from '../sync/keys';

// Coordination spine for the party "Take 10" flow (epic #536).
//
// A Take 10 is broadcast over the session-level `cnmh_take10_global`:
//   { active, openedAt, startedBy }
// `openedAt` is a monotonically-fresh stamp (Date.now()) identifying the
// current beat. Each player's allocation lives on their own
// `cnmh_take10alloc_<charId>`:
//   { beatAt, ready, activities: [{ id, label, minutes }] }
// `beatAt === openedAt` scopes the alloc to the live beat — the same
// declarative-stamp idiom downtime uses, so opening a new beat invalidates
// every prior ready/allocation without any cross-client fan-out write.
//
// The block length (`minutes`) is DERIVED — the party-max of everyone's total
// allocation, floored at 10. Because every alloc is synced, all clients compute
// the same value, so there is no second single-writer problem for the clock:
// the GM advance (PlayModeControl) just reads this derived `minutes`.
//
// All-ready is likewise derived: every party PC carries the live beat stamp and
// `ready`. We subscribe to each PC's alloc key and recompute on any change.

const MIN_BLOCK = 10;

const minutesOf = (a, openedAt) =>
  a && a.beatAt === openedAt
    ? (a.activities || []).reduce((s, x) => s + (x.minutes || 0), 0)
    : 0;

export function useTake10(charId = null) {
  const { characters } = useContext(CharacterContext) || {};
  const { getState, subscribe } = useSession();
  const [global, setGlobal] = useSyncedState(globalKey(APP.TAKE10), {
    active: false,
    openedAt: 0,
    startedBy: null,
  });
  const [alloc, setAlloc] = useSyncedState(syncKey(APP.TAKE10ALLOC, charId || 'nobody'), null);

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

  const start = useCallback(() => {
    setGlobal({ active: true, openedAt: Date.now(), startedBy: charId });
  }, [setGlobal, charId]);

  const clear = useCallback(() => {
    setGlobal((prev) => ({ ...(prev || {}), active: false }));
  }, [setGlobal]);

  // Return prev when it already belongs to the live beat, else a fresh
  // beat-stamped shell — so the first edit of a new beat drops stale state.
  const withBeat = useCallback(
    (prev) =>
      prev && prev.beatAt === openedAt
        ? prev
        : { beatAt: openedAt, ready: false, activities: [] },
    [openedAt]
  );

  const setReady = useCallback(
    (isReady) => setAlloc((prev) => ({ ...withBeat(prev), ready: !!isReady })),
    [setAlloc, withBeat]
  );

  const addActivity = useCallback(
    (activity) =>
      setAlloc((prev) => {
        const cur = withBeat(prev);
        return { ...cur, activities: [...cur.activities, activity] };
      }),
    [setAlloc, withBeat]
  );

  const removeActivity = useCallback(
    (index) =>
      setAlloc((prev) => {
        const cur = withBeat(prev);
        return { ...cur, activities: cur.activities.filter((_, i) => i !== index) };
      }),
    [setAlloc, withBeat]
  );

  const myAlloc = alloc && alloc.beatAt === openedAt ? alloc : null;
  const activities = myAlloc?.activities || [];
  const myMinutes = activities.reduce((s, x) => s + (x.minutes || 0), 0);
  const ready = active && !!myAlloc?.ready;

  // Block length = party-max total allocation, floored at MIN_BLOCK.
  const minutes = Math.max(
    MIN_BLOCK,
    ...ids.map((id) => minutesOf(getState(id, APP.TAKE10ALLOC), openedAt))
  );

  const readyCount = active
    ? ids.filter((id) => {
        const a = getState(id, APP.TAKE10ALLOC);
        return a && a.beatAt === openedAt && a.ready;
      }).length
    : 0;
  const allReady = active && ids.length > 0 && readyCount === ids.length;

  return {
    active,
    openedAt,
    minutes,
    myMinutes,
    activities,
    startedBy: global?.startedBy ?? null,
    start,
    clear,
    ready,
    setReady,
    addActivity,
    removeActivity,
    readyCount,
    allReady,
    ids,
  };
}

export default useTake10;
