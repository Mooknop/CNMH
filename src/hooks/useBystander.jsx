import { useCallback, useMemo } from 'react';
import { useSyncedState } from './useSyncedState';
import { useGameSeconds } from './useGameSeconds';
import { APP, syncKey } from '../sync/keys';
import {
  IDLE_BYSTANDER,
  normalizeBystander,
  declareBystander,
  clearBystanderDeclaration,
  stampBystanderReveal,
  bystanderObservers,
  immuneObservers,
  isBystanderImmune,
  suppressesReactionsAgainst,
  bystanderHiding,
} from '../utils/bystander';

// Harmless Bystander state (#226 Slice D, faithful tracking #465) — Izzy's
// level-4 skill feat lets her roll initiative with Deception instead of
// Perception and pretend she's not part of the fight:
//   cnmh_bystander_<charId> = { active, mod, ts, revealed, revealedTs, immune }
// `mod` records which skill seeded initiative ('deception'); `revealed` is the
// auto-lift flag (she was observed taking a hostile action, so reactions are
// live again) and `immune` is the CROSS-ENCOUNTER per-creature 1-day ledger,
// keyed by the persistent creature key. Everything but the synced read/write is
// pure and lives in utils/bystander.js — the initiative math still lives at the
// call site (InitiativeEntry), which has the modifiers and the order in scope.

export const useBystander = (charId) => {
  const [state, setState] = useSyncedState(
    syncKey(APP.BYSTANDER, charId || 'none'),
    IDLE_BYSTANDER
  );
  const nowSecs = useGameSeconds();
  const opts = useMemo(() => ({ charId, nowSecs }), [charId, nowSecs]);
  const current = useMemo(() => normalizeBystander(state), [state]);

  const declare = useCallback(
    (mod) => setState((cur) => declareBystander(cur, mod, nowSecs)),
    [setState, nowSecs]
  );

  // Un-declaring drops the encounter flag but KEEPS the immunity ledger — a
  // creature that already watched her turn hostile stays immune for its day.
  const clear = useCallback(
    () => setState((cur) => clearBystanderDeclaration(cur, nowSecs)),
    [setState, nowSecs]
  );

  /**
   * Auto-lift: she was observed being hostile. Lifts suppression and stamps the
   * 1-day immunity on every creature that saw it.
   * @param {Array} order - the live encounter order (observers are its enemies)
   * @returns {Array} the observers stamped, for the caller's log line
   */
  const markRevealed = useCallback(
    (order) => {
      const observers = bystanderObservers(order);
      setState((cur) => stampBystanderReveal(cur, observers, { charId, nowSecs }));
      return observers;
    },
    [setState, charId, nowSecs]
  );

  const isImmune = useCallback(
    (creatureKey) => isBystanderImmune(current, creatureKey, opts),
    [current, opts]
  );

  const suppressedAgainst = useCallback(
    (creatureKey) => suppressesReactionsAgainst(current, creatureKey, opts),
    [current, opts]
  );

  const immuneIn = useCallback(
    (order) => immuneObservers(current, order, opts),
    [current, opts]
  );

  return {
    state: current,
    active: current.active,
    mod: current.mod,
    revealed: current.revealed,
    hiding: bystanderHiding(current),
    immune: current.immune,
    nowSecs,
    declare,
    clear,
    markRevealed,
    isImmune,
    suppressedAgainst,
    immuneIn,
  };
};

export default useBystander;
