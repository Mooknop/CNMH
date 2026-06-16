import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import { useEncounter } from './useEncounter';

// Command Sheet focus target (#411) — a per-viewer pointer to the one enemy a
// player is currently "focused" on. Tapping a foe in the InitiativeStrip toggles
// it; the FocusBanner resolves it to a stat line and target-needing action tiles
// enable against it. Synced at `cnmh_focus_<charId>` so the focus follows the
// player across devices (the key has no embedded underscore, so it syncs cleanly).
//
// We persist the order *entryId* (not the resolved entry) and resolve it against
// the live encounter on read, so a focused foe that leaves the order — defeated,
// encounter ended — self-clears to null with no explicit cleanup.
export const useFocusTarget = (charId) => {
  const [focusId, setFocusId] = useSyncedState(`cnmh_focus_${charId || 'none'}`, null);
  const { encounter } = useEncounter();

  const focusEnemy =
    (encounter?.order || []).find(
      (e) => e.kind === 'enemy' && e.entryId === focusId
    ) || null;

  const toggleFocus = useCallback(
    (entryId) => setFocusId((cur) => (cur === entryId ? null : entryId)),
    [setFocusId]
  );

  const clearFocus = useCallback(() => setFocusId(null), [setFocusId]);

  // The resolved id (null when the persisted id no longer points at a live foe).
  const focusId_ = focusEnemy ? focusId : null;

  return { focusId: focusId_, focusEnemy, toggleFocus, clearFocus };
};

export default useFocusTarget;
