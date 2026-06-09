import { useEffect, useState } from 'react';
import { useSession } from '../contexts/SessionContext';

// Live sum of every character's gold (`cnmh_gold_<charId>`). Each PC's gold is a
// plain synced number, but useSyncedState can't be called per-character in a loop
// (rules of hooks), so we read/subscribe through the session directly — the same
// primitives useSyncedState uses. Returns { goldById, total }.

const readLocalGold = (charId) => {
  try {
    const raw = window.localStorage.getItem(`cnmh_gold_${charId}`);
    return raw !== null ? JSON.parse(raw) : 0;
  } catch {
    return 0;
  }
};

const seedGold = (ids, getState, prev = {}) => {
  const out = {};
  for (const id of ids) {
    const server = getState(id, 'gold');
    if (typeof server === 'number') out[id] = server;
    else if (typeof prev[id] === 'number') out[id] = prev[id];
    else out[id] = readLocalGold(id);
  }
  return out;
};

export const usePartyGold = (characters) => {
  const { getState, subscribe } = useSession();
  const ids = (characters || []).map((c) => c.id);
  const idsKey = ids.join(',');

  const [goldById, setGoldById] = useState(() => seedGold(ids, getState));

  useEffect(() => {
    const list = idsKey ? idsKey.split(',') : [];
    setGoldById((prev) => seedGold(list, getState, prev));
    const unsubs = list.map((id) =>
      subscribe(id, 'gold', (val) => {
        setGoldById((prev) => ({ ...prev, [id]: typeof val === 'number' ? val : Number(val) || 0 }));
      }),
    );
    return () => unsubs.forEach((u) => u());
    // idsKey is the stable signature of the roster; getState/subscribe are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const total = Object.values(goldById).reduce((sum, v) => sum + (Number(v) || 0), 0);
  return { goldById, total };
};

export default usePartyGold;
