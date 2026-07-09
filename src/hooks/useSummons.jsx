import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import { newEntryUid } from '../utils/uid';
import { APP, globalKey } from '../sync/keys';

// GM-added summons (#261) tied to a caster's sustained spell. Kept in a single
// global key the Foundry bridge never touches (the bridge full-replaces
// cnmh_encounter_global.order, so app entries can't live there):
//   cnmh_summons_global = [ { entryId, kind:'summon', name, level,
//                             casterId, casterName, sustainId, spellName,
//                             defenses, bestiary:{ hp:{current,max}, … } } ]
// useEncounter merges these into the read-only encounter order so they're shown
// and targetable; the bridge order and turn math stay summon-free.

const EMPTY = [];

export const useSummons = () => {
  const [summons, setSummons] = useSyncedState(globalKey(APP.SUMMONS), EMPTY);

  // Create a summon. Caller supplies the chosen pool creature's stats; we stamp
  // a stable entryId and initialise current HP to max.
  const addSummon = useCallback(
    ({ name, level, casterId, casterName, sustainId, spellName, defenses, maxHp, traits, img }) =>
      setSummons((cur) => [
        ...(cur || []),
        {
          entryId: newEntryUid(),
          kind: 'summon',
          name,
          initiative: null,
          level: level ?? null,
          casterId,
          casterName,
          sustainId,
          spellName,
          defenses: defenses || null,
          bestiary: { hp: { current: maxHp ?? 0, max: maxHp ?? 0 }, level: level ?? null, traits: traits || [], img: img || null },
        },
      ]),
    [setSummons]
  );

  const removeSummon = useCallback(
    (entryId) => setSummons((cur) => (cur || []).filter((s) => s.entryId !== entryId)),
    [setSummons]
  );

  const getHp = useCallback(
    (entryId) => (summons || []).find((s) => s.entryId === entryId)?.bestiary?.hp || { current: 0, max: 0 },
    [summons]
  );

  const setHp = useCallback(
    (entryId, hp) =>
      setSummons((cur) =>
        (cur || []).map((s) =>
          s.entryId === entryId ? { ...s, bestiary: { ...s.bestiary, hp } } : s
        )
      ),
    [setSummons]
  );

  // Drop a caster's summons whose linked sustain is no longer live. Called from
  // the caster's TurnTrackerPanel whenever their sustain ledger changes, so every
  // sustain-end path (manual End, lapse, encounter end) removes the summon.
  const pruneOrphans = useCallback(
    (casterId, liveSustainIds) =>
      setSummons((cur) => {
        const live = new Set(liveSustainIds || []);
        const next = (cur || []).filter(
          (s) => s.casterId !== casterId || live.has(s.sustainId)
        );
        return next.length === (cur || []).length ? cur : next;
      }),
    [setSummons]
  );

  return { summons: summons || EMPTY, addSummon, removeSummon, getHp, setHp, pruneOrphans };
};

export default useSummons;
