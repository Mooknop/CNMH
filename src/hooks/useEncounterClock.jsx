import { useEffect, useRef } from 'react';
import { useEncounter } from './useEncounter';
import { useGmAuth } from './useGmAuth';
import { useGameDate } from '../contexts/GameDateContext';
import { useSyncedState } from './useSyncedState';
import { APP, globalKey } from '../sync/keys';

// Tracks elapsed combat time and folds it into the master clock when the
// encounter ends. Designed to be mounted once app-wide via EncounterClockSync.
//
// Accrual: each time the round number advances while the encounter is
// in-progress, 6 seconds are added to cnmh_combatsecs_global (one PF2e round).
// Round 1 starting counts as the first 6 seconds; round 2 starting adds another
// 6, etc. — so a 3-round encounter commits 18 seconds total.
//
// Commit: when encounter.active goes false, the GM's client commits the pending
// seconds to the master clock (cnmh_clock_global) via advanceSeconds and resets
// the tally. Gated on isGm so only one client writes, preventing double-counting.
//
// All clients can read combatSecs (synced) for display in TurnTrackerPanel.

export function useEncounterClock() {
  const { encounter } = useEncounter();
  const { isGm } = useGmAuth();
  const { advanceSeconds } = useGameDate();
  const [combatSecs, setCombatSecs] = useSyncedState(globalKey(APP.COMBATSECS), 0);

  const prevRoundRef = useRef(0);
  const prevActiveRef = useRef(false);

  useEffect(() => {
    const active = encounter?.active ?? false;
    const phase = encounter?.phase;
    const round = encounter?.round ?? 0;

    // Reset tracking state when a new encounter starts so we don't carry over
    // stale refs from a previous combat.
    if (active && !prevActiveRef.current) {
      prevRoundRef.current = 0;
      if (isGm) setCombatSecs(0);
    }

    // Accrue 6 seconds per round started while in-progress (GM writes only).
    if (isGm && active && phase === 'in-progress' && round > prevRoundRef.current) {
      const delta = (round - prevRoundRef.current) * 6;
      setCombatSecs((s) => s + delta);
    }
    if (active && phase === 'in-progress') {
      prevRoundRef.current = round;
    }

    // Commit when encounter ends (GM only). Functional updater reads latest
    // combatSecs without needing it as a dep, avoiding an extra effect fire.
    if (isGm && !active && prevActiveRef.current) {
      setCombatSecs((secs) => {
        if (secs > 0) advanceSeconds(secs);
        return 0;
      });
      prevRoundRef.current = 0;
    }

    prevActiveRef.current = active;
  }, [encounter?.active, encounter?.phase, encounter?.round, isGm, setCombatSecs, advanceSeconds]);

  return { combatSecs };
}

export default useEncounterClock;
