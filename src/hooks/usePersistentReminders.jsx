import { useCallback, useEffect, useRef } from 'react';
import { useEncounter } from './useEncounter';
import { useGmAuth } from './useGmAuth';
import { useSyncedState } from './useSyncedState';
import { useSession } from '../contexts/SessionContext';
import { useContent } from '../contexts/ContentContext';
import { PERSISTENT_KEY, pruneOrphans, formatReminder, persistentVsType } from '../utils/persistentDamage';
import { isImmuneTo, resistanceFor, weaknessFor, flatCheckEasedFor } from '../utils/EffectUtils';
import { buildEffectiveInventory } from '../utils/effectiveInventory';
import { wornImmuneTo, wornResistanceFor, wornWeaknessFor } from '../utils/wornGear';
import { applyResonant } from '../utils/wayfinder';
import { RELAY, APP } from '../sync/keys';

// Persistent-damage turn watcher (#272). Watches synced encounter state for
// turn transitions instead of hooking advanceTurn, so reminders fire for
// Foundry-linked combats too — the bridge rewrites round/currentTurnIndex
// directly and never calls advanceTurn (runExpirySweep early-returns there).
//
// At each transition the *outgoing* combatant gets an end-of-turn reminder
// line per tracked instance: "Goblin: 1d4 persistent electricity — DC 15
// flat check to end". The outgoing entry is stashed by entryId + name (not
// index) so wholesale order rewrites from the bridge can't misattribute it.
//
// GM-only writer, mirroring useEncounterClock: one client owns the log
// appends and map writes. Also prunes entries whose combatant left the order
// and clears the map when the encounter ends (covers Foundry-driven ends
// where endEncounter never runs). Mounted once app-wide via PersistentSync.

export function usePersistentReminders() {
  const { encounter, appendLog } = useEncounter();
  const { isGm } = useGmAuth();
  const { getState } = useSession();
  // Live (DO) effect catalog — Blood Booster's resistance modifier lives here,
  // not in the bundled bootstrap, so the readers must resolve against it (#900).
  // `characters` supplies authored inventory for the worn-gear read (#922 S3).
  const { effects: catalog, characters } = useContent();
  const [persistentMap, setPersistentMap] = useSyncedState(PERSISTENT_KEY, {});

  // { token, entry } for the combatant whose turn is underway.
  const prevTurnRef = useRef({ token: null, entry: null });
  const prevActiveRef = useRef(false);

  // Weakness/resistance/flat-check context for one instance, read from the
  // combatant's active effects (#900/#918) and worn gear (#922 S3). PC entries
  // carry a charId whose cnmh_effects_<id> + cnmh_foundryeffects_<id> hold the
  // buffs (Blood Booster lives there); worn modifiers come from the authored
  // inventory stamped with the live loadout/investment overlays. All read
  // synchronously off the session cache at turn-end — no reactive subscription
  // needed for a one-shot log line. Enemies (no charId) resolve to nothing.
  const resolveResistance = useCallback((entry, inst) => {
    if (!entry?.charId) return null;
    const effects = [
      ...(getState(entry.charId, APP.EFFECTS) || []),
      ...(getState(entry.charId, RELAY.FOUNDRYEFFECTS) || []),
    ];
    const vsType = persistentVsType(inst);

    // Worn-gear modifiers: the imperative path can't call hooks, so rebuild the
    // PC's effective inventory from content + the live placement/investment
    // overlays. (Mid-session *acquired* gear is out of scope for this reminder
    // line; the chip and HP-apply, via useResolvedEffects, cover that.)
    const character = (characters || []).find((c) => c.id === entry.charId);
    const invested = getState(entry.charId, APP.INVESTED) || {};
    const isInvested = (uid) => !!invested[uid];
    // Resonant-power slotting (#928): fold an active aeon stone's resonant
    // resistance/weakness/immunity onto the stone before the worn readers run.
    const inventory = applyResonant(
      buildEffectiveInventory(
        character?.inventory || [],
        getState(entry.charId, APP.LOADOUT) || {},
      ),
      getState(entry.charId, APP.WAYFINDER) || {},
      isInvested,
    );

    return {
      immune: isImmuneTo(effects, vsType, catalog)
        || wornImmuneTo(inventory, isInvested, vsType),
      weakness: Math.max(
        weaknessFor(effects, vsType, catalog),
        wornWeaknessFor(inventory, isInvested, vsType),
      ),
      amount: Math.max(
        resistanceFor(effects, vsType, catalog),
        wornResistanceFor(inventory, isInvested, vsType),
      ),
      easeFlatCheck: flatCheckEasedFor(effects, vsType, catalog),
    };
  }, [getState, catalog, characters]);

  useEffect(() => {
    const active = encounter?.active ?? false;
    const phase = encounter?.phase;
    const order = encounter?.order || [];
    const map = persistentMap || {};

    // Encounter over: wipe the map once on the falling edge.
    if (isGm && !active && prevActiveRef.current && Object.keys(map).length) {
      setPersistentMap({});
    }
    prevActiveRef.current = active;

    if (!active || phase !== 'in-progress') {
      prevTurnRef.current = { token: null, entry: null };
      return;
    }

    // Removed combatants take their tracked damage with them. pruneOrphans
    // returns the same reference when nothing changed, so this self-quiets.
    if (isGm) {
      const pruned = pruneOrphans(map, order);
      if (pruned !== map) setPersistentMap(pruned);
    }

    const token = `${encounter.round || 0}:${encounter.currentTurnIndex || 0}`;
    const prev = prevTurnRef.current;
    if (token !== prev.token) {
      // A turn just ended (not a fresh mount/round 1 start): remind for the
      // outgoing combatant's tracked instances.
      if (isGm && prev.token !== null && prev.entry) {
        (map[prev.entry.entryId] || []).forEach((inst) =>
          appendLog({
            type: 'system',
            text: formatReminder(prev.entry.name, inst, resolveResistance(prev.entry, inst)),
          })
        );
      }
      const current = order[encounter.currentTurnIndex || 0] || null;
      prevTurnRef.current = {
        token,
        entry: current
          ? { entryId: current.entryId, name: current.name, charId: current.charId }
          : null,
      };
    }
  }, [
    encounter?.active,
    encounter?.phase,
    encounter?.round,
    encounter?.currentTurnIndex,
    encounter?.order,
    persistentMap,
    isGm,
    appendLog,
    setPersistentMap,
    resolveResistance,
  ]);
}

export default usePersistentReminders;
