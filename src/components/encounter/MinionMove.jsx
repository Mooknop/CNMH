import React, { useRef, useCallback, useState } from 'react';
import { useTokenMovement } from '../../hooks/useTokenMovement';
import { useMinionActors } from '../../hooks/useMinionActors';
import { useTurnState } from '../../hooks/useTurnState';
import { useEncounter } from '../../hooks/useEncounter';
import { minionTurnId } from '../../utils/minionUtils';
import { needsNewStride } from '../../utils/movement';
import MoveGridPicker from './MoveGridPicker';
import './MinionMove.css';

// Minion token movement (#362). Reuses the same movereq→moveopts→moveconfirm→
// movedone state machine as PCs (useTokenMovement) and exploration movement
// (ExplorationMove), keyed to the minion's `<ownerId>-<role>` id. The bridge
// resolves that id to the companion/familiar's own Foundry token.
//
// Lives in the minion's modal, so it opens on an explicit "Move" button rather
// than auto-opening like the always-on exploration pad. Tapping a direction
// auto-confirms a 5-ft step and re-probes the neighbours so steps chain; a
// running distance tally is shown and "Done" closes the pad.
//
// Action accounting (#391): in encounter, a minion moves on the actions Command
// granted it. Each Stride is charged like a PC's (MoveActionSheet) via the shared
// needsNewStride rule — 1 on the first step, +1 each time the running distance
// crosses Speed. When the granted pool runs out the pad closes before offering a
// step that would need an unavailable action, so the token can't over-move. Out
// of encounter there's no economy: movement stays free.
const MinionMove = ({ ownerId, role }) => {
  const { linkFor } = useMinionActors();
  const link = linkFor(ownerId, role);

  const { encounter } = useEncounter();
  const { turnState, spendActions } = useTurnState(minionTurnId(ownerId, role));
  const encounterMode = !!(encounter?.active && encounter.phase === 'in-progress');
  const actionsLeft = (turnState?.actionsGranted ?? 0) - (turnState?.actionsSpent ?? 0);

  const [feetTotal, setFeetTotal] = useState(0);
  // Distance walked under the current Stride action (resets when a new Stride is
  // charged). Only meaningful in encounter mode.
  const [feetThisAction, setFeetThisAction] = useState(0);

  // Refs so the move-done callback can re-probe / cancel without a circular dep.
  const requestMoveRefreshRef = useRef(null);
  const cancelMoveRef = useRef(null);
  const speedRef = useRef(0);

  const handleMoveDone = useCallback((payload) => {
    const stepFeet = payload?.feetMoved ?? 0;
    setFeetTotal((f) => f + stepFeet);

    // Out of encounter: free movement, just keep the pad open to chain steps.
    if (!encounterMode) {
      requestMoveRefreshRef.current?.('stride');
      return;
    }

    const speed = speedRef.current || stepFeet || 5;
    const newAction = needsNewStride(feetThisAction, stepFeet, speed);
    if (newAction) {
      spendActions(1, 'Stride');
      setFeetThisAction(stepFeet);
    } else {
      setFeetThisAction((f) => f + stepFeet);
    }

    // Close the pad once the pool is spent and the *next* 5-ft step would need a
    // new action — so a step requiring an unavailable action is never offered.
    const leftAfter = newAction ? actionsLeft - 1 : actionsLeft;
    const nextFeet = newAction ? stepFeet : feetThisAction + stepFeet;
    const nextStepNeedsNewAction = nextFeet + 5 > speed;
    if (leftAfter <= 0 && nextStepNeedsNewAction) {
      setFeetTotal(0);
      setFeetThisAction(0);
      cancelMoveRef.current?.();
    } else {
      requestMoveRefreshRef.current?.('stride');
    }
  }, [encounterMode, feetThisAction, actionsLeft, spendActions]);

  const {
    stage,
    pickerOpts,
    isRefreshing,
    requestMove,
    requestMoveRefresh,
    confirmMove,
    cancelMove,
  } = useTokenMovement(minionTurnId(ownerId, role), { onMoveDone: handleMoveDone });

  requestMoveRefreshRef.current = requestMoveRefresh;
  cancelMoveRef.current = cancelMove;
  speedRef.current = pickerOpts?.speed || speedRef.current;

  const handleStart = useCallback(() => {
    setFeetTotal(0);
    setFeetThisAction(0);
    requestMove('stride');
  }, [requestMove]);

  const handleDone = useCallback(() => {
    setFeetTotal(0);
    setFeetThisAction(0);
    cancelMove();
  }, [cancelMove]);

  // Only the owning player/GM can move a minion that's linked and on the scene.
  if (!link || !link.onScene) return null;

  const idle = stage === null;
  // Hard-block (#391): in encounter, can't start a Stride with no granted actions.
  const moveBlocked = encounterMode && actionsLeft <= 0;

  return (
    <div className="mm-panel">
      {idle && (
        <button
          type="button"
          className="btn-secondary mm-move-btn"
          onClick={handleStart}
          disabled={moveBlocked}
          aria-label={`Move ${link.name}`}
          title={moveBlocked ? 'No granted actions left — Command first' : `Move ${link.name}`}
        >
          Move
        </button>
      )}

      {stage === 'awaiting-opts' && !isRefreshing && (
        <div className="mm-status">Calculating reachable squares…</div>
      )}

      {(stage === 'picking' || (isRefreshing && pickerOpts)) && (
        <>
          {feetTotal > 0 && (
            <div className="mm-distance" aria-label="Distance moved">
              Moved <strong>{feetTotal} ft</strong>
            </div>
          )}
          {isRefreshing && <div className="mm-status mm-status--refresh">Updating…</div>}
          <MoveGridPicker
            origin={pickerOpts.origin}
            reachable={pickerOpts.reachable}
            blocked={pickerOpts.blocked}
            radius={1}
            stepMode
            cancelLabel="Done"
            onSelect={confirmMove}
            onCancel={handleDone}
          />
        </>
      )}

      {stage === 'awaiting-done' && <div className="mm-status">Moving…</div>}
    </div>
  );
};

export default MinionMove;
