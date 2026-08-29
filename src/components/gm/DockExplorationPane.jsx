import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { usePlayMode } from '../../hooks/usePlayMode';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useTokenMovement } from '../../hooks/useTokenMovement';
import { usePartyMapSurface } from '../../hooks/usePartyMapSurface';
import { usePathPreview } from '../../hooks/usePathPreview';
import { useSceneDoors } from '../../hooks/useSceneDoors';
import { getCharacterColor } from '../../utils/CharacterUtils';
import { buildPartyMarkers, buildDoorMarkers } from '../../utils/tokenMarkers';
import { hitTestMarkers } from '../../utils/markerHitTest';
import { worldPointFromTap, cellFromWorldPoint } from '../../utils/snapshotGeometry';
import { PARTY_MAP_PROTOCOL } from '../../utils/snapshotRelay';
import { APP, globalKey } from '../../sync/keys';
import MapSnapshotViewer from '../encounter/MapSnapshotViewer';
import SnapshotRouteOverlay from '../encounter/SnapshotRouteOverlay';
import PartyTokensOverlay from './PartyTokensOverlay';
import DoorGlyphsOverlay from './DoorGlyphsOverlay';
import DockExplorationRoster from './DockExplorationRoster';
import './DockExplorationPane.css';

// GM Command Dock — Exploration pane (#1808, epic #1804 S4). Replaces the
// dock's exploration DockStub with the party's shared control surface.
//
// THE MAP IS THE CONTROL SURFACE (epic ruling). Exploration has no turn order:
// the whole party moves together and the GM drives. So instead of five per-PC
// control panes, one party-framed snapshot (#1807's `snapreq { party: true }`)
// carries the entire loop:
//
//     tap a PC's token → tap where they're going → they move → tap the next PC
//
// NO CONFIRM GATE (epic ruling): the pane auto-confirms the instant the
// bridge's planned route arrives, so `MoveConfirmBar` never appears here. Wall
// and door legality is still checked bridge-side by the plan step — a route
// that can't reach comes back CLIPPED, the token walks the reachable prefix,
// and the GM taps again to continue. The GM is already looking at the real
// canvas; a second tap to say "yes, really" is pure ceremony at the table.
//
// Each PC rides their own per-`charId` `movereq → moveopts → moveplan →
// moveconfirm → movedone` machine, so nothing about this is a new wire
// protocol — five concurrent movers are relay-legal today. ONE ACTIVE PLAN at
// a time (v1 ruling): selecting another PC cancels the previous one's in-flight
// pick, but never waits on a move that is already animating in Foundry.
//
// KNOWN v1 EDGE (accepted with that ruling): the exploredist tally below
// accrues from the SELECTED mover's `movedone`. Selecting the next PC while
// the previous one's token is still animating re-points this component's
// movement machine at the new charId, so that in-flight move's feet don't land
// in the tally. The table's actual loop — tap, watch them arrive, tap the next
// — is unaffected; the S7 time-suggestion loop reads a tally that is
// occasionally short, never long.
//
// SELECTION IS A SET (#1824, epic #1822 A2): tapping a PC marker or roster
// chip TOGGLES membership in `selectedIds` instead of replacing it — the
// group-move epic's ruling. `useTokenMovement` still mounts exactly ONCE
// (never N instances): it's keyed on the selection's sole member when
// `selectedIds.size === 1`, and on `null` (its existing inert-key path)
// otherwise. That means:
//   · size === 1 is BYTE-FOR-BYTE today's flow — same hook instance, same
//     select-fires-requestMove effect, same auto-confirm, same route overlay.
//   · size === 0 or size >= 2 both leave the movement hook inert, exactly
//     like the pre-#1824 "nothing selected" state did.
// A destination tap with 2+ selected is a placeholder branch in
// `handleMapTap` below — dispatch lands in slice B1 once the bridge rail
// (#1823, protocol 22) ships; today it's a deliberate no-op (no relay write).
//
// DEGRADATION (epic ruling): no bridge, or a bridge below PARTY_MAP_PROTOCOL,
// shows a note instead of the map. There is deliberately no abstract-grid
// fallback for the party view — per-PC grids defeat the point of one shared
// surface. The pane shell still renders, because later slices hang the roster
// strip (#1810) and the time control (#1811) off it.
//
// LAYOUT SEAMS for the rest of the epic:
//   · `.dock-exp-body` is a two-column grid: the map, and S6's roster strip
//     (#1810 — DockExplorationRoster, which shares this component's mover
//     selection and carries the per-PC activity control).
//   · the map's `overlay` prop hosts a stack of %-space SVG siblings; S5
//     (#1809) added `DoorGlyphsOverlay` as one more entry in that stack,
//     below `PartyTokensOverlay` in draw order (a token standing on a door
//     square still reads as a token first).
//
// DOOR GLYPHS (#1809, S5): `cnmh_dooropts_global` (protocol >= 20) carries
// every door on the rendered scene; `buildDoorMarkers` filters that down to
// the ones inside the captured frame and projects them, same as the party
// token markers below. Door taps share the ONE tap handler's resolution
// order — PC markers first, doors second, a destination cell last — so a
// door standing near a PC's token is never ambiguous with a move order, and
// a tap that lands a door never also plans a route.

