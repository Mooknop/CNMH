import { useEffect, useRef } from 'react';
import { useEncounter } from './useEncounter';
import { useGmAuth } from './useGmAuth';
import { useSyncedState } from './useSyncedState';
import { PERSISTENT_KEY, pruneOrphans, formatReminder } from '../utils/persistentDamage';

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
  const [persistentMap, setPersistentMap] = useSyncedState(PERSISTENT_KEY, {});

  // { token, entry } for the combatant whose turn is underway.
  const prevTurnRef = useRef({ token: null, entry: null });
  const prevActiveRef = useRef(false);

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
          appendLog({ type: 'system', text: formatReminder(prev.entry.name, inst) })
        );
      }
      const current = order[encounter.currentTurnIndex || 0] || null;
      prevTurnRef.current = {
        token,
        entry: current ? { entryId: current.entryId, name: current.name } : null,
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
  ]);
}

export default usePersistentReminders;
