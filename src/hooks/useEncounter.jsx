import { useCallback, useRef, useEffect, useMemo } from 'react';
import { useSyncedState } from './useSyncedState';
import { useSession } from '../contexts/SessionContext';
import { useContent } from '../contexts/ContentContext';
import { boundariesCrossedBy } from '../utils/expiry';
import { sweepExpiredOnBoundaries, applyTurnStartFastHealing } from '../utils/turnEffects';
import {
  defaultEncounter,
  makePcEntry,
  makeEnemyEntry,
  makeSaveRequest,
  makeSaveResolution,
  appendSaveResolution,
  makeArmedPayload,
  sortByInitiative,
  nextTurnIndex,
  everyEntryHasInitiative,
} from '../utils/encounterUtils';
import { RELAY, APP, globalKey } from '../sync/keys';

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

const ENCOUNTER_KEY  = globalKey(RELAY.ENCOUNTER);
const ACTORMAP_KEY   = globalKey(RELAY.ACTORMAP);
const SUMMONS_KEY    = globalKey(APP.SUMMONS);

let logCounter = 0;
const makeLogEntry = (entry) => ({
  id: `log-${Date.now()}-${logCounter++}`,
  ts: Date.now(),
  ...entry,
});

export const useEncounter = () => {
  const [encounter, setEncounter]   = useSyncedState(ENCOUNTER_KEY, defaultEncounter());
  const [actorMap, setActorMap]     = useSyncedState(ACTORMAP_KEY, {});
  const [summons]                   = useSyncedState(SUMMONS_KEY, []);
  const { getState, sendUpdate } = useSession();
  const { effects: effectCatalog } = useContent();

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
  // Deliberately summon-free (resolvedEncounter, not the merged display view) so
  // turn math / expiry sweeps never count GM-added summons.
  const encounterRef = useRef(resolvedEncounter);
  useEffect(() => { encounterRef.current = resolvedEncounter; }, [resolvedEncounter]);

  // Display view: GM-added summons (#261) appended to the order so they show and
  // are targetable. Appended (not initiative-sorted) so the bridge's
  // currentTurnIndex still indexes the right entry, and writers — which read the
  // raw cnmh_encounter_global, not this — never see summons.
  const displayEncounter = useMemo(() => {
    if (!summons || summons.length === 0) return resolvedEncounter;
    return { ...resolvedEncounter, order: [...(resolvedEncounter.order || []), ...summons] };
  }, [resolvedEncounter, summons]);

  // Defined ahead of the sweep/tick callbacks below so they can log through it.
  const appendLog = useCallback(
    (entry) =>
      setEncounter((cur) => ({
        ...(cur || defaultEncounter()),
        log: [...((cur && cur.log) || []), makeLogEntry(entry)],
      })),
    [setEncounter]
  );

  // App-driven turn advance only (#443): a Foundry-linked combat never calls
  // advanceTurn (the bridge writes round/currentTurnIndex back), so these
  // early-return and useEncounterTurnEffects handles the bridge transition off
  // the same shared helpers. The two paths are mutually exclusive on
  // foundryCombatId, so there's no double expiry / double heal.
  const runExpirySweep = useCallback(
    (cur, nextTurnIdx, nextRound) => {
      if (cur.foundryCombatId) return;
      const boundaries = boundariesCrossedBy(cur, nextTurnIdx, nextRound);
      sweepExpiredOnBoundaries({
        order: cur.order, boundaries, getState, sendUpdate, appendLog, effectCatalog,
      });
    },
    [getState, sendUpdate, appendLog, effectCatalog]
  );

  // Hymn of Healing fast healing (#226) at the start of the incoming turn.
  const runFastHealingTick = useCallback(
    (cur, startIdx) => {
      if (cur.foundryCombatId) return;
      applyTurnStartFastHealing({
        order: cur.order, startEntry: (cur.order || [])[startIdx],
        getState, sendUpdate, appendLog, effectCatalog,
      });
    },
    [getState, sendUpdate, appendLog, effectCatalog]
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
      runFastHealingTick(cur, nextIdx);
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
    [runExpirySweep, runFastHealingTick, setEncounter]
  );

  const beginNextRound = useCallback(
    () => {
      const cur = encounterRef.current || defaultEncounter();
      if (cur.phase !== 'in-progress') return;
      const round = (cur.round || 1) + 1;
      // Sweep: treat this as advancing past the last entry to index 0, round+1
      runExpirySweep(cur, 0, round);
      runFastHealingTick(cur, 0);
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
    [runExpirySweep, runFastHealingTick, setEncounter]
  );

  // NOTE: this hook deliberately has no endEncounter (#1677). The dock-format
  // migration (#1556) retired the surface that called it, so the encounter-end
  // cleanup lives in utils/partySweep.js — performEncounterSweep (per PC) +
  // performEncounterGlobalSweep (encounter record, Recall Knowledge pruning,
  // persistent / enemy-fx / summons globals) — driven by the GM's
  // "End-encounter sweep" button in components/gm/PartyPanel.jsx.

  /**
   * Push a save request and RETURN its id. The id used to be minted inside the
   * updater, which made it unknowable to the caller; the caster-side round trip
   * (#1689) joins its resolution record on exactly that id, so the record is
   * built here and the updater just appends it. Also strictly safer under
   * StrictMode's double-invoked updaters, which used to mint two ids.
   */
  const addSaveRequest = useCallback(
    (req) => {
      const made = makeSaveRequest(req);
      setEncounter((cur) => {
        const base = cur || defaultEncounter();
        return {
          ...base,
          saveRequests: [...(base.saveRequests || []), made],
        };
      });
      return made.id;
    },
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

  /**
   * Save-resolution write-back (#1683 — Roll Resolution redesign, G1). The GM
   * side resolves a save request and then calls this INSTEAD of
   * removeSaveRequest: the resolution record is appended and the request is
   * dropped in the SAME functional update, so the two never race as separate
   * writes to the shared encounter object (last-write-wins would otherwise let
   * a concurrent client resurrect the request or lose the record).
   *
   * `resolution` is the record minus `id`/`ts` — see makeSaveResolution in
   * encounterUtils for the full shape (the G2 contract). The list is bounded at
   * SAVE_RESOLUTION_LIMIT (10), oldest evicted first, and is reset wholesale
   * with the rest of the encounter record by the GM's end-encounter sweep
   * (performEncounterGlobalSweep in utils/partySweep.js).
   *
   * The caster-side consumer is `useSaveRollSheet` (#1689); conditions, fx and
   * the caster effect still apply GM-side at resolution, and only a NEW-style
   * request's damage moves to the caster (see RequestedSaves).
   */
  const resolveSaveRequest = useCallback(
    (id, resolution) =>
      setEncounter((cur) => {
        const base = cur || defaultEncounter();
        return {
          ...base,
          saveRequests: (base.saveRequests || []).filter((r) => r.id !== id),
          saveResolutions: appendSaveResolution(
            base.saveResolutions,
            makeSaveResolution({ ...(resolution || {}), id })
          ),
        };
      }),
    [setEncounter]
  );

  /**
   * Drop a consumed resolution record (#1689). The caster's sheet freezes the
   * degrees into its own state the moment they arrive, so leaving the record on
   * the rail only eats into SAVE_RESOLUTION_LIMIT and risks evicting a record
   * another caster has not rendered yet (G1 risk 4). Consume-and-drop keeps the
   * bounded list holding only genuinely in-flight round trips.
   */
  const clearSaveResolution = useCallback(
    (id) =>
      setEncounter((cur) => {
        const base = cur || defaultEncounter();
        return {
          ...base,
          saveResolutions: (base.saveResolutions || []).filter((r) => r.id !== id),
        };
      }),
    [setEncounter]
  );

  // Armed payloads (#987) — a cast stores its deferred damage/save here; the GM
  // fires it when the authored trigger actually happens. `repeatable` payloads
  // (an area that damages everyone ending a turn in it) stay armed after firing;
  // one-shot ones (Targeting Beacon's explosion) are removed by the caller.
  const addArmedPayload = useCallback(
    (payload) =>
      setEncounter((cur) => {
        const base = cur || defaultEncounter();
        return {
          ...base,
          armedPayloads: [...(base.armedPayloads || []), makeArmedPayload(payload)],
        };
      }),
    [setEncounter]
  );

  const removeArmedPayload = useCallback(
    (id) =>
      setEncounter((cur) => {
        const base = cur || defaultEncounter();
        return {
          ...base,
          armedPayloads: (base.armedPayloads || []).filter((p) => p.id !== id),
        };
      }),
    [setEncounter]
  );

  return {
    encounter: displayEncounter,
    actorMap,
    setActorMap,
    addArmedPayload,
    removeArmedPayload,
    startEncounter,
    setInitiative,
    addEnemy,
    removeEntry,
    beginRound1,
    advanceTurn,
    beginNextRound,
    appendLog,
    addSaveRequest,
    removeSaveRequest,
    resolveSaveRequest,
    clearSaveResolution,
  };
};

export default useEncounter;
