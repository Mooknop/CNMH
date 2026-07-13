import { useEffect, useRef } from 'react';
import { useEncounter } from './useEncounter';
import { useGmAuth } from './useGmAuth';
import { useSession } from '../contexts/SessionContext';
import { useContent } from '../contexts/ContentContext';
import { boundariesBetween } from '../utils/expiry';
import { sweepExpiredOnBoundaries, applyTurnStartFastHealing } from '../utils/turnEffects';

// Turn-boundary side-effects for Foundry-linked combats (#443). In an encounter
// the bridge drives, ending a turn (player-tapped or enemy) routes through
// Foundry, which rewrites round/currentTurnIndex on the synced encounter —
// useEncounter.advanceTurn is never called, so its expiry sweep + Hymn
// fast-healing tick never fire. This watcher closes that gap by reacting to the
// synced turn transition instead of hooking advanceTurn, mirroring
// usePersistentReminders.
//
// Scope is mutually exclusive with the app-driven path: it acts ONLY when the
// encounter is Foundry-linked (`foundryCombatId`), so an app-only combat — where
// advanceTurn already runs the sweep/tick — is left untouched and never
// double-fires. GM-only writer (like EffectExpirySync / PersistentSync): one
// client owns the HP/effect writes. Mounted once app-wide via TurnEffectsSync.

export function useEncounterTurnEffects() {
  const { encounter, appendLog } = useEncounter();
  const { isGm } = useGmAuth();
  const { getState, sendUpdate } = useSession();
  const { effects: effectCatalog } = useContent();

  // Snapshot of the last-seen in-progress turn, so we can compute the boundaries
  // crossed when the bridge advances. Keyed by round:index token.
  const prevRef = useRef({ token: null, round: null, idx: null, order: null });

  useEffect(() => {
    const active = encounter?.active ?? false;
    const phase = encounter?.phase;
    const foundryLinked = !!encounter?.foundryCombatId;

    // Out of an in-progress combat: forget the snapshot so we never act on a
    // stale transition when the next encounter starts.
    if (!active || phase !== 'in-progress') {
      prevRef.current = { token: null, round: null, idx: null, order: null };
      return;
    }

    const snapshot = {
      token: `${encounter.round || 0}:${encounter.currentTurnIndex || 0}`,
      round: encounter.round,
      idx: encounter.currentTurnIndex,
      order: encounter.order,
    };

    // App-driven combats (or non-GM clients) just track the snapshot — the
    // advanceTurn path / the GM owns the writes there.
    if (!foundryLinked || !isGm) {
      prevRef.current = snapshot;
      return;
    }

    const prev = prevRef.current;
    if (snapshot.token !== prev.token) {
      // Skip the initial observation (fresh mount / round-1 start has no
      // outgoing turn to resolve).
      if (prev.token !== null) {
        const boundaries = boundariesBetween(
          { order: prev.order, currentTurnIndex: prev.idx, round: prev.round },
          { order: snapshot.order, currentTurnIndex: snapshot.idx, round: snapshot.round },
        );
        sweepExpiredOnBoundaries({
          order: snapshot.order, boundaries, sendUpdate, appendLog, effectCatalog,
        });
        applyTurnStartFastHealing({
          order: snapshot.order,
          startEntry: (snapshot.order || [])[snapshot.idx || 0] || null,
          getState, sendUpdate, appendLog, effectCatalog,
        });
      }
      prevRef.current = snapshot;
    }
  }, [
    encounter?.active,
    encounter?.phase,
    encounter?.foundryCombatId,
    encounter?.round,
    encounter?.currentTurnIndex,
    encounter?.order,
    isGm,
    getState,
    sendUpdate,
    appendLog,
    effectCatalog,
  ]);
}

export default useEncounterTurnEffects;