const STAGE_STATUS = {
  'awaiting-opts': 'Reading reachable squares…',
  'awaiting-plan': 'Plotting route…',
  planned: 'Confirming…',
  'awaiting-done': 'Moving…',
};

const DockExplorationPane = () => {
  const { characters, theme } = useContent();
  const { moveEnabled, setMoveEnabled } = usePlayMode();
  const [, setExploreDist] = useSyncedState(globalKey(APP.EXPLOREDIST), 0);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [feetTotal, setFeetTotal] = useState(0);

  // The movement hook mounts on the selection's sole member when exactly one
  // PC is selected, `null` otherwise (its existing inert-key path — see the
  // file header). This is the ONE seam that keeps size-1 identical to the
  // pre-#1824 single-select flow and guarantees we never mount N movement
  // hooks for a multi-selection.
  const singleSelectedId = selectedIds.size === 1 ? [...selectedIds][0] : null;

  const { status, snapshot, tokens, eligible, refresh } = usePartyMapSurface({ active: true });
  const { doors, interactDoor } = useSceneDoors();

  const requestMoveRefreshRef = useRef(null);

  // Mirrors ExplorationMove's isGm branch (#1811 feeds on this tally) — the
  // dock is a GM-only surface, so the accrual is unconditional here.
  const handleMoveDone = useCallback((payload) => {
    const feet = payload?.feetMoved ?? 0;
    setFeetTotal((f) => f + feet);
    if (feet > 0) setExploreDist((d) => (d || 0) + feet);
    // Re-arm the picker at the new origin so the GM can keep walking this PC
    // without re-selecting them (the bridge usually piggybacks nextOpts, so
    // this is normally free — see useTokenMovement.requestMoveRefresh).
    requestMoveRefreshRef.current?.('stride');
  }, [setExploreDist]);

  // Keyed on `singleSelectedId`. With nothing selected (or 2+ selected) the
  // hook subscribes to an inert `cnmh_moveopts_null`-style key it never
  // writes to; every call below is gated on the single-selection case, and
  // every selection-changing action calls cancelMove() first so no
  // stage/plan state ever leaks from one PC (or one selection shape) into
  // the next.
  const {
    stage, pickerOpts, plannedPath,
    requestMove, requestMoveRefresh, planMove, confirmPlannedMove, cancelPlan, cancelMove,
  } = useTokenMovement(singleSelectedId, { onMoveDone: handleMoveDone, ignoreOccupancy: true });

  requestMoveRefreshRef.current = requestMoveRefresh;
  const requestMoveRef = useRef(null);
  requestMoveRef.current = requestMove;
  const confirmRef = useRef(null);
  confirmRef.current = confirmPlannedMove;
  const cancelPlanRef = useRef(null);
  cancelPlanRef.current = cancelPlan;

  const canMove = eligible && moveEnabled && !!snapshot;

  const accentFor = useCallback((charId, index) => (
    theme?.accentOverrides?.[charId] || (index >= 0 ? getCharacterColor(index) : null)
  ), [theme]);

  const markers = useMemo(
    () => buildPartyMarkers({ tokens, snapshot, characters, accentFor }),
    [tokens, snapshot, characters, accentFor]
  );

  // Re-filtered whenever the frame changes (a new capture may shift
  // `worldRect`) or the door list itself changes (a bridge re-push).
  const doorMarkers = useMemo(
    () => buildDoorMarkers({ doors, snapshot }),
    [doors, snapshot]
  );

  // The single-selection marker (route overlay + status text below) — only
  // meaningful when exactly one PC is selected, same gate as the movement
  // hook itself.
  const selected = markers.find((m) => m.moverId === singleSelectedId) || null;

  // Other movers' route ghosts — GM audience (this is a GM-exclusive mount,
  // the same channel DockRoutePreviews reads); the selected PC's own route is
  // drawn from `plannedPath` instead, so exclude them.
  const { entries: ghostEntries } = usePathPreview({ audience: 'gm' });
  const sceneId = snapshot?.capture?.sceneId || null;
  const ghosts = useMemo(() => {
    if (!snapshot) return [];
    return ghostEntries.filter((entry) => {
      if (entry.id === singleSelectedId) return false;
      if (sceneId && entry.sceneId && entry.sceneId !== sceneId) return false;
      return true;
    });
  }, [ghostEntries, snapshot, sceneId, singleSelectedId]);

  // Selecting fires the mover's own movereq. It has to be an effect rather
  // than part of the tap handler: `requestMove` closes over the charId from
  // the render it was created in, so firing it in the same handler that sets
  // the selection would send the request for the PREVIOUS mover. Only fires
  // for the single-selection case — the hook is inert for 0 or 2+ selected.
  useEffect(() => {
    if (!singleSelectedId || !canMove) return;
    requestMoveRef.current?.('stride');
  }, [singleSelectedId, canMove]);

  // AUTO-CONFIRM (the epic's no-confirm-gate ruling): the moment a planned
  // route lands, execute it. A plan with no cells is the one case worth
  // refusing — confirming it would send empty waypoints — so drop back to the
  // tap state and let the GM pick again.
  useEffect(() => {
    if (stage !== 'planned') return;
    if (plannedPath?.path?.length) confirmRef.current?.(0);
    else cancelPlanRef.current?.();
  }, [stage, plannedPath]);

  // TOGGLE semantics (#1824, epic #1822 ruling — replaces the old
  // replace-selection behavior): tapping a PC adds or removes them from the
  // set without disturbing anyone else already selected. Every call that
  // changes the selection's SHAPE cancels the currently-mounted movement
  // hook first, exactly like the old selectMover did — harmless when that
  // hook is already inert (0 or 2+ selected), and it's what stops a
  // mid-flight plan/stage from leaking across a selection change when we're
  // leaving or entering the single-selection case.
  const toggleMover = (moverId) => {
    cancelMove();
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(moverId)) next.delete(moverId);
      else next.add(moverId);
      return next;
    });
  };

  const selectAllMovers = () => {
    cancelMove();
    setSelectedIds(new Set((Array.isArray(characters) ? characters : []).map((c) => c.id)));
  };

  const clearSelection = () => {
    cancelMove();
    setSelectedIds(new Set());
  };

  // ONE tap handler for the whole surface: a tap that resolves to a PC marker
  // toggles that mover, anything else is a destination for the current
  // selection. Marker resolution runs first and uses the shared CSS-px snap
  // radius (hitTestMarkers), so a finger landing near a token never walks
  // somebody onto their ally by accident.
  const handleMapTap = ({ nx, ny, paneWidthPx, paneHeightPx }) => {
    if (!snapshot || !canMove) return;
    const hit = hitTestMarkers({ nx, ny }, markers, { paneWidthPx, paneHeightPx });
    if (hit) {
      toggleMover(hit.moverId);
      return;
    }
    // Doors resolve second, using the same shared snap radius — a tap that
    // lands a door is consumed here and never falls through to a
    // destination. Locked doors still consume the tap (no `interactDoor`
    // call, matching the bridge's own ds===2 ignore) rather than letting the
    // GM accidentally plan a move onto a door square they meant to tap.
    // Selection size never changes this branch's behavior.
    const doorHit = hitTestMarkers({ nx, ny }, doorMarkers, { paneWidthPx, paneHeightPx });
    if (doorHit) {
      if (doorHit.state !== 2) interactDoor(doorHit.wallId, doorHit.state === 1 ? 'close' : 'open');
      return;
    }
    if (selectedIds.size === 0) return;
    if (selectedIds.size > 1) {
      // GROUP MOVE (slice B1, epic #1822): dispatch — `cnmh_groupmovereq_global`
      // to the bridge rail #1823 builds in parallel — lands here. Until then
      // a destination tap with 2+ selected is a deliberate no-op: no relay
      // write, no plan. `statusText` below already tells the GM why.
      return;
    }
    // size === 1 — today's single-flow path, byte-for-byte unchanged. One
    // active plan at a time: ignore destination taps while a plan or a move
    // is in flight — a fresh moveplan would re-key the correlation ts and
    // orphan the movedone the previous one is still waiting on.
    if (stage !== 'picking' && stage !== 'planned') return;
    const world = worldPointFromTap(snapshot, nx, ny);
    const cell = cellFromWorldPoint(world, snapshot.gridSize);
    if (cell) planMove([cell]);
  };

  const resetDistance = () => {
    setFeetTotal(0);
    setExploreDist(0);
  };

  const statusText = STAGE_STATUS[stage]
    || (!canMove
      ? null
      : selectedIds.size > 1
        ? `${selectedIds.size} selected — group move arrives with the next bridge update.`
        : selected
          ? `Tap a destination for ${selected.name}.`
          : 'Tap a party member to move them.');

  return (
    <section className="dock-exp" aria-label="Exploration">
      <header className="dock-exp-head">
        <div className="dock-exp-title">
          <span className="dock-exp-kicker">Exploration</span>
          <h2 className="dock-exp-heading">Party map</h2>
        </div>
        <div className="dock-exp-controls">
          <label className="dock-exp-toggle-label" htmlFor="dock-exp-move-toggle">
            Allow token movement
          </label>
          <button
            id="dock-exp-move-toggle"
            type="button"
            role="switch"
            className={`dock-exp-switch${moveEnabled ? ' dock-exp-switch--on' : ''}`}
            aria-checked={moveEnabled}
            onClick={() => setMoveEnabled(!moveEnabled)}
          >
            {/* The pill is a child so the BUTTON can carry the 44px tap
                target without the switch itself having to look 44px tall. */}
            <span className="dock-exp-switch-track" aria-hidden="true">
              <span className="dock-exp-switch-knob" />
            </span>
          </button>
          <button
            type="button"
            className="dock-exp-btn"
            onClick={refresh}
            disabled={!eligible}
          >
            Refresh map
          </button>
        </div>
      </header>

      <div className="dock-exp-body">
        <div className="dock-exp-map">
          {!eligible ? (
            <p className="dock-exp-note" role="status">
              Party map needs the Foundry bridge (protocol {PARTY_MAP_PROTOCOL}+).
            </p>
          ) : (
            <>
              {snapshot ? (
                <MapSnapshotViewer
                  src={snapshot.url}
                  onPick={handleMapTap}
                  overlay={(
                    /* Overlay stack — %-space SVG siblings inside `.msv-pane`,
                       each inheriting the viewer's pan/zoom. */
                    <>
                      <DoorGlyphsOverlay doors={doorMarkers} />
                      {selected && (
                        <SnapshotRouteOverlay
                          snapshot={snapshot}
                          origin={pickerOpts?.origin}
                          cells={plannedPath?.path}
                          destination={plannedPath?.path?.length
                            ? plannedPath.path[plannedPath.path.length - 1]
                            : null}
                          showLattice
                        />
                      )}
                      {ghosts.map((ghost) => (
                        <SnapshotRouteOverlay
                          key={ghost.tokenId}
                          snapshot={snapshot}
                          origin={ghost.origin}
                          cells={ghost.path}
                          destination={ghost.path?.length ? ghost.path[ghost.path.length - 1] : null}
                          variant="ghost"
                        />
                      ))}
                      <PartyTokensOverlay
                        markers={markers}
                        selectedIds={selectedIds}
                        dimmed={!canMove}
                      />
                    </>
                  )}
                />
              ) : (
                <p className="dock-exp-note" role="status">
                  {status === 'unavailable'
                    ? 'No party map available — is anyone on the rendered scene?'
                    : 'Capturing the party map…'}
                </p>
              )}

              <div className="dock-exp-footer">
                {status === 'loading' && snapshot && (
                  <span className="dock-exp-status" role="status">Refreshing map…</span>
                )}
                {!moveEnabled && (
                  <span className="dock-exp-status dock-exp-status--warn">
                    Token movement is off — turn it on to move the party.
                  </span>
                )}
                {statusText && (
                  <span className="dock-exp-status" role="status">{statusText}</span>
                )}
                {feetTotal > 0 && (
                  <span className="dock-exp-distance">
                    Moved <strong>{feetTotal} ft</strong>
                    <button type="button" className="dock-exp-btn" onClick={resetDistance}>
                      Reset
                    </button>
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {/* The roster strip (#1810) — this grid's second column. It shares the
            pane's selection SET (#1824), so tapping a chip and tapping that
            PC's token are the same toggle act (toggleMover cancels the
            movement hook's in-flight pick either way). Rendered whether or
            not the bridge is up: activity control and the party-state
            buttons are the degraded pane's whole reason to exist. */}
        <DockExplorationRoster
          selectedIds={selectedIds}
          onSelect={toggleMover}
          onSelectAll={selectAllMovers}
          onClear={clearSelection}
        />
      </div>
    </section>
  );
};

export default DockExplorationPane;
