import { useEffect } from 'react';
import { useContent } from '../contexts/ContentContext';
import { useEncounter } from './useEncounter';
import { useSyncedState } from './useSyncedState';
import { RELAY, globalKey } from '../sync/keys';

// Auto-match Foundry actors to CNMH characters by exact name and write to
// cnmh_actormap_global. Runs on every connected client (mounted at app root via
// ActorMapSync) so turn controls work for players without the GM opening /gm.
//
// Sources:
//   - encounter order (combat combatants) — existing behaviour
//   - cnmh_roster_global (PC actors pushed by bridge on connect) — allows
//     exploration movement to work even before any combat has run
//
// Safety: only fills *absent* (undefined) slots. A present value — whether a
// charId or an explicit null sentinel ("Not a PC", set from the dock order strip) — is
// never overwritten. The functional updater re-checks freshest state at write
// time so a concurrent GM assignment always wins.
export const useActorMapAutoMatch = () => {
  const { characters } = useContent();
  const { encounter, actorMap, setActorMap } = useEncounter();
  const [roster] = useSyncedState(globalKey(RELAY.ROSTER), []);
  const order = encounter?.order || [];

  const applyAdditions = (additions) => {
    if (!Object.keys(additions).length) return;
    setActorMap((prev) => {
      const base = prev || {};
      let next = base;
      let changed = false;
      for (const [actorId, charId] of Object.entries(additions)) {
        if (next[actorId] === undefined) {
          if (!changed) next = { ...base };
          next[actorId] = charId;
          changed = true;
        }
      }
      return changed ? next : base;
    });
  };

  // Match from encounter order (combat combatants).
  useEffect(() => {
    if (!order.length || !characters?.length) return;
    const additions = {};
    for (const entry of order) {
      if (entry.foundryActorId == null) continue;
      if (actorMap[entry.foundryActorId] !== undefined) continue;
      const match = characters.find(
        (c) => c.name.toLowerCase() === entry.name.toLowerCase()
      );
      if (match) additions[entry.foundryActorId] = match.id;
    }
    applyAdditions(additions);
  // deliberately keyed to combat identity/size only; actorMap and characters are
  // re-checked at write time by the functional updater (see Safety note above)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounter?.foundryCombatId, order.length]);

  // Match from roster (PC actors outside of combat).
  useEffect(() => {
    if (!roster?.length || !characters?.length) return;
    const additions = {};
    for (const entry of roster) {
      if (!entry.actorId) continue;
      if (actorMap[entry.actorId] !== undefined) continue;
      const match = characters.find(
        (c) => c.name.toLowerCase() === entry.name.toLowerCase()
      );
      if (match) additions[entry.actorId] = match.id;
    }
    applyAdditions(additions);
  // deliberately keyed to roster pushes only; actorMap and characters are
  // re-checked at write time by the functional updater (see Safety note above)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster]);
};
