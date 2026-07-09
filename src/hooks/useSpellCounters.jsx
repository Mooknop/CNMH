import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import { APP, syncKey } from '../sync/keys';

// Read + mutate a character's per-spell counter ledger (#220), synced at
// `cnmh_spellcounters_<charId>`. Registration happens React-free in the cast
// modal (utils/spellCounter.registerSpellCounter); this hook drives the
// EffectsPanel controls (pop an image / grow an emanation / end).
export const useSpellCounters = (charId) => {
  const [counters, setCounters] = useSyncedState(syncKey(APP.SPELLCOUNTERS, charId), []);

  // Change a counter by `delta`, clamped to its floor. Counters that end at the
  // floor (Mirror Image's last image) drop off the ledger when they reach it.
  const adjust = useCallback(
    (id, delta) =>
      setCounters((cur) =>
        (cur || []).flatMap((c) => {
          if (c.id !== id) return [c];
          const floor = c.min ?? 0;
          const next = Math.max(floor, c.value + delta);
          if (c.endAtMin && next <= floor) return [];
          return [{ ...c, value: next }];
        })
      ),
    [setCounters]
  );

  const end = useCallback(
    (id) => setCounters((cur) => (cur || []).filter((c) => c.id !== id)),
    [setCounters]
  );

  return { counters: counters || [], adjust, end };
};

export default useSpellCounters;
