import { useState, useRef, useEffect } from 'react';
import { useSyncedState } from './useSyncedState';
import { useSession } from '../contexts/SessionContext';
import { RELAY, syncKey } from '../sync/keys';

// Shared movement state machine for both combat (TurnTrackerPanel) and
// exploration (ExplorationMove). Handles the movereq→moveopts→moveconfirm→movedone
// relay protocol. Callers wrap confirmMove to add encounter-specific side effects
// (action spending); exploration uses confirmMove directly.
//
// stage: null | 'awaiting-opts' | 'picking' | 'awaiting-plan' | 'planned' | 'awaiting-done'
//
// 'awaiting-plan' and 'planned' (#1736 S2) are ADDITIVE — the plan/confirm
// destination-tap rail for PC Stride on protocol 14+ bridges (see
// MoveActionSheet). Every existing function below (requestMove,
// requestMoveRefresh, confirmMove, cancelMove) keeps its exact prior
// behavior; ExplorationMove / MinionMove / DockEnemyPane stay on the stepper
// and never see these stages.
//
//   picking → awaiting-plan → planned → awaiting-done
//                 ^              |
//                 └── re-plan ───┘   (planMove callable from 'picking' or 'planned')
//
// When isRefreshing is true the picker stays mounted with the previous opts while
// fresh opts are loading (exploration chained moves).
//
// Props:
//   charId      — character making the move
//   onMoveDone  — called with the movedone payload when Foundry confirms the move

