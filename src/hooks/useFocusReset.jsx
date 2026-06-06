import { useEffect } from 'react';
import { usePlayMode } from './usePlayMode';
import { useSyncedState } from './useSyncedState';

// Outside of Encounter mode, focus points refresh to full. Focus is stored as
// "points spent" in cnmh_focus_<charId> (0 = full pool), so whenever the
// effective play mode is not 'encounter' we force spent back to 0.
//
// This stands in for the (removed) Refocus exploration activity: between
// encounters the party is always topped up, with no per-activity bookkeeping.
export function useFocusReset(charId) {
  const { mode } = usePlayMode();
  const [spent, setSpent] = useSyncedState(`cnmh_focus_${charId || 'none'}`, 0);

  useEffect(() => {
    if (!charId) return;
    if (mode !== 'encounter' && spent !== 0) setSpent(0);
  }, [charId, mode, spent, setSpent]);
}

export default useFocusReset;
