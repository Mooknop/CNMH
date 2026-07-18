import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import { useEncounter } from './useEncounter';
import { APP, syncKey } from '../sync/keys';

// Focus target (#411, #429, #1502) — a per-viewer pointer to the one combatant
// a player is currently "focused" on. Tapping an entry in the InitiativeStrip
// toggles it. A focused **enemy** drives the foe dossier + offensive tiles; a
// focused **ally** (#429) drives the support dossier + ally-targeted support;
// the viewer's **own** entry (#1502 S2) drives the self dossier — personal
// status + self-targeted actions. One focus at a time.
//
// Synced at `cnmh_focustarget_<charId>`. NOT `cnmh_focus_<charId>` — that key
// is the focus-POINTS-spent counter (FocusSpellsList / Refocus / daily prep).
// The target pointer squatted on it until #1502 S2, so focusing a combatant
// clobbered the caster's focus pool (and casting a focus spell dropped the
// target); a distinct token unbraids the two stores.
//
// We persist the order *entryId* (not the resolved entry) and resolve it against
// the live encounter on read, so a focus that leaves the order — defeated,
// encounter ended — self-clears to null with no explicit cleanup.
export const useFocusTarget = (charId) => {
  const [focusId, setFocusId] = useSyncedState(syncKey(APP.FOCUSTARGET, charId || 'none'), null);
  const { encounter } = useEncounter();

  const focusEntry =
    (encounter?.order || []).find((e) => e.entryId === focusId) || null;
  const focusEnemy = focusEntry?.kind === 'enemy' ? focusEntry : null;
  const isSelf = focusEntry?.kind === 'pc' && focusEntry.charId === charId;
  const focusSelf = isSelf ? focusEntry : null;
  const focusAlly = focusEntry?.kind === 'pc' && !isSelf ? focusEntry : null;

  const toggleFocus = useCallback(
    (entryId) => setFocusId((cur) => (cur === entryId ? null : entryId)),
    [setFocusId]
  );

  const clearFocus = useCallback(() => setFocusId(null), [setFocusId]);

  // The resolved id (null when the persisted id no longer points at a live entry).
  const focusId_ = focusEntry ? focusId : null;

  return { focusId: focusId_, focusEntry, focusEnemy, focusAlly, focusSelf, toggleFocus, clearFocus };
};

export default useFocusTarget;