export function useTokenMovement(charId, { onMoveDone } = {}) {
  const { sendUpdate } = useSession();
  const [stage, setStage] = useState(null);
  const [pickerOpts, setPickerOpts] = useState(null);
  const [pendingMoveType, setPendingMoveType] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // The planned route (#1736 S2): { path, costFeet, clipped } from the last
  // correlated moveplanned reply. Null outside 'planned'/'awaiting-done'.
  const [plannedPath, setPlannedPath] = useState(null);
  const sessionTs = useRef(null);
  // Step options the bridge piggybacked onto the last movedone (#451). When set,
  // requestMoveRefresh adopts them instead of paying a movereq→moveopts round-trip.
  const pendingNextOpts = useRef(null);

  const [moveOpts] = useSyncedState(syncKey(RELAY.MOVEOPTS, charId), null);
  const [moveDone] = useSyncedState(syncKey(RELAY.MOVEDONE, charId), null);
  const [movePlanned] = useSyncedState(syncKey(RELAY.MOVEPLANNED, charId), null);

  // Opts arrived → open or refresh the picker (correlated by ts).
  useEffect(() => {
    if (stage === 'awaiting-opts' && moveOpts && moveOpts.reqTs === sessionTs.current) {
      setPickerOpts(moveOpts);
      setIsRefreshing(false);
      setStage('picking');
    }
  }, [moveOpts, stage]);

  // Move done in Foundry → reset stage, then notify caller.
  // Order matters: setStage(null) must queue before onMoveDone so that if the
  // caller (e.g. ExplorationMove) immediately calls requestMoveRefresh, its
  // setStage('awaiting-opts') is the last setter queued and wins the React batch.
  useEffect(() => {
    if (stage === 'awaiting-done' && moveDone && moveDone.reqTs === sessionTs.current) {
      // Stash the piggybacked next-step opts (if any) before onMoveDone, so a
      // requestMoveRefresh call inside it can adopt them without a round-trip.
      pendingNextOpts.current = moveDone.nextOpts ?? null;
      setStage(null);
      setPlannedPath(null);
      onMoveDone?.(moveDone);
    }
  }, [moveDone, stage, onMoveDone]);

  // Planned route arrives (#1736 S2) → correlated by reqTs, same pattern as
  // the moveopts effect above.
  useEffect(() => {
    if (stage === 'awaiting-plan' && movePlanned && movePlanned.reqTs === sessionTs.current) {
      setPlannedPath({
        path: movePlanned.path,
        costFeet: movePlanned.costFeet,
        clipped: !!movePlanned.clipped,
      });
      setStage('planned');
    }
  }, [movePlanned, stage]);

  const requestMove = (moveType) => {
    const ts = Date.now();
    sessionTs.current = ts;
    pendingNextOpts.current = null; // a fresh probe supersedes any stale piggyback
    setPendingMoveType(moveType);
    setStage('awaiting-opts');
    sendUpdate(charId, RELAY.MOVEREQ, { moveType, ts });
  };

  // Keeps the picker visible while refreshing for a new origin (exploration
  // chaining). When the bridge piggybacked the next step's opts onto movedone
  // (#451), adopt them immediately — no movereq→moveopts round-trip. Otherwise
  // fall back to the round-trip probe (legacy bridge / first probe).
  const requestMoveRefresh = (moveType) => {
    setPendingMoveType(moveType);
    const next = pendingNextOpts.current;
    if (next) {
      pendingNextOpts.current = null;
      setPickerOpts(next);
      setIsRefreshing(false);
      setStage('picking');
      return;
    }
    const ts = Date.now();
    sessionTs.current = ts;
    setIsRefreshing(true);
    setStage('awaiting-opts');
    sendUpdate(charId, RELAY.MOVEREQ, { moveType, ts });
  };

  // Sends the moveconfirm message. Callers may wrap this to add side-effects
  // (e.g. spendActions in TurnTrackerPanel) before calling.
  // actionCost is informational (the bridge ignores it); pass the real cost so
  // the session log and tests have the correct value.
  const confirmMove = (destination, actionCost = 0) => {
    sendUpdate(charId, RELAY.MOVECONFIRM, {
      destination,
      moveType: pendingMoveType,
      actionCost,
      ts: sessionTs.current,
    });
    setStage('awaiting-done');
  };

  const cancelMove = () => {
    setStage(null);
    setPickerOpts(null);
    setPendingMoveType(null);
    setIsRefreshing(false);
    setPlannedPath(null);
    pendingNextOpts.current = null;
  };

  // Sends a moveplan for the given tapped cells (excluding origin) and moves
  // to 'awaiting-plan'. Callable from 'picking' (first tap) or from 'planned'
  // (re-tap replaces the in-flight/last plan with a fresh request) — the
  // bridge's reply is always correlated by the fresh ts, so a stale reply to
  // a superseded plan is ignored by the effect above exactly like moveopts.
  //
  // GUARD: the bridge sends NO reply at all to an empty/absent waypoints list
  // (confirmed against the paired bridge PR #1738) — sending one would strand
  // the caller in 'awaiting-plan' forever, so refuse it here rather than at
  // every call site.
  const planMove = (waypoints) => {
    if (!waypoints || waypoints.length === 0) return;
    const ts = Date.now();
    sessionTs.current = ts;
    setStage('awaiting-plan');
    setPlannedPath(null); // clear any prior plan so a stale one can't linger visually
    sendUpdate(charId, RELAY.MOVEPLAN, { waypoints, moveType: pendingMoveType, ts });
  };

  // Sends moveconfirm with the planned path's cells (verbatim, per the wire
  // contract) instead of the stepper's single `destination`. actionCost is
  // informational for the bridge (same convention as confirmMove) but callers
  // should pass the real charged action count for the session log.
  const confirmPlannedMove = (actionCost = 0) => {
    sendUpdate(charId, RELAY.MOVECONFIRM, {
      waypoints: plannedPath?.path ?? [],
      moveType: pendingMoveType,
      actionCost,
      ts: sessionTs.current,
    });
    setStage('awaiting-done');
  };

  // Backs out of a plan to the tap grid without abandoning the whole move
  // (cancelMove closes the sheet entirely; this just clears the plan).
  const cancelPlan = () => {
    setStage('picking');
    setPlannedPath(null);
  };

  return {
    stage,
    pickerOpts,
    pendingMoveType,
    isRefreshing,
    plannedPath,
    requestMove,
    requestMoveRefresh,
    confirmMove,
    cancelMove,
    planMove,
    confirmPlannedMove,
    cancelPlan,
  };
}
