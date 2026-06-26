import { useEffect, useRef } from 'react';
import { useEncounter } from './useEncounter';
import { useGmAuth } from './useGmAuth';
import { useSession } from '../contexts/SessionContext';

// Blade Byrnie end-of-turn safety clear (#738 E4 pt.2). The transient dagger
// normally returns to the armor the moment you Strike with it (handled in
// UseAbilityModal). This is the backstop for the "drew a blade but didn't
// Strike" case: at the end of the wearer's turn, clear their blade overlay.
//
// Watches synced turn transitions like usePersistentReminders / useAuraReminders
// (works for Foundry-driven combats too) and writes the outgoing PC's
// cnmh_blade_<id> directly via the session, so one app-wide GM client owns it
// regardless of whose sheet is open. GM-only writer; mounted in PersistentSync.
export function useBladeCleanup() {
  const { encounter } = useEncounter();
  const { isGm } = useGmAuth();
  const { getState, sendUpdate } = useSession();

  // The combatant whose turn is currently underway: { entryId, charId, kind }.
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
      const outgoing = prev.entry;
      // A PC's turn just ended (not a fresh mount): return any still-drawn Blade
      // Byrnie dagger to the armor.
      if (isGm && prev.token !== null && outgoing && outgoing.kind === 'pc' && outgoing.charId) {
        const blade = getState(outgoing.charId, 'blade');
        if (blade && blade.active) {
          sendUpdate(outgoing.charId, 'blade', { active: false, ts: Date.now() });
        }
      }
      const current = order[encounter.currentTurnIndex || 0] || null;
      prevTurnRef.current = {
        token,
        entry: current ? { entryId: current.entryId, charId: current.charId, kind: current.kind } : null,
      };
    }
  }, [
    encounter?.active,
    encounter?.phase,
    encounter?.round,
    encounter?.currentTurnIndex,
    encounter?.order,
    isGm,
    getState,
    sendUpdate,
  ]);
}

export default useBladeCleanup;
