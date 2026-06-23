import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import { normalizeChamberState, fireChamberState } from '../utils/ammunition';

// Single writer for the durable per-weapon chamber map
//   cnmh_chambers_<characterId> = { [weaponUid]: { chambers: [null|ref], pointer } }.
// Mirrors useLoadout's patch discipline so the chambered-loading semantics live
// in exactly one place: Reload (S3) and Fire (S4) both write through here, and
// the strike gate reads the same key back via useCharacter. No worker changes —
// synced keys are unrestricted (epic #672), same as cnmh_loadout_* / cnmh_consumed_*.
//
// Every mutator takes the weapon's `capacity` so a fresh/partial entry is
// normalised to the right size before patching; reads go through `stateFor`.
export const useChambers = (characterId) => {
  const [chambers, setChambers] = useSyncedState(
    `cnmh_chambers_${characterId || 'none'}`,
    {}
  );

  // The well-formed chamber state for one weapon — a fresh empty state when the
  // weapon has never been loaded.
  const stateFor = useCallback(
    (uid, capacity) => normalizeChamberState((chambers || {})[uid], capacity),
    [chambers]
  );

  // Read-modify-write one weapon's normalised state.
  const patch = useCallback(
    (uid, capacity, fn) =>
      setChambers((cur) => {
        const prev = normalizeChamberState((cur || {})[uid], capacity);
        return { ...(cur || {}), [uid]: fn(prev) };
      }),
    [setChambers]
  );

  // Load `ref` into a specific chamber (no-op when the index is out of range).
  const load = useCallback(
    (uid, index, ref, capacity) =>
      patch(uid, capacity, (st) => {
        if (index < 0 || index >= st.chambers.length) return st;
        const next = st.chambers.slice();
        next[index] = ref;
        return { ...st, chambers: next };
      }),
    [patch]
  );

  // Empty a specific chamber.
  const clear = useCallback(
    (uid, index, capacity) =>
      patch(uid, capacity, (st) => {
        if (index < 0 || index >= st.chambers.length) return st;
        const next = st.chambers.slice();
        next[index] = null;
        return { ...st, chambers: next };
      }),
    [patch]
  );

  // Point at a specific chamber (the default selection for the next fire).
  const setPointer = useCallback(
    (uid, index, capacity) =>
      patch(uid, capacity, (st) => {
        const len = st.chambers.length;
        if (len === 0) return st;
        return { ...st, pointer: ((index % len) + len) % len };
      }),
    [patch]
  );

  // Advance the pointer one chamber (wraps). The weapon auto-advances after a
  // fire in S4; exposed now so the load/clear/advance round-trip is testable.
  const advance = useCallback(
    (uid, capacity) =>
      patch(uid, capacity, (st) => {
        const len = st.chambers.length;
        if (len === 0) return st;
        return { ...st, pointer: (st.pointer + 1) % len };
      }),
    [patch]
  );

  // Fire a chamber (#676, S4): empty the discharged chamber and auto-advance the
  // pointer past it. Single mutator so the empty + advance land in one patch.
  const fire = useCallback(
    (uid, index, capacity) =>
      patch(uid, capacity, (st) => fireChamberState(st, index, capacity)),
    [patch]
  );

  return { chambers, stateFor, load, clear, setPointer, advance, fire };
};

export default useChambers;
