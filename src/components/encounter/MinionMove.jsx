import React, { useRef, useCallback, useState } from 'react';
import { useTokenMovement } from '../../hooks/useTokenMovement';
import { useMinionActors } from '../../hooks/useMinionActors';
import { useTurnState } from '../../hooks/useTurnState';
import { useEncounter } from '../../hooks/useEncounter';
import { useBridgeStatus } from '../../hooks/useBridgeStatus';
import { useMoveMapMode } from '../../hooks/useMoveMapMode';
import { minionTurnId } from '../../utils/minionUtils';
import { worldPointFromTap, cellFromWorldPoint } from '../../utils/snapshotGeometry';
import { needsNewStride, actionsForDistance, FULL_MOVE_PROTOCOL } from '../../utils/movement';
import MoveGridPicker from './MoveGridPicker';
import MoveConfirmBar from './MoveConfirmBar';
import MoveMapSurface from './MoveMapSurface';
import './MinionMove.css';

// Minion token movement (#362). Reuses the same movereq→moveopts→moveconfirm→
// movedone state machine as PCs (useTokenMovement) and exploration movement
// (ExplorationMove), keyed to the minion's `<ownerId>-<role>` id. The bridge
// resolves that id to the companion/familiar's own Foundry token.
//
// Lives in the minion's modal, so it opens on an explicit "Move" button rather
// than auto-opening like the always-on exploration pad. On a protocol-14+
// bridge (#1736 S4) it's the destination-tap flow — tap a cell, see the real
// route's cost + action price on the shared confirm bar, Confirm to charge and
// execute; a confirmed move re-opens the tap grid at the new origin so a long
// Stride is a handful of taps. Below protocol 14 it's the original 8-direction
// D-pad — tapping a direction auto-confirms a 5-ft step and re-probes the
// neighbours so steps chain. Either way a running distance tally is shown and
// "Done" closes the pad.
//
// Action accounting (#391): in encounter, a minion moves on the actions Command
// granted it. The tap flow prices the whole planned route at Confirm via the
// generalized actionsForDistance (1 action per Speed of real, terrain-aware
// distance) and refunds the over-charge via refundActions if Foundry legally
// stops the move short — the same charge-at-confirm + stop-short-refund rule
// MoveActionSheet's Stride uses. The stepper fallback still charges per-step
// via needsNewStride — 1 on the first step, +1 each time the running distance
// crosses Speed. Either way, when the granted pool runs dry the pad closes
// (tap flow) or stops offering steps it can't afford (stepper), so the token
// can't over-move. Out of encounter there's no economy: movement stays free.
//
// Map mode (#1744 S7, mirrors #1743's tap-flow rollout to this surface): on a
// protocol-16+ bridge the tap flow's picker can also be the actual battlefield
// snapshot, toggled per device via the SAME MOVE_SURFACE_PREF every map-mode
// surface shares (useMoveMapMode). The mover id is the minion's own
// `<ownerCharId>-<role>` id — resolveToken (foundry-bridge/snapshots.js)
// already resolves that form to the companion/familiar's own token, same as
// useTokenMovement above. Other movers' route ghosts draw alongside the
// viewer's own plan — PLAYER audience, since this is a player-facing surface.
// Granted-pool pricing/confirm logic is entirely unaffected — a map tap feeds
// the identical handleTap/planMove path a grid tap does.
const MinionMove = ({ ownerId, role }) => {
  const { linkFor } = useMinionActors();
  const link = linkFor(ownerId, role);

  const { encounter } = useEncounter();
  const { turnState, spendActions, refundActions } = useTurnState(minionTurnId(ownerId, role));
  const encounterMode = !!(encounter?.active && encounter.phase === 'in-progress');
  const actionsLeft = (turnState?.actionsGranted ?? 0) - (turnState?.actionsSpent ?? 0);

  const [feetTotal, setFeetTotal] = useState(0);
  // Distance walked under the current Stride action (resets when a new Stride is
  // charged). Only meaningful in encounter mode, and only the stepper fallback
  // uses it — the tap flow prices the whole route at Confirm instead.
  const [feetThisAction, setFeetThisAction] = useState(0);

  // Refs so the move-done callback can re-probe / cancel without a circular dep.
  const requestMoveRefreshRef = useRef(null);
  const cancelMoveRef = useRef(null);
  const speedRef = useRef(0);

  // Bridge protocol gate (#1736 S4): the destination-tap flow needs
  // findMovementPath/measureMovementPath on the bridge side; older/absent
  // bridges keep the 5-ft D-pad below unchanged.
  const { protocol } = useBridgeStatus();
  const tapFlowEligible = (protocol ?? 0) >= FULL_MOVE_PROTOCOL;

  // Tap-flow-only bookkeeping (unused by the stepper path) — mirrors
  // MoveActionSheet's Stride tap flow:
  //  - waypointsRef: the tapped cells sent in the CURRENT plan, so a chained
  //    tap after a clipped plan can append instead of replacing.
  //  - chargedActionsRef / chargeSpeedRef: what Confirm charged and against
  //    which Speed, read back in handleMoveDone to compute the stop-short
  //    refund.
  //  - wasPlannedMoveRef: distinguishes a tap-flow movedone from a stepper
  //    one inside the single shared onMoveDone callback below.
  const waypointsRef = useRef([]);
  const chargedActionsRef = useRef(0);
  const chargeSpeedRef = useRef(0);
  const wasPlannedMoveRef = useRef(false);

  const handleMoveDone = useCallback((payload) => {
    if (wasPlannedMoveRef.current) {
      wasPlannedMoveRef.current = false;
      const actualFeet = payload?.feetMoved ?? 0;
      setFeetTotal((f) => f + actualFeet);
      waypointsRef.current = [];

      if (!encounterMode) {
        requestMoveRefreshRef.current?.('stride');
        return;
      }

      // Stop-short refund (#1736 S4): a legal wall/obstacle can land Foundry
      // short of the planned costFeet, so fewer actions than charged may
      // have been needed — same rule as MoveActionSheet's Stride tap flow.
      const actualActions = actionsForDistance(actualFeet, chargeSpeedRef.current || 1);
      const refund = chargedActionsRef.current - actualActions;
      if (refund > 0) refundActions(refund, 'Stride');

      // Close the pad once the granted pool is fully spent — mirrors the
      // stepper's "never offer a move you can't afford" guarantee, adapted
      // to the tap flow's confirm-gate (which already blocks an over-budget
      // Confirm, so this only needs to catch the true-zero case).
      const leftAfter = actionsLeft + Math.max(refund, 0);
      if (leftAfter <= 0) {
        setFeetTotal(0);
        cancelMoveRef.current?.();
      } else {
        requestMoveRefreshRef.current?.('stride');
      }
      return;
    }

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
  }, [encounterMode, feetThisAction, actionsLeft, spendActions, refundActions]);

  const moverId = minionTurnId(ownerId, role);
  const {
    stage,
    pickerOpts,
    isRefreshing,
    plannedPath,
    requestMove,
    requestMoveRefresh,
    confirmMove,
    cancelMove,
    planMove,
    confirmPlannedMove,
    cancelPlan,
  } = useTokenMovement(moverId, { onMoveDone: handleMoveDone });

  requestMoveRefreshRef.current = requestMoveRefresh;
  cancelMoveRef.current = cancelMove;
  speedRef.current = pickerOpts?.speed || speedRef.current;

  // Same precedence as the stepper's budget (last-known Speed → fallback).
  const speedForGrid = speedRef.current || pickerOpts?.speed || 25;

  // Mover-centered capture radius (#1744 WS-2/OQ-5 ruling) — deliberately
  // excludes the hardcoded 25 ft grid fallback above; omitting radiusFeet lets
  // the bridge fall back to 1.5× the actor's own Speed instead of our guess.
  const knownSpeed = speedRef.current || pickerOpts?.speed || null;
  const {
    surfacePref, setSurfacePref, mapEligible, useMapSurface, mapStatus, mapSnapshot, ghostEntries,
  } = useMoveMapMode({
    moverId,
    tapFlowEligible,
    protocol,
    knownSpeed,
    ghostAudience: 'player',
  });

  // Tap a cell: first tap (or any re-tap on a non-clipped plan) replaces the
  // plan outright; a tap after a CLIPPED plan chains a waypoint onto it.
  const handleTap = (cell) => {
    waypointsRef.current = (stage === 'planned' && plannedPath?.clipped)
      ? [...waypointsRef.current, cell]
      : [cell];
    planMove(waypointsRef.current);
  };

  // Map-mode tap: the same normalized-tap → world → cell conversion as
  // MoveActionSheet — the snapshot replaces the PICKER, not the plan/confirm
  // protocol, so it feeds the identical handleTap path above.
  const handleMapTap = ({ nx, ny }) => {
    if (!mapSnapshot) return;
    const world = worldPointFromTap(mapSnapshot, nx, ny);
    const cell = cellFromWorldPoint(world, mapSnapshot.gridSize);
    if (cell) handleTap(cell);
  };

  const handleCancelPlan = () => {
    waypointsRef.current = [];
    cancelPlan();
  };

  // Out of encounter there's no economy — the bar reads feet-only, exactly
  // like ExplorationMove.
  const planActions = encounterMode && plannedPath
    ? actionsForDistance(plannedPath.costFeet, speedForGrid)
    : 0;
  const overBudget = encounterMode && !!plannedPath && planActions > actionsLeft;

  const handleConfirmPlan = () => {
    if (!plannedPath) return;
    chargedActionsRef.current = planActions;
    chargeSpeedRef.current = speedForGrid;
    wasPlannedMoveRef.current = true;
    if (encounterMode) spendActions(planActions, 'Stride');
    confirmPlannedMove(planActions);
  };

  const handleStart = useCallback(() => {
    setFeetTotal(0);
    setFeetThisAction(0);
    waypointsRef.current = [];
    requestMove('stride');
  }, [requestMove]);

  const handleDone = useCallback(() => {
    setFeetTotal(0);
    setFeetThisAction(0);
    waypointsRef.current = [];
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

      {tapFlowEligible ? (
        <>
          {(stage === 'picking' || stage === 'planned' || (isRefreshing && pickerOpts)) && pickerOpts && (
            <>
              {feetTotal > 0 && (
                <div className="mm-distance" aria-label="Distance moved">
                  Moved <strong>{feetTotal} ft</strong>
                </div>
              )}
              {isRefreshing && <div className="mm-status mm-status--refresh">Updating…</div>}
              <MoveMapSurface
                mapEligible={mapEligible}
                surfacePref={surfacePref}
                onSurfaceChange={setSurfacePref}
                showBody
                status={mapStatus}
                snapshot={mapSnapshot}
                origin={pickerOpts.origin}
                plannedPath={plannedPath}
                ghosts={ghostEntries}
                onMapTap={handleMapTap}
                onCancel={handleDone}
                cancelLabel="Done"
              />
              {!(useMapSurface && mapStatus === 'ready' && mapSnapshot) && (
                <MoveGridPicker
                  tapMode
                  origin={pickerOpts.origin}
                  maxFeet={speedForGrid}
                  plannedPath={plannedPath?.path}
                  destination={plannedPath?.path?.length ? plannedPath.path[plannedPath.path.length - 1] : null}
                  cancelLabel="Done"
                  onSelect={handleTap}
                  onCancel={handleDone}
                />
              )}
            </>
          )}

          {stage === 'awaiting-plan' && <div className="mm-status">Plotting route…</div>}

          {stage === 'planned' && plannedPath && (
            <MoveConfirmBar
              feet={plannedPath.costFeet}
              actions={encounterMode ? planActions : null}
              disabled={overBudget}
              disabledHint="Not enough granted actions left."
              clipped={plannedPath.clipped}
              onConfirm={handleConfirmPlan}
              onCancel={handleCancelPlan}
            />
          )}

          {stage === 'awaiting-done' && <div className="mm-status">Moving…</div>}
        </>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
};

export default MinionMove;
