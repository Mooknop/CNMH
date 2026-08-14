// src/components/encounter/MoveActionSheet.jsx
// Command Sheet movement resolver (#415). Stride/Step are NOT dice actions — they
// drive the Foundry token via useTokenMovement + MoveGridPicker. Tapping a movement
// tile in the grid opens this bottom slide-up sheet (same Modal primitive the #412
// resolver uses) which mounts the real controller and charges actions exactly as
// the old TurnTrackerPanel Move UI did:
//   • Step   — one dedicated 5-ft action, then close. Always the D-pad, every protocol.
//   • Stride — on a protocol-14+ bridge (#1736 S2): tap a destination, see the real
//              route's cost + action count, Confirm to spend and execute (a full
//              Stride closes the sheet — no chaining loop). Below protocol 14 (or
//              no bridge at all), falls back unchanged to the 5-ft stepper: 1 action
//              on the first step, +1 each time accumulated distance crosses Speed.
import React, { useState, useRef, useCallback, useEffect } from 'react';
import Modal from '../shared/Modal';
import MoveGridPicker from './MoveGridPicker';
import MoveConfirmBar from './MoveConfirmBar';
import { useTokenMovement } from '../../hooks/useTokenMovement';
import { useTurnState } from '../../hooks/useTurnState';
import { useEncounter } from '../../hooks/useEncounter';
import { useCharacter } from '../../hooks/useCharacter';
import { useBridgeStatus } from '../../hooks/useBridgeStatus';
import { needsNewStride, actionsForDistance, FULL_MOVE_PROTOCOL } from '../../utils/movement';
import './MoveActionSheet.css';

const LABEL = { stride: 'Stride', step: 'Step' };

