import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';

// Player-authored field notes for the Specimen Dex (#780). One short note per
// creature, keyed by creatureKey, last-writer-wins, synced campaign-wide so the
// whole party sees each other's scribbles. Stored as { [creatureKey]: text }.
// It's GM-and-player writable (a `_global` store), so it stays editable even in
// the offline sandbox.
const FIELD_NOTES_KEY = 'cnmh_fieldnotes_global';

export const useBestiaryNotes = () => {
  const [notes, setNotes] = useSyncedState(FIELD_NOTES_KEY, {});

  const noteFor = useCallback(
    (creatureKey) => (creatureKey && notes ? notes[creatureKey] || '' : ''),
    [notes]
  );

  // Write (or, with empty text, clear) the note for a creature.
  const setNote = useCallback(
    (creatureKey, text) => {
      if (!creatureKey) return;
      const trimmed = (text || '').trim();
      setNotes((cur) => {
        const next = { ...(cur || {}) };
        if (trimmed) next[creatureKey] = trimmed;
        else delete next[creatureKey];
        return next;
      });
    },
    [setNotes]
  );

  return { notes, noteFor, setNote };
};

export default useBestiaryNotes;
