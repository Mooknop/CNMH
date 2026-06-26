import { useEffect, useRef } from 'react';
import { useEncounter } from './useEncounter';
import { useGmAuth } from './useGmAuth';
import { useContent } from '../contexts/ContentContext';
import { collectAuras, formatAuraReminder } from '../utils/auraReminders';

// Aura end-of-turn save reminders (#728 E2). Watches encounter turn transitions
// the same way usePersistentReminders (#272) does — off synced round/turn state,
// so it fires for Foundry-driven combats too — and at the end of a non-PC
// combatant's turn emits a GM-adjudicated reminder for each PC wearer's auras
// (Wisp Chain deafen, Dread frightened-floor). GM-only writer; mounted once
// app-wide alongside the persistent-damage watcher.
//
// Only a non-PC's turn end arms the reminders: these auras target enemies, and
// gating on the outgoing combatant being an enemy keeps the log quiet on PC
// turns. The wearer's own aura never targets the wearer.
export function useAuraReminders() {
  const { encounter, appendLog } = useEncounter();
  const { isGm } = useGmAuth();
  const { characters } = useContent();

  // The combatant whose turn is currently underway: { entryId, name, kind }.
  const prevTurnRef = useRef({ token: null, entry: null });

  useEffect(() => {
    const active = encounter?.active ?? false;
    const phase = encounter?.phase;
    const order = encounter?.order || [];

    if (!active || phase !== 'in-progress') {
      prevTurnRef.current = { token: null, entry: null };
      return;
    }

    const token = `${encounter.round || 0}:${encounter.currentTurnIndex || 0}`;
    const prev = prevTurnRef.current;
    if (token !== prev.token) {
      // A turn just ended (not a fresh mount / round-1 start). Remind for each PC
      // wearer's auras against the outgoing creature, but only when that creature
      // is an enemy.
      const outgoing = prev.entry;
      if (isGm && prev.token !== null && outgoing && outgoing.kind !== 'pc') {
        for (const w of order) {
          if (w.kind !== 'pc' || !w.charId || w.entryId === outgoing.entryId) continue;
          const wearer = (characters || []).find((c) => c.id === w.charId);
          if (!wearer) continue;
          for (const aura of collectAuras(wearer)) {
            appendLog({ type: 'system', text: formatAuraReminder(aura, w.name, outgoing.name) });
          }
        }
      }
      const current = order[encounter.currentTurnIndex || 0] || null;
      prevTurnRef.current = {
        token,
        entry: current ? { entryId: current.entryId, name: current.name, kind: current.kind } : null,
      };
    }
  }, [
    encounter?.active,
    encounter?.phase,
    encounter?.round,
    encounter?.currentTurnIndex,
    encounter?.order,
    characters,
    isGm,
    appendLog,
  ]);
}

export default useAuraReminders;
