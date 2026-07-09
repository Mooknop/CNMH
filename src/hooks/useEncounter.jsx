import { useCallback, useRef, useEffect, useMemo } from 'react';
import { useSyncedState } from './useSyncedState';
import { useSession } from '../contexts/SessionContext';
import { useContent } from '../contexts/ContentContext';
import { boundariesCrossedBy } from '../utils/expiry';
import { isEncounterScopedEffect } from '../utils/EffectUtils';
import { pruneEncounterKnowledge } from '../utils/recallKnowledge';
import { sweepExpiredOnBoundaries, applyTurnStartFastHealing } from '../utils/turnEffects';
import {
  defaultEncounter,
  makePcEntry,
  makeEnemyEntry,
  makeSaveRequest,
  sortByInitiative,
  nextTurnIndex,
  everyEntryHasInitiative,
} from '../utils/encounterUtils';
import { RELAY, globalKey } from '../sync/keys';

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
const KNOWLEDGE_KEY  = 'cnmh_knowledge_global';
const PERSISTENT_KEY = 'cnmh_persistent_global';
const ENEMY_FX_KEY   = 'cnmh_enemyfx_global';
const SUMMONS_KEY    = 'cnmh_summons_global';

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
  const [, setEnemyFx]              = useSyncedState(ENEMY_FX_KEY, {});
  const [summons, setSummons]       = useSyncedState(SUMMONS_KEY, []);
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
        order: cur.order, boundaries, sendUpdate, appendLog, effectCatalog,
      });
    },
    [sendUpdate, appendLog, effectCatalog]
  );

  // Hymn of Healing fast healing (#226) at the start of the incoming turn.
  const runFastHealingTick = useCallback(
    (cur, startIdx) => {
      if (cur.foundryCombatId) return;
      applyTurnStartFastHealing({
        order: cur.order, startEntry: (cur.order || [])[startIdx],
        getState, sendUpdate, appendLog,
      });
    },
    [getState, sendUpdate, appendLog]
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

  const endEncounter = useCallback(
    () => {
      // Sustained spells are encounter-bound — clear each PC's ledger so a stale
      // sustain doesn't re-prompt at the start of the next encounter (#220).
      for (const entry of encounterRef.current?.order || []) {
        if (entry.kind !== 'pc' || !entry.charId) continue;
        const key = `cnmh_sustains_${entry.charId}`;
        let cur;
        try { cur = JSON.parse(window.localStorage.getItem(key)) || []; } catch { cur = []; }
        if (cur.length) {
          window.localStorage.setItem(key, JSON.stringify([]));
          sendUpdate(entry.charId, 'sustains', []);
        }

        // Stances are encounter-bound (#224) — drop any active stance so it
        // doesn't linger into the next encounter or onto the sheet.
        const stanceKey = `cnmh_stance_${entry.charId}`;
        let stance;
        try { stance = JSON.parse(window.localStorage.getItem(stanceKey)); } catch { stance = null; }
        if (stance?.active) {
          const idle = { active: false, name: null, ts: 0 };
          window.localStorage.setItem(stanceKey, JSON.stringify(idle));
          sendUpdate(entry.charId, 'stance', idle);
        }

        // Harmless Bystander is declared per-encounter (#226 Slice D) — drop the
        // flag so it doesn't carry into the next fight or onto the sheet.
        const bystanderKey = `cnmh_bystander_${entry.charId}`;
        let bystander;
        try { bystander = JSON.parse(window.localStorage.getItem(bystanderKey)); } catch { bystander = null; }
        if (bystander?.active) {
          const idle = { active: false, mod: null, ts: 0 };
          window.localStorage.setItem(bystanderKey, JSON.stringify(idle));
          sendUpdate(entry.charId, 'bystander', idle);
        }

        // The playing state is turn-bound (#935) — no turns outside an
        // encounter, so the performance lapses when the fight ends.
        const playingKey = `cnmh_playing_${entry.charId}`;
        let playing;
        try { playing = JSON.parse(window.localStorage.getItem(playingKey)); } catch { playing = null; }
        if (playing?.active) {
          const idle = { active: false, ts: 0 };
          window.localStorage.setItem(playingKey, JSON.stringify(idle));
          sendUpdate(entry.charId, 'playing', idle);
        }

        // Encounter-scoped effects (#275) — drop turn/round-bound leftovers and
        // catalog-flagged states like eld-charged so they don't linger past the
        // fight. Manual effects and clock-based immunities are kept.
        const fxKey = `cnmh_effects_${entry.charId}`;
        let fx;
        try { fx = JSON.parse(window.localStorage.getItem(fxKey)) || []; } catch { fx = []; }
        if (Array.isArray(fx) && fx.length) {
          const keptFx = fx.filter((e) => !isEncounterScopedEffect(e));
          if (keptFx.length !== fx.length) {
            window.localStorage.setItem(fxKey, JSON.stringify(keptFx));
            sendUpdate(entry.charId, 'effects', keptFx);
          }
        }

        // A pending Lingering Composition extension (#226-B) that never got
        // spent on a composition shouldn't survive into the next encounter.
        const lingKey = `cnmh_lingering_${entry.charId}`;
        let ling;
        try { ling = JSON.parse(window.localStorage.getItem(lingKey)); } catch { ling = null; }
        if (ling) {
          window.localStorage.setItem(lingKey, JSON.stringify(null));
          sendUpdate(entry.charId, 'lingering', null);
        }
      }
      setEncounter(() => defaultEncounter());
      // Recall Knowledge persists across encounters by creatureKey (#333) — only
      // this fight's ephemeral entryId-keyed records are pruned, not the lot.
      setKnowledge((cur) =>
        pruneEncounterKnowledge(cur, encounterRef.current?.order || [])
      );
      setPersistentMap({}); // tracked persistent damage dies with the encounter (#272)
      setEnemyFx({});       // enemy conditions + immunity timers die with the encounter (#260)
      setSummons([]);       // GM-added summons die with the encounter (#261)
    },
    [setEncounter, setKnowledge, setPersistentMap, setEnemyFx, setSummons, sendUpdate]
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
    encounter: displayEncounter,
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
