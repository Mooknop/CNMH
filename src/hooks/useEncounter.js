import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import {
  defaultEncounter,
  makePcEntry,
  makeEnemyEntry,
  sortByInitiative,
  nextTurnIndex,
  everyEntryHasInitiative,
} from '../utils/encounterUtils';

// Shared live encounter state. Lives at cnmh_encounter_global on the campaign
// session DO via useSyncedState (the key regex `cnmh_<type>_<id>` accepts
// `global` as the bucket — no worker changes needed). Every connected client
// reads + writes the same record; cross-character writes (turnstate refresh,
// effect application) live in their own per-character keys handled by later
// slices.
//
// All mutators use functional updaters so concurrent updates from different
// clients don't lose entries — the last write still wins per useSyncedState
// semantics, but within a single client a quick spendActions+appendLog pair
// never reads a stale closure.

const ENCOUNTER_KEY = 'cnmh_encounter_global';

let logCounter = 0;
const makeLogEntry = (entry) => ({
  id: `log-${Date.now()}-${logCounter++}`,
  ts: Date.now(),
  ...entry,
});

export const useEncounter = () => {
  const [encounter, setEncounter] = useSyncedState(ENCOUNTER_KEY, defaultEncounter());

  const appendLog = useCallback(
    (entry) =>
      setEncounter((cur) => ({
        ...(cur || defaultEncounter()),
        log: [...((cur && cur.log) || []), makeLogEntry(entry)],
      })),
    [setEncounter]
  );

  const startEncounter = useCallback(
    (characters) =>
      setEncounter(() => {
        const base = defaultEncounter();
        const pcEntries = (characters || []).filter(Boolean).map(makePcEntry);
        return {
          ...base,
          active: true,
          phase: 'setup',
          order: pcEntries,
          log: [makeLogEntry({ type: 'system', text: 'Encounter started' })],
        };
      }),
    [setEncounter]
  );

  const setInitiative = useCallback(
    (entryId, value) =>
      setEncounter((cur) => {
        const base = cur || defaultEncounter();
        const parsed =
          value === '' || value === null || value === undefined ? null : Number(value);
        return {
          ...base,
          order: (base.order || []).map((e) =>
            e.entryId === entryId ? { ...e, initiative: parsed } : e
          ),
        };
      }),
    [setEncounter]
  );

  const addEnemy = useCallback(
    (name, initiative) =>
      setEncounter((cur) => {
        const base = cur || defaultEncounter();
        const enemy = makeEnemyEntry(name, initiative);
        return { ...base, order: [...(base.order || []), enemy] };
      }),
    [setEncounter]
  );

  const removeEntry = useCallback(
    (entryId) =>
      setEncounter((cur) => {
        const base = cur || defaultEncounter();
        return {
          ...base,
          order: (base.order || []).filter((e) => e.entryId !== entryId),
        };
      }),
    [setEncounter]
  );

  const beginRound1 = useCallback(
    () =>
      setEncounter((cur) => {
        const base = cur || defaultEncounter();
        if (!everyEntryHasInitiative(base.order)) return base; // gated; UI also disables
        const sorted = sortByInitiative(base.order);
        const first = sorted[0];
        return {
          ...base,
          phase: 'in-progress',
          round: 1,
          currentTurnIndex: 0,
          order: sorted,
          log: [
            ...(base.log || []),
            makeLogEntry({ type: 'round', round: 1, text: 'Round 1 begins' }),
            ...(first
              ? [
                  makeLogEntry({
                    type: 'turn',
                    entryId: first.entryId,
                    charId: first.charId,
                    text: `${first.name}'s turn`,
                  }),
                ]
              : []),
          ],
        };
      }),
    [setEncounter]
  );

  const advanceTurn = useCallback(
    () =>
      setEncounter((cur) => {
        const base = cur || defaultEncounter();
        if (base.phase !== 'in-progress') return base;
        const { currentTurnIndex: nextIdx, round: nextRound } = nextTurnIndex(
          base.order,
          base.currentTurnIndex || 0,
          base.round || 1
        );
        const next = (base.order || [])[nextIdx];
        const log = [...(base.log || [])];
        if (nextRound !== (base.round || 1)) {
          log.push(makeLogEntry({ type: 'round', round: nextRound, text: `Round ${nextRound} begins` }));
        }
        if (next) {
          log.push(
            makeLogEntry({
              type: 'turn',
              entryId: next.entryId,
              charId: next.charId,
              text: `${next.name}'s turn`,
            })
          );
        }
        return { ...base, currentTurnIndex: nextIdx, round: nextRound, log };
      }),
    [setEncounter]
  );

  const beginNextRound = useCallback(
    () =>
      setEncounter((cur) => {
        const base = cur || defaultEncounter();
        if (base.phase !== 'in-progress') return base;
        const round = (base.round || 1) + 1;
        const first = (base.order || [])[0];
        const log = [
          ...(base.log || []),
          makeLogEntry({ type: 'round', round, text: `Round ${round} begins` }),
        ];
        if (first) {
          log.push(
            makeLogEntry({
              type: 'turn',
              entryId: first.entryId,
              charId: first.charId,
              text: `${first.name}'s turn`,
            })
          );
        }
        return { ...base, currentTurnIndex: 0, round, log };
      }),
    [setEncounter]
  );

  const endEncounter = useCallback(
    () => setEncounter(() => defaultEncounter()),
    [setEncounter]
  );

  return {
    encounter: encounter || defaultEncounter(),
    startEncounter,
    setInitiative,
    addEnemy,
    removeEntry,
    beginRound1,
    advanceTurn,
    beginNextRound,
    endEncounter,
    appendLog,
  };
};

export default useEncounter;
