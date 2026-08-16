import React, { useRef, useEffect, useCallback, useState } from 'react';
import { usePlayMode } from '../../hooks/usePlayMode';
import { useGmAuth } from '../../hooks/useGmAuth';
import { useTokenMovement } from '../../hooks/useTokenMovement';
import { useBridgeStatus } from '../../hooks/useBridgeStatus';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useCharacter } from '../../hooks/useCharacter';
import { useMoveMapMode } from '../../hooks/useMoveMapMode';
import { useContent } from '../../contexts/ContentContext';
import { formatSpeedBreakdown } from '../../utils/speed';
import { worldPointFromTap, cellFromWorldPoint } from '../../utils/snapshotGeometry';
import { FULL_MOVE_PROTOCOL } from '../../utils/movement';
import MoveGridPicker from '../encounter/MoveGridPicker';
import MoveConfirmBar from '../encounter/MoveConfirmBar';
import MoveMapSurface from '../encounter/MoveMapSurface';
import './ExplorationMove.css';
import { APP, globalKey } from '../../sync/keys';

// Exploration-mode token movement panel. When the GM enables movement and the
// effective mode is 'exploration', a player walks their Foundry token.
//
// On a protocol-14+ bridge (#1736 S4): the destination-tap flow — tap a cell,
// see the real route's cost on a feet-only confirm bar (exploration has NO
// action economy, so it never shows an action count), Confirm to execute.
// A confirmed move re-opens the tap grid at the new origin exactly like the
// stepper below did, so a Stride-length walk is a handful of taps instead of
// a chain of 5-ft ones.
//
// Below protocol 14 (or no bridge at all): the original 8-direction D-pad —
// tapping a direction auto-confirms a 5-ft step and immediately re-probes the
// 8 neighbours from the new position so steps chain in real time. The pad
// opens automatically either way (no preliminary "Move Token" button). A
// running total of distance walked is shown; "Done" resets it (the pad stays
// open while movement is enabled).
//
// Map mode (#1744 S7, mirrors #1743's tap-flow rollout to this surface): on a
// protocol-16+ bridge the tap flow's picker can also be the actual battlefield
// snapshot instead of the abstract grid, toggled per device via the SAME
// MOVE_SURFACE_PREF every map-mode surface shares (useMoveMapMode). Other
// movers' route ghosts draw alongside the viewer's own plan — PLAYER audience,
// since this is a player-facing surface.

