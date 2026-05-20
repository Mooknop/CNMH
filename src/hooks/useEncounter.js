import { useCallback, useRef, useEffect } from 'react';
import { useSyncedState } from './useSyncedState';
import { useSession } from '../contexts/SessionContext';
import { getEffect } from '../data/pf2eEffects';
import { boundariesCrossedBy, isExpired } from '../utils/expiry';
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
  const { sendUpdate } = useSession();

  // Ref so the sweep callbacks always see the latest encounter without
  // adding it as a useCallback dependency (avoids recreating on every turn).
  const encounterRef = useRef(encounter);
  useEffect(() => { encounterRef.current = encounter; }, [encounter]);

  // Sweep expired effects from every PC's effects key. Called before the
  // encounter state advances so we can compute the correct boundary set.
  const runExpirySweep = useCallback(
    (cur, nextTurnIdx, nextRound) => {
      const boundaries = boundariesCrossedBy(cur, nextTurnIdx, nextRound);
      for (const entry of cur.order || []) {
        if (entry.kind !== 'pc' || !entry.charId) continue;
        const key = `cnmh_effects_${entry.charId}`;
        let effects;
        try {
          effects = JSON.parse(window.localStorage.getItem(key)) || [];
        } catch {
          effects = [];
        }
        const next = effects.filter((e) => !isExpired(e.expireAt, boundaries));
        if (next.length !== effects.length) {
          window.localStorage.setItem(key, JSON.stringify(next));
          sendUpdate(entry.charId, 'effects', next);
          effects
            .filter((e) => isExpired(e.expireAt, boundaries))
            .forEach((e) => {
              const name = getEffect(e.effectId)?.name || e.effectId;
              setEncounter((c) => {
                const base = c || defaultEncounter();
                return {
                  ...base,
                  log: [...(base.log || []), makeLogEntry({ type: 'system', text: `${name} expired on ${entry.name}` })],
                };
              });
            });
        }
      }
    },
    [sendUpdate, setEncounter]
  );

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
    () => {
      const cur = encounterRef.current || defaultEncounter();
      if (cur.phase !== 'in-progress') return;
      const { currentTurnIndex: nextIdx, round: nextRound } = nextTurnIndex(
        cur.order,
        cur.currentTurnIndex || 0,
        cur.round || 1
      );
      // Expiry sweep runs before the state update so it reads current encounter
      runExpirySweep(cur, nextIdx, nextRound);
      setEncounter((base) => {
        const b = base || defaultEncounter();
        const next = (b.order || [])[nextIdx];
        const log = [...(b.log || [])];
        if (nextRound !== (b.round || 1)) {
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
        return { ...b, currentTurnIndex: nextIdx, round: nextRound, log };
      });
    },
    [runExpirySweep, setEncounter]
  );

  const beginNextRound = useCallback(
    () => {
      const cur = encounterRef.current || defaultEncounter();
      if (cur.phase !== 'in-progress') return;
      const round = (cur.round || 1) + 1;
      // Sweep: treat this as advancing past the last entry to index 0, round+1
      runExpirySweep(cur, 0, round);
      setEncounter((base) => {
        const b = base || defaultEncounter();
        const first = (b.order || [])[0];
        const log = [
          ...(b.log || []),
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
        return { ...b, currentTurnIndex: 0, round, log };
      });
    },
    [runExpirySweep, setEncounter]
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
