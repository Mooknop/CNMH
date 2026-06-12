import { useCallback, useRef, useEffect, useMemo } from 'react';
import { useSyncedState } from './useSyncedState';
import { useSession } from '../contexts/SessionContext';
import { getEffect } from '../data/pf2eEffects';
import { boundariesCrossedBy, isExpired } from '../utils/expiry';
import {
  defaultEncounter,
  makePcEntry,
  makeEnemyEntry,
  makeSaveRequest,
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

const ENCOUNTER_KEY  = 'cnmh_encounter_global';
const ACTORMAP_KEY   = 'cnmh_actormap_global';
const KNOWLEDGE_KEY  = 'cnmh_knowledge_global';
const PERSISTENT_KEY = 'cnmh_persistent_global';

let logCounter = 0;
const makeLogEntry = (entry) => ({
  id: `log-${Date.now()}-${logCounter++}`,
  ts: Date.now(),
  ...entry,
});

export const useEncounter = () => {
  const [encounter, setEncounter]   = useSyncedState(ENCOUNTER_KEY, defaultEncounter());
  const [actorMap, setActorMap]     = useSyncedState(ACTORMAP_KEY, {});
  const [, setKnowledge]            = useSyncedState(KNOWLEDGE_KEY, {});
  const [, setPersistentMap]        = useSyncedState(PERSISTENT_KEY, {});
  const { sendUpdate } = useSession();

  // Resolve Foundry actor IDs → CNMH charIds using the GM-maintained actorMap.
  // Components always receive resolved entries so they never need to know about
  // foundryActorId or the raw kind:'enemy' default.
  const resolvedEncounter = useMemo(() => {
    const raw = encounter || defaultEncounter();
    if (!raw.order || !Object.keys(actorMap).length) return raw;
    const resolvedOrder = raw.order.map((entry) => {
      if (entry.kind === 'pc' || !entry.foundryActorId) return entry;
      const charId = actorMap[entry.foundryActorId];
      if (!charId) return entry;
      return { ...entry, kind: 'pc', charId };
    });
    return { ...raw, order: resolvedOrder };
  }, [encounter, actorMap]);

  // Ref so the sweep callbacks always see the latest resolved encounter without
  // adding it as a useCallback dependency (avoids recreating on every turn).
  const encounterRef = useRef(resolvedEncounter);
  useEffect(() => { encounterRef.current = resolvedEncounter; }, [resolvedEncounter]);

  // Sweep expired effects and granted-actions from every PC's keys. Called
  // before the encounter state advances so we can compute the correct boundary set.
  const runExpirySweep = useCallback(
    (cur, nextTurnIdx, nextRound) => {
      if (cur.foundryCombatId) return;
      const boundaries = boundariesCrossedBy(cur, nextTurnIdx, nextRound);
      for (const entry of cur.order || []) {
        if (entry.kind !== 'pc' || !entry.charId) continue;

        // --- effects sweep ---
        const effectsKey = `cnmh_effects_${entry.charId}`;
        let effects;
        try {
          effects = JSON.parse(window.localStorage.getItem(effectsKey)) || [];
        } catch {
          effects = [];
        }
        const nextEffects = effects.filter((e) => !isExpired(e.expireAt, boundaries));
        if (nextEffects.length !== effects.length) {
          window.localStorage.setItem(effectsKey, JSON.stringify(nextEffects));
          sendUpdate(entry.charId, 'effects', nextEffects);
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

        // --- granted actions sweep ---
        const grantsKey = `cnmh_grantedactions_${entry.charId}`;
        let grants;
        try {
          grants = JSON.parse(window.localStorage.getItem(grantsKey)) || [];
        } catch {
          grants = [];
        }
        const nextGrants = grants.filter((g) => !isExpired(g.expireAt, boundaries));
        if (nextGrants.length !== grants.length) {
          window.localStorage.setItem(grantsKey, JSON.stringify(nextGrants));
          sendUpdate(entry.charId, 'grantedactions', nextGrants);
          grants
            .filter((g) => isExpired(g.expireAt, boundaries))
            .forEach((g) => {
              const name = g.action?.name || g.source || 'Granted action';
              setEncounter((c) => {
                const base = c || defaultEncounter();
                return {
                  ...base,
                  log: [...(base.log || []), makeLogEntry({ type: 'system', text: `${name} expired for ${entry.name}` })],
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
      if (cur.foundryCombatId) return;
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
    () => {
      setEncounter(() => defaultEncounter());
      setKnowledge({});
      setPersistentMap({}); // tracked persistent damage dies with the encounter (#272)
    },
    [setEncounter, setKnowledge, setPersistentMap]
  );

  const addSaveRequest = useCallback(
    (req) =>
      setEncounter((cur) => {
        const base = cur || defaultEncounter();
        return {
          ...base,
          saveRequests: [...(base.saveRequests || []), makeSaveRequest(req)],
        };
      }),
    [setEncounter]
  );

  const removeSaveRequest = useCallback(
    (id) =>
      setEncounter((cur) => {
        const base = cur || defaultEncounter();
        return {
          ...base,
          saveRequests: (base.saveRequests || []).filter((r) => r.id !== id),
        };
      }),
    [setEncounter]
  );

  return {
    encounter: resolvedEncounter,
    actorMap,
    setActorMap,
    startEncounter,
    setInitiative,
    addEnemy,
    removeEntry,
    beginRound1,
    advanceTurn,
    beginNextRound,
    endEncounter,
    appendLog,
    addSaveRequest,
    removeSaveRequest,
  };
};

export default useEncounter;