const ExplorationMove = ({ charId, onMoveDone }) => {
  const { mode, moveEnabled } = usePlayMode();
  const { isGm } = useGmAuth();
  const [feetTotal, setFeetTotal] = useState(0);
  const [, setExploreDist] = useSyncedState(globalKey(APP.EXPLOREDIST), 0);
  // App-derived Speed (#1223) — context for the walk (exploration steps carry
  // no action cost, but pacing math reads the character's real speed). The
  // grid itself stays Foundry-authoritative. Hidden when the roster has no
  // matching character (e.g. a bare charId in tests/sandbox setups).
  const { characters } = useContent();
  const character = (Array.isArray(characters) ? characters : []).find((c) => c.id === charId) || null;
  const derivedSpeed = useCharacter(character)?.speed ?? null;

  // Use a ref so the internal callback can call requestMoveRefresh without a
  // circular dependency. Also calls the optional onMoveDone prop so parent
  // components (e.g. ExplorationTab) know when a move completes.
  const requestMoveRefreshRef = useRef(null);

  const handleMoveDone = useCallback((payload) => {
    const feet = payload?.feetMoved ?? 0;
    setFeetTotal((f) => f + feet);
    if (isGm && feet > 0) setExploreDist((d) => d + feet);
    waypointsRef.current = [];
    requestMoveRefreshRef.current?.('stride');
    onMoveDone?.(payload);
  }, [onMoveDone, isGm, setExploreDist]);

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
  } = useTokenMovement(charId, { onMoveDone: handleMoveDone });

  requestMoveRefreshRef.current = requestMoveRefresh;

  // Bridge protocol gate (#1736 S4): the destination-tap flow needs
  // findMovementPath/measureMovementPath on the bridge side; older/absent
  // bridges keep the 5-ft D-pad below unchanged.
  const { protocol } = useBridgeStatus();
  const tapFlowEligible = (protocol ?? 0) >= FULL_MOVE_PROTOCOL;

  // Tapped cells sent in the CURRENT plan (tap flow only) — a re-tap after a
  // clipped plan chains a waypoint instead of replacing it, same corner
  // gesture as MoveActionSheet's Stride tap flow.
  const waypointsRef = useRef([]);

  const speedForGrid = derivedSpeed?.total || pickerOpts?.speed || 25;

  // Mover-centered capture radius (#1744 WS-2/OQ-5 ruling) — deliberately
  // excludes the hardcoded 25 ft grid fallback above (a UI convenience, not
  // a real Speed); omitting radiusFeet lets the bridge fall back to 1.5× the
  // actor's own Speed instead of our guess. useMoveMapMode (#1744 S7) is the
  // wiring every map-mode surface shares — see its doc comment.
  const knownSpeed = derivedSpeed?.total || pickerOpts?.speed || null;
  const {
    surfacePref, setSurfacePref, mapEligible, useMapSurface, mapStatus, mapSnapshot, ghostEntries,
  } = useMoveMapMode({
    moverId: charId,
    tapFlowEligible,
    protocol,
    knownSpeed,
    ghostAudience: 'player',
  });

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

  const handleConfirmPlan = () => {
    confirmPlannedMove(0); // no action economy in exploration
  };

  // "Done" resets the local tally; the GM also zeroes the shared tally (the
  // ExplorationTimeControl's Apply does this too, but Done after not applying
  // a suggestion should also clean it up).
  const handleDone = useCallback(() => {
    setFeetTotal(0);
    if (isGm) setExploreDist(0);
    waypointsRef.current = [];
    cancelMove();
  }, [cancelMove, isGm, setExploreDist]);

  // Auto-open the grid whenever movement is idle — on mount and again after a
  // Cancel — so the controls are always open when player movement is enabled.
  // Gated on !isRefreshing so it never fires mid chain-refresh. requestMove is
  // recreated each render, so reach it through a ref to keep this effect keyed
  // only on the idle transition.
  const requestMoveRef = useRef(null);
  requestMoveRef.current = requestMove;
  const active = mode === 'exploration' && moveEnabled;
  useEffect(() => {
    if (active && stage === null && !isRefreshing) {
      requestMoveRef.current?.('stride');
    }
  }, [active, stage, isRefreshing]);

  if (!active) return null;

  return (
    <div className="em-panel">
      {stage === 'awaiting-opts' && !isRefreshing && (
        <div className="em-status">Calculating reachable squares…</div>
      )}

      {tapFlowEligible ? (
        <>
          {(stage === 'picking' || stage === 'planned' || (isRefreshing && pickerOpts)) && pickerOpts && (
            <>
              {derivedSpeed && derivedSpeed.total > 0 && (
                <div
                  className="em-speed"
                  aria-label="Derived speed"
                  title={formatSpeedBreakdown(derivedSpeed)}
                >
                  Speed <strong>{derivedSpeed.total} ft</strong>
                </div>
              )}
              {feetTotal > 0 && (
                <div className="em-distance" aria-label="Distance walked">
                  Moved <strong>{feetTotal} ft</strong>
                </div>
              )}
              {isRefreshing && <div className="em-status em-status--refresh">Updating…</div>}
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
                  cancelDisabled={pickerOpts.originOccupied}
                  cancelHint="Step off your ally's square to stop."
                  onSelect={handleTap}
                  onCancel={handleDone}
                />
              )}
            </>
          )}

          {stage === 'awaiting-plan' && <div className="em-status">Plotting route…</div>}

          {stage === 'planned' && plannedPath && (
            <MoveConfirmBar
              feet={plannedPath.costFeet}
              clipped={plannedPath.clipped}
              onConfirm={handleConfirmPlan}
              onCancel={handleCancelPlan}
            />
          )}

          {stage === 'awaiting-done' && <div className="em-status">Moving…</div>}
        </>
      ) : (
        <>
          {(stage === 'picking' || (isRefreshing && pickerOpts)) && (
            <>
              {derivedSpeed && derivedSpeed.total > 0 && (
                <div
                  className="em-speed"
                  aria-label="Derived speed"
                  title={formatSpeedBreakdown(derivedSpeed)}
                >
                  Speed <strong>{derivedSpeed.total} ft</strong>
                </div>
              )}
              {feetTotal > 0 && (
                <div className="em-distance" aria-label="Distance walked">
                  Moved <strong>{feetTotal} ft</strong>
                </div>
              )}
              {isRefreshing && <div className="em-status em-status--refresh">Updating…</div>}
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
                onCancel={handleDone}
              />
            </>
          )}

          {stage === 'awaiting-done' && (
            <div className="em-status">Moving…</div>
          )}
        </>
      )}
    </div>
  );
};

export default ExplorationMove;
