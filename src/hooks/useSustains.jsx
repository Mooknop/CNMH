import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';

// Read + mutate a character's sustained-spell ledger (#220), synced at
// `cnmh_sustains_<charId>`. Registration happens React-free in the cast modal
// (utils/sustain.registerSustain); this hook drives the turn-tracker prompt.
export const useSustains = (charId) => {
  const [sustains, setSustains] = useSyncedState(`cnmh_sustains_${charId}`, []);

  // Mark a sustain as sustained this round (keeps it alive past turn submit).
  const sustain = useCallback(
    (id, round) =>
      setSustains((cur) =>
        (cur || []).map((s) => (s.id === id ? { ...s, lastSustainedRound: round } : s))
      ),
    [setSustains]
  );

  // End one sustained spell (player chose to let it lapse, or it was forgotten).
  const end = useCallback(
    (id) => setSustains((cur) => (cur || []).filter((s) => s.id !== id)),
    [setSustains]
  );

  return { sustains: sustains || [], sustain, end };
};

export default useSustains;
