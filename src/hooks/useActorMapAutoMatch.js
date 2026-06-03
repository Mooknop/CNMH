import { useEffect } from 'react';
import { useContent } from '../contexts/ContentContext';
import { useEncounter } from './useEncounter';

// Auto-match Foundry combatants to CNMH characters by exact name and write to
// cnmh_actormap_global. Runs on every connected client (mounted at app root via
// ActorMapSync) so turn controls work for players without the GM opening /gm.
//
// Safety: only fills *absent* (undefined) slots. A present value — whether a
// charId or an explicit null sentinel ("Not a PC", set by GmEncounter) — is
// never overwritten. The functional updater re-checks freshest state at write
// time so a concurrent GM assignment always wins.
export const useActorMapAutoMatch = () => {
  const { characters } = useContent();
  const { encounter, actorMap, setActorMap } = useEncounter();
  const order = encounter?.order || [];

  useEffect(() => {
    if (!order.length || !characters?.length) return;
    const additions = {};
    for (const entry of order) {
      if (entry.foundryActorId == null) continue;
      if (actorMap[entry.foundryActorId] !== undefined) continue; // truthy, null, anything set
      const match = characters.find(
        (c) => c.name.toLowerCase() === entry.name.toLowerCase()
      );
      if (match) additions[entry.foundryActorId] = match.id;
    }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounter?.foundryCombatId, order.length]);
};
