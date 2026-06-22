import { useEffect, useState } from 'react';
import { useSession } from '../contexts/SessionContext';
import { docGold } from '../utils/gold';

// Live sum of every character's gold (`cnmh_gold_<charId>`). Each PC's gold is a
// plain synced number, but useSyncedState can't be called per-character in a loop
// (rules of hooks), so we read/subscribe through the session directly — the same
// primitives useSyncedState uses. Returns { goldById, total }.

// localStorage value, or undefined on a miss (so the seed can distinguish "no
// stored overlay" from a stored 0 and fall back to the doc gold — #670).
const readLocalGold = (charId) => {
  try {
    const raw = window.localStorage.getItem(`cnmh_gold_${charId}`);
    const v = raw !== null ? JSON.parse(raw) : undefined;
    return typeof v === 'number' ? v : undefined;
  } catch {
    return undefined;
  }
};

const seedGold = (characters, getState, prev = {}) => {
  const out = {};
  for (const c of characters) {
    const id = c.id;
    const server = getState(id, 'gold');
    if (typeof server === 'number') out[id] = server;
    else if (typeof prev[id] === 'number') out[id] = prev[id];
    else {
      const local = readLocalGold(id);
      out[id] = typeof local === 'number' ? local : docGold(c);
    }
  }
  return out;
};

export const usePartyGold = (characters) => {
  const { getState, subscribe } = useSession();
  const chars = characters || [];
  const idsKey = chars.map((c) => c.id).join(',');

  const [goldById, setGoldById] = useState(() => seedGold(chars, getState));

  useEffect(() => {
    setGoldById((prev) => seedGold(chars, getState, prev));
    const unsubs = chars.map((c) =>
      subscribe(c.id, 'gold', (val) => {
        setGoldById((prev) => ({ ...prev, [c.id]: typeof val === 'number' ? val : Number(val) || 0 }));
      }),
    );
    return () => unsubs.forEach((u) => u());
    // idsKey is the stable signature of the roster; getState/subscribe are stable;
    // `chars` is re-read inside on every roster change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const total = Object.values(goldById).reduce((sum, v) => sum + (Number(v) || 0), 0);
  return { goldById, total };
};

export default usePartyGold;
