import { useState, useRef, useEffect } from 'react';
import { useSyncedState } from './useSyncedState';
import { useSession } from '../contexts/SessionContext';

// Shared movement state machine for both combat (TurnTrackerPanel) and
// exploration (ExplorationMove). Handles the movereq→moveopts→moveconfirm→movedone
// relay protocol. Callers wrap confirmMove to add encounter-specific side effects
// (action spending); exploration uses confirmMove directly.
//
// stage: null | 'awaiting-opts' | 'picking' | 'awaiting-done'
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
  const sessionTs = useRef(null);

  const [moveOpts] = useSyncedState(`cnmh_moveopts_${charId}`, null);
  const [moveDone] = useSyncedState(`cnmh_movedone_${charId}`, null);

  // Opts arrived → open or refresh the picker (correlated by ts).
  useEffect(() => {
    if (stage === 'awaiting-opts' && moveOpts && moveOpts.reqTs === sessionTs.current) {
      setPickerOpts(moveOpts);
      setIsRefreshing(false);
      setStage('picking');
    }
  }, [moveOpts, stage]);

  // Move done in Foundry → notify caller, reset stage.
  useEffect(() => {
    if (stage === 'awaiting-done' && moveDone && moveDone.reqTs === sessionTs.current) {
      onMoveDone?.(moveDone);
      setStage(null);
    }
  }, [moveDone, stage, onMoveDone]);

  const requestMove = (moveType) => {
    const ts = Date.now();
    sessionTs.current = ts;
    setPendingMoveType(moveType);
    setStage('awaiting-opts');
    sendUpdate(charId, 'movereq', { moveType, ts });
  };

  // Keeps the picker visible while refreshing for a new origin (exploration chaining).
  const requestMoveRefresh = (moveType) => {
    const ts = Date.now();
    sessionTs.current = ts;
    setPendingMoveType(moveType);
    setIsRefreshing(true);
    setStage('awaiting-opts');
    sendUpdate(charId, 'movereq', { moveType, ts });
  };

  // Sends the moveconfirm message. Callers may wrap this to add side-effects
  // (e.g. spendActions in TurnTrackerPanel) before calling.
  // actionCost is informational (the bridge ignores it); pass the real cost so
  // the session log and tests have the correct value.
  const confirmMove = (destination, actionCost = 0) => {
    sendUpdate(charId, 'moveconfirm', {
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
  };

  return {
    stage,
    pickerOpts,
    pendingMoveType,
    isRefreshing,
    requestMove,
    requestMoveRefresh,
    confirmMove,
    cancelMove,
  };
}