const MoveActionSheet = ({ character, moveType = 'stride', themeColor, onClose }) => {
  const charId = character.id;
  const { appendLog } = useEncounter();
  const { turnState, spendActions, refundActions } = useTurnState(charId);
  // Actions remaining this turn, same "implicit 3" convention as
  // SelfStatusBar/SegmentedDeck — no dedicated constant exists to import.
  const actionsLeft = Math.max(0, 3 - (turnState?.actionsSpent ?? 0));

  // App-derived Speed (the SP1-SP3 spine, #1223). The app is AUTHORITATIVE for
  // the Stride budget: the Foundry actor doesn't model app-owned feats/gear
  // (worn-gear bonuses, armor Str waivers, Bulk encumbrance), so its speed is
  // only the fallback when the spine has nothing to derive (base-less docs).
  // Foundry stays authoritative for reachable squares; the parity note below
  // flags drift.
  const derivedSpeed = useCharacter(character)?.speed ?? null;

  // feetThisAction: distance walked under the current Stride action (resets each
  // time a new action is charged). Step ignores it. Only the stepper fallback
  // uses this — the tap flow prices the whole route at Confirm instead.
  const [feetThisAction, setFeetThisAction] = useState(0);

  // requestMoveRefresh / cancelMove come from the hook below but are needed inside
  // onMoveDone (which the hook takes as input) — bridge via refs to break the cycle.
  const requestMoveRefreshRef = useRef(null);
  const cancelMoveRef = useRef(null);
  const speedRef = useRef(0);

  // Bridge protocol gate (#1736 S2): PC Stride gets the destination-tap
  // confirm-gate flow on a 14+ bridge; everything else (Step always, Stride
  // on an older/absent bridge) is the untouched stepper below.
  const { protocol } = useBridgeStatus();
  const tapFlowEligible = moveType === 'stride' && (protocol ?? 0) >= FULL_MOVE_PROTOCOL;

  // Tap-flow-only bookkeeping (unused by the stepper path):
  //  - waypointsRef: the tapped cells sent in the CURRENT plan, so a chained
  //    tap after a clipped plan can append instead of replacing (see handleTap).
  //  - chargedActionsRef / chargeSpeedRef: what Confirm charged and against
  //    which Speed, read back in handleMoveDone to compute the stop-short refund.
  //  - wasPlannedMoveRef: distinguishes a tap-flow movedone from a stepper one
  //    inside the single shared onMoveDone callback below.
  const waypointsRef = useRef([]);
  const chargedActionsRef = useRef(0);
  const chargeSpeedRef = useRef(0);
  const wasPlannedMoveRef = useRef(false);

  const handleMoveDone = useCallback((done) => {
    if (wasPlannedMoveRef.current) {
      wasPlannedMoveRef.current = false;
      const actualFeet = done?.feetMoved ?? 0;
      // The bridge re-plans at confirm time (staleness protection) and can
      // land short of the plan even on an unclipped plan — including the
      // degenerate case where the first leg is already blocked (feetMoved:0,
      // confirmed against the paired bridge PR #1738). Don't log a "moved 0
      // ft" line for that; note the block instead.
      appendLog({
        type: 'action', charId,
        text: actualFeet > 0
          ? `${character.name} moved ${actualFeet} ft`
          : `${character.name}'s Stride was blocked before it could start`,
      });

      // Stop-short refund: a legal wall/obstacle can land Foundry short of
      // the planned costFeet (down to a full refund at 0 ft moved), so fewer
      // actions than charged may have been needed. refundActions (#1736 S4)
      // credits the over-charge back through the same actionsLog trail.
      const actualActions = actionsForDistance(actualFeet, chargeSpeedRef.current || 1);
      const refund = chargedActionsRef.current - actualActions;
      if (refund > 0) refundActions(refund, 'Stride');

      waypointsRef.current = [];
      cancelMoveRef.current?.();
      onClose?.();
      return;
    }

    const stepFeet = done?.feetMoved ?? 5;
    appendLog({ type: 'action', charId, text: `${character.name} moved ${stepFeet} ft` });

    if (moveType === 'step') {
      spendActions(1, 'Step');
      cancelMoveRef.current?.();
      onClose?.();
      return;
    }

    // Stride (stepper fallback): charge the 1st action on the 1st step, then
    // one more each time the running distance would cross the character's
    // Speed. Budget precedence: the app-derived total → Foundry's actor
    // speed (via moveopts) → this step.
    const speed = derivedSpeed?.total || speedRef.current || stepFeet;
    const needNewAction = needsNewStride(feetThisAction, stepFeet, speed);
    if (needNewAction) {
      spendActions(1, 'Stride');
      setFeetThisAction(stepFeet);
    } else {
      setFeetThisAction(feetThisAction + stepFeet);
    }
    requestMoveRefreshRef.current?.('stride'); // keep the pad open to chain steps
  }, [feetThisAction, spendActions, refundActions, appendLog, charId, character.name, moveType, onClose, derivedSpeed?.total]);

  const {
    stage,
    pickerOpts,
    plannedPath,
    requestMove,
    requestMoveRefresh,
    confirmMove,
    cancelMove,
    planMove,
    confirmPlannedMove,
    cancelPlan,
  } = useTokenMovement(charId, { onMoveDone: handleMoveDone });

  requestMoveRefreshRef.current = requestMoveRefresh;
  cancelMoveRef.current = cancelMove;
  speedRef.current = pickerOpts?.speed || speedRef.current;

  // The tile already chose Stride vs Step, so request reachable squares on open.
  const startedRef = useRef(false);
  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      requestMove(moveType);
    }
  }, [requestMove, moveType]);

  const handleClose = () => {
    cancelMove();
    onClose?.();
  };

  // Speed used for both the tap grid's hint bands and the confirm-bar action
  // math — same precedence as the stepper's budget (derived spine → Foundry's
  // moveopts → last-known).
  const speedForGrid = derivedSpeed?.total || pickerOpts?.speed || speedRef.current || 25;

  // Tap a cell: first tap (or any re-tap on a non-clipped plan) replaces the
  // plan outright; a tap after a CLIPPED plan chains a waypoint onto it — the
  // same gesture Foundry's own ruler uses for a corner. See MoveGridPicker's
  // tapMode for the hint-band rendering this taps into.
  const handleTap = (cell) => {
    waypointsRef.current = (stage === 'planned' && plannedPath?.clipped)
      ? [...waypointsRef.current, cell]
      : [cell];
    planMove(waypointsRef.current);
  };

  const handleCancelPlan = () => {
    waypointsRef.current = [];
    cancelPlan();
  };

  const planActions = plannedPath ? actionsForDistance(plannedPath.costFeet, speedForGrid) : 0;
  const overBudget = planActions > actionsLeft;

  const handleConfirm = () => {
    if (!plannedPath) return;
    chargedActionsRef.current = planActions;
    chargeSpeedRef.current = speedForGrid;
    wasPlannedMoveRef.current = true;
    spendActions(planActions, 'Stride');
    confirmPlannedMove(planActions);
  };

  return (
    <Modal
      isOpen
      onClose={handleClose}
      title={LABEL[moveType] || 'Move'}
      themeColor={themeColor}
      maxWidth="420px"
      placement="bottom"
      highZ
    >
      <div className="mas-body">
        {moveType === 'stride' && !tapFlowEligible && (
          <div className="mas-dist" aria-label="Stride distance">
            {feetThisAction}/{derivedSpeed?.total || pickerOpts?.speed || speedRef.current || 0} ft
          </div>
        )}

        {/* Parity check (#1223): Foundry's actor speed vs the app spine — a
            cheap drift detector. The sheet's number is what the pad charges
            against; the GM fixes the Foundry actor if it's the stale side. */}
        {pickerOpts?.speed != null &&
          derivedSpeed?.total != null &&
          derivedSpeed.total > 0 &&
          pickerOpts.speed !== derivedSpeed.total && (
          <div className="mas-parity" role="note" aria-label="Speed parity note">
            Using the sheet&apos;s {derivedSpeed.total} ft; Foundry&apos;s actor says {pickerOpts.speed} ft.
          </div>
        )}

        {stage === 'awaiting-opts' && (
          <div className="mas-status">Calculating reachable squares…</div>
        )}

        {tapFlowEligible ? (
          <>
            {(stage === 'picking' || stage === 'planned') && pickerOpts && (
              <MoveGridPicker
                tapMode
                origin={pickerOpts.origin}
                maxFeet={speedForGrid}
                plannedPath={plannedPath?.path}
                destination={plannedPath?.path?.length ? plannedPath.path[plannedPath.path.length - 1] : null}
                onSelect={handleTap}
                onCancel={handleClose}
              />
            )}

            {stage === 'awaiting-plan' && <div className="mas-status">Plotting route…</div>}

            {stage === 'planned' && plannedPath && (
              <MoveConfirmBar
                feet={plannedPath.costFeet}
                actions={planActions}
                disabled={overBudget}
                disabledHint="Not enough actions left this turn."
                clipped={plannedPath.clipped}
                onConfirm={handleConfirm}
                onCancel={handleCancelPlan}
              />
            )}

            {stage === 'awaiting-done' && <div className="mas-status">Moving…</div>}
          </>
        ) : (
          <>
            {stage === 'picking' && pickerOpts && (
              <MoveGridPicker
                origin={pickerOpts.origin}
                reachable={pickerOpts.reachable}
                blocked={pickerOpts.blocked}
                radius={1}
                stepMode
                cancelLabel="Done"
                cancelDisabled={pickerOpts.originOccupied}
                cancelHint="Step off your ally's square to stop."
                onSelect={confirmMove}
                onCancel={handleClose}
              />
            )}

            {stage === 'awaiting-done' && <div className="mas-status">Moving…</div>}
          </>
        )}
      </div>
    </Modal>
  );
};

export default MoveActionSheet;
