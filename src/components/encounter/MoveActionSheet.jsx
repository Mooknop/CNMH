// src/components/encounter/MoveActionSheet.jsx
// Command Sheet movement resolver (#415). Stride/Step are NOT dice actions — they
// drive the Foundry token via useTokenMovement + MoveGridPicker. Tapping a movement
// tile in the grid opens this bottom slide-up sheet (same Modal primitive the #412
// resolver uses) which mounts the real controller and charges actions exactly as
// the old TurnTrackerPanel Move UI did:
//   • Step   — one dedicated 5-ft action, then close. Always the D-pad, every protocol.
//   • Stride — tap a destination, see the real route's cost + action count, Confirm
//              to spend and execute (a full Stride closes the sheet — no chaining
//              loop). This needs a protocol-14+ bridge (#1736 S1/S2); the 5-ft
//              stepper fallback for Stride was retired in #1736 S5 once the tap
//              flow was verified — below protocol 14 the sheet shows a compact
//              "bridge outdated" notice instead of a pad. Step is unaffected: it
//              never used the tap flow and keeps the D-pad on every protocol.
//   • Map mode (#1744 S4) — on a protocol-16+ bridge, the tap-flow's PICKER can
//     additionally be the actual battlefield snapshot instead of the abstract
//     grid, toggled per device (OQ-4 ruling). Nothing about the plan/confirm
//     protocol changes: a map tap resolves to the same {col,row} the grid
//     would have produced and feeds the identical planMove/handleTap path.
//   • Route ghosts (#1744 S3/WS-4) — while map mode is showing, other movers'
//     in-flight routes (usePathPreview, PUBLIC/player-audience channel only —
//     this is a player-facing surface) draw as faint dashed ghosts alongside
//     the viewer's own solid plan, via SnapshotRouteOverlay's `variant`.
//     Filtered to the captured scene and excludes the viewer's own mover
//     (their own plan is already drawn from `plannedPath`, not the preview
//     channel).
import React, { useCallback, useEffect, useRef } from 'react';
import Modal from '../shared/Modal';
import MoveGridPicker from './MoveGridPicker';
import MoveConfirmBar from './MoveConfirmBar';
import MoveMapSurface from './MoveMapSurface';
import { useTokenMovement } from '../../hooks/useTokenMovement';
import { useTurnState } from '../../hooks/useTurnState';
import { useEncounter } from '../../hooks/useEncounter';
import { useCharacter } from '../../hooks/useCharacter';
import { useBridgeStatus } from '../../hooks/useBridgeStatus';
import { useMoveMapMode } from '../../hooks/useMoveMapMode';
import { worldPointFromTap, cellFromWorldPoint } from '../../utils/snapshotGeometry';
import { actionsForDistance, FULL_MOVE_PROTOCOL, clippedHintFor } from '../../utils/movement';
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

  // cancelMove comes from the hook below but is needed inside onMoveDone (which
  // the hook takes as input) — bridge via a ref to break the cycle.
  const cancelMoveRef = useRef(null);
  const speedRef = useRef(0);

  // Bridge protocol gate (#1736 S2, floor raised to a hard requirement in S5):
  // PC Stride only runs the destination-tap confirm-gate flow, and only on a
  // 14+ bridge. Below that floor the sheet shows the outdated-bridge notice
  // instead of a pad — there is no more Stride D-pad fallback. Step is
  // unaffected: tapFlowEligible is always false for it, so it always renders
  // the D-pad branch below regardless of protocol.
  const { protocol } = useBridgeStatus();
  const tapFlowEligible = moveType === 'stride' && (protocol ?? 0) >= FULL_MOVE_PROTOCOL;
  const strideBridgeOutdated = moveType === 'stride' && !tapFlowEligible;

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

    // Only Step reaches this branch now — Stride's D-pad fallback was retired
    // in #1736 S5 (a below-protocol bridge shows the outdated notice instead
    // of ever driving a move), so a non-planned movedone can only be Step's
    // single dedicated action.
    const stepFeet = done?.feetMoved ?? 5;
    appendLog({ type: 'action', charId, text: `${character.name} moved ${stepFeet} ft` });
    spendActions(1, 'Step');
    cancelMoveRef.current?.();
    onClose?.();
  }, [spendActions, refundActions, appendLog, charId, character.name, onClose]);

  const {
    stage,
    pickerOpts,
    plannedPath,
    requestMove,
    confirmMove,
    cancelMove,
    planMove,
    confirmPlannedMove,
    cancelPlan,
  } = useTokenMovement(charId, { onMoveDone: handleMoveDone });

  cancelMoveRef.current = cancelMove;
  speedRef.current = pickerOpts?.speed || speedRef.current;

  // The tile already chose Stride vs Step, so request reachable squares/origin
  // on open — the tap flow needs pickerOpts.origin too, so this fires the same
  // way regardless of which branch below ends up rendering.
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

  // Mover-centered capture radius (#1744 WS-2/OQ-5 ruling): 1.5× the caller's
  // best-known Speed, sent only when we actually have one — the hardcoded
  // 25 ft grid fallback above is a UI convenience, not a real Speed, so it's
  // deliberately excluded here; omitting radiusFeet lets the bridge fall
  // back to 1.5× the actor's OWN Speed instead of our guess.
  const knownSpeed = derivedSpeed?.total || pickerOpts?.speed || speedRef.current || null;

  // Map mode (#1744 S4/S7, OQ-4 ruling): a device-sticky toggle between the
  // abstract grid and the actual battlefield snapshot, gated on a
  // protocol-16+ bridge (MAP_MOVE_PROTOCOL implies FULL_MOVE_PROTOCOL, so
  // mapEligible never fires without tapFlowEligible also true — i.e. never
  // while strideBridgeOutdated is showing). The toggle itself only renders
  // when eligible; the STORED device preference persists across sessions
  // regardless, so an older/no bridge simply ignores it and stays on the
  // grid — the universal fallback rule. useMoveMapMode (#1744 S7) is the
  // wiring every map-mode surface shares — see its doc comment; ghosts are
  // the PLAYER audience always, since this sheet is mounted on player-facing
  // surfaces only (the PC's own Move sheet, and the GM dock's act-as-player
  // mirror of it), never a GM-exclusive one.
  const {
    surfacePref, setSurfacePref, mapEligible, useMapSurface, mapStatus, mapSnapshot, ghostEntries,
  } = useMoveMapMode({
    moverId: charId,
    tapFlowEligible,
    protocol,
    knownSpeed,
    ghostAudience: 'player',
  });

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

  // Map-mode tap: the same normalized-tap → world → cell conversion Ping the
  // Map and area placement already use, feeding the identical handleTap path
  // above — the snapshot replaces the PICKER, not the plan/confirm protocol.
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
        {strideBridgeOutdated ? (
          // #1736 S5: the Stride D-pad fallback is retired — below protocol 14
          // there's no pad left to show at all. Mirrors DockEnemyPane's
          // below-protocol-floor affordance (dock-enemy-waiting): a single
          // compact dashed-box notice naming the floor, rather than a dead
          // control. Step is unaffected and never reaches this branch.
          <p className="mas-outdated" data-testid="mas-outdated-notice">
            Full-speed Stride needs the CNMH Bridge module updated to protocol 14+.
            Update the module in Foundry (Add-on Modules) and reload — Step still
            works on any bridge.
          </p>
        ) : (
          <>
            {/* Parity check (#1223): Foundry's actor speed vs the app spine —
                a cheap drift detector. The sheet's number is what the pad
                charges against; the GM fixes the Foundry actor if it's the
                stale side. */}
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

            {moveType === 'step' ? (
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
            ) : (
              <>
                {/* Past strideBridgeOutdated + moveType!=='step' means we're
                    always tap-flow eligible here (#1736 S5) — the toggle
                    below only ever appears on top of a live tap flow.
                    MoveMapSurface (#1744 S7) is the shared toggle + map body
                    every map-mode surface now renders identically. */}
                <MoveMapSurface
                  mapEligible={mapEligible}
                  surfacePref={surfacePref}
                  onSurfaceChange={setSurfacePref}
                  showBody={(stage === 'picking' || stage === 'planned') && !!pickerOpts}
                  status={mapStatus}
                  snapshot={mapSnapshot}
                  origin={pickerOpts?.origin}
                  plannedPath={plannedPath}
                  ghosts={ghostEntries}
                  onMapTap={handleMapTap}
                  onCancel={handleClose}
                  cancelLabel="Cancel"
                />

                {(stage === 'picking' || stage === 'planned') && pickerOpts
                  && !(useMapSurface && mapStatus === 'ready' && mapSnapshot) && (
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
                    clippedHint={clippedHintFor(protocol)}
                    onConfirm={handleConfirm}
                    onCancel={handleCancelPlan}
                  />
                )}

                {stage === 'awaiting-done' && <div className="mas-status">Moving…</div>}
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};

export default MoveActionSheet;
