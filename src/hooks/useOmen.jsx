import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';

// Active harrow omen (#227) — set by drawing from the physical deck (the
// player picks the drawn suit in the Harrowing panel), cleared by Avoid Dire
// Fate, a failed Harrow Cast flat check, or drawing a new omen. Synced so the
// GM and the turn tracker see it:
//   cnmh_omen_<charId> = { suit, ts }   — suit: a HARROW_SUITS id, or null
// The hook is intentionally dumb: logging lives at the call sites.

const IDLE_OMEN = { suit: null, ts: 0 };

export const useOmen = (charId) => {
  const [omenState, setOmenState] = useSyncedState(
    `cnmh_omen_${charId || 'none'}`,
    IDLE_OMEN
  );

  const setSuit = useCallback(
    (suit) => setOmenState({ suit: suit || null, ts: Date.now() }),
    [setOmenState]
  );

  const clear = useCallback(
    () => setOmenState({ suit: null, ts: Date.now() }),
    [setOmenState]
  );

  return { suit: omenState?.suit || null, setSuit, clear };
};

export default useOmen;
