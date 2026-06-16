import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import { useEncounter } from './useEncounter';

// Command Sheet focus target (#411, #429) — a per-viewer pointer to the one
// combatant a player is currently "focused" on. Tapping an entry in the
// InitiativeStrip toggles it. A focused **enemy** drives the foe stat line +
// enables offensive tiles; a focused **ally** (#429) drives an ally HP banner +
// surfaces/targets support (healing items, Battle Medicine). One focus at a time
// — focusing an ally replaces a focused foe and vice versa. Synced at
// `cnmh_focus_<charId>` (no embedded underscore → syncs cleanly).
//
// We persist the order *entryId* (not the resolved entry) and resolve it against
// the live encounter on read, so a focus that leaves the order — defeated,
// encounter ended — self-clears to null with no explicit cleanup.
export const useFocusTarget = (charId) => {
  const [focusId, setFocusId] = useSyncedState(`cnmh_focus_${charId || 'none'}`, null);
  const { encounter } = useEncounter();

  const focusEntry =
    (encounter?.order || []).find((e) => e.entryId === focusId) || null;
  const focusEnemy = focusEntry?.kind === 'enemy' ? focusEntry : null;
  const focusAlly = focusEntry?.kind === 'pc' ? focusEntry : null;

  const toggleFocus = useCallback(
    (entryId) => setFocusId((cur) => (cur === entryId ? null : entryId)),
    [setFocusId]
  );

  const clearFocus = useCallback(() => setFocusId(null), [setFocusId]);

  // The resolved id (null when the persisted id no longer points at a live entry).
  const focusId_ = focusEntry ? focusId : null;

  return { focusId: focusId_, focusEntry, focusEnemy, focusAlly, toggleFocus, clearFocus };
};

export default useFocusTarget;
