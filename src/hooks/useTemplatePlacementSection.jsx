import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapSnapshotViewer from '../components/encounter/MapSnapshotViewer';
import SnapshotAreaOverlay from '../components/encounter/SnapshotAreaOverlay';
import DirectionRosette, { ROSETTE_DIRECTIONS } from '../components/encounter/DirectionRosette';
import { useSceneSnapshot } from './useSceneSnapshot';
import { useEncounter } from './useEncounter';
import { useBridgeStatus } from './useBridgeStatus';
import { worldPointFromTap } from '../utils/snapshotGeometry';
import { parseRangeIncrement } from '../utils/rangeIncrement';
import { templateRangeGate } from '../utils/templateRangeGating';
import { MAP_TARGET_PROTOCOL, DIRECTIONAL_AREA_PROTOCOL } from '../utils/movement';
import { visibleOrder } from '../utils/encounterUtils';
import {
  parseSpellArea, areaNeedsPlacement, areaComputesOccupancy, areaOccupants, areaLabel,
  snapToGridIntersection, intersectionFromWorld, casterRectFromPosition, casterRectCenterWorld,
  directionalOriginWorld, directionalAreaCells,
} from '../utils/spellArea';

/**
 * Area placement (#1573 B3, caster-centered + preview #1751 wave 2) — where
 * does the Fireball actually go?
 *
 * Players have no canvas, so an area spell has always resolved as "the GM
 * decides who was in it". This section puts B1's snapshot in the cast flow:
 * tap the map, and the burst's occupants are computed from real token
 * positions and offered as the save targets.
 *
 * Shape behavior follows PF2e (see utils/spellArea):
 *   burst      → tap to place; occupants computed from the snapped intersection
 *   emanation  → nothing to place (centred on you); occupants computed at once
 *   cone/line  → SELF-ORIGIN once the bridge speaks DIRECTIONAL_AREA_PROTOCOL
 *                (#1735 S3): no tap at all, just an 8-point DirectionRosette
 *                pick, and occupancy computes from the real `coneCells`/
 *                `lineCells` cell set exactly like burst/emanation. BELOW
 *                that floor the pre-#1735 v1 fallback still runs verbatim —
 *                tap an aim point, pick a facing, ping the table, and let the
 *                GM adjudicate who is caught.
 *
 * #1751 wave 2 adds, on top of wave 1's origin rework:
 *   S1  the capture is CENTRED ON THE CASTER at spell range (protocol ≥
 *       MAP_TARGET_PROTOCOL), not the GM's viewport — see `capture()`.
 *   S2  a live shape preview (`SnapshotAreaOverlay`) drawn on the snapshot
 *       BEFORE confirm — the outline, the counted cells, an optional lattice.
 *   S3  the `templatedone` ack is read: an "outline placed"/"didn't land"
 *       note, and the returned `templateId` is retained on the log entry
 *       (the closest thing this codebase has to a "cast record") for #1734
 *       S5's cleanup rail to find later.
 *   S4  `templateRangeGate` HARD-BLOCKS confirm for an out-of-range snapped
 *       placement (ruled OQ-5) — an unparseable range degrades to no gate.
 *   S5  cone/line get an 8-point `DirectionRosette` after the origin tap; the
 *       overlay draws a facing ARROW — the fallback #1735 S3 keeps for a
 *       sub-DIRECTIONAL_AREA_PROTOCOL bridge (see below).
 *
 * #1735 S3 (this wave) makes cone/line a full peer of burst/emanation at
 * DIRECTIONAL_AREA_PROTOCOL and above:
 *   - no origin tap — the rosette shows as soon as the map is open, and the
 *     origin is derived from the caster's own rectangle (`directionalOriginWorld`)
 *   - the overlay draws the REAL cell coverage (`directionalAreaCells`), not
 *     just a facing hint
 *   - `templateplace` carries `direction`/`width` and the bridge draws a real
 *     Region wedge/line instead of only pinging
 *   - occupants (and therefore the auto-adopt "Target these N" flow) compute
 *     from the same cell set, nearest-caster-first, same as every other shape
 *   - player-facing occupant lists — ALL FOUR shapes, retroactively for
 *     burst/emanation too (a latent leak the epic's hidden-filtering ruling
 *     named) — drop `hidden: true` combatants via `visibleOrder`; a hidden
 *     creature is never auto-targeted for a save from this flow — the GM's
 *     own dock-side save tooling covers that separately, on the full order
 *     it always sees
 *
 * Placement is deliberately OPTIONAL — there is no confirm gate for a spell
 * with NO area, or for one whose placement is simply skipped. Every area
 * spell must stay castable exactly as before when the bridge is offline, in
 * the sandbox, or when the player simply doesn't need the map. `gateOk` only
 * ever goes false for an actual out-of-range TAP (S4) — it is never a reason
 * a spell with an area can't be cast at all.
 *
 * Section-hook shape, matching the #1317 D1/D2 pattern:
 *   { section, applyOnConfirm, hasArea, gateOk }
 *
 * NOTE (integration): `gateOk` is returned for the modal's `confirmEnabled`
 * expression to fold in (`&& placement.gateOk`, alongside `anyTargetOutOfRange`
 * and the other gate hooks) — that one-line wiring lives in
 * UseAbilityModal.jsx, owned by a concurrent sibling PR this wave, so it is
 * NOT done here. Until it lands, `applyOnConfirm` still refuses to place or
 * ping an out-of-range tap on its own (see below) — a partial, defensive
 * enforcement at the point this hook actually controls.
 *
 * @param {Object} ability
 * @param {Array}  order          encounter order (names/kind for occupants)
 * @param {string} casterEntryId  the caster's combatant id (emanation origin,
 *                                and the `moverId` a caster-centered capture
 *                                requests — the same id space `positions` and
 *                                the encounter order already key on)
 * @param {Object} positionsState cnmh_positions_global: { gridSize, positions }
 * @param {Function} adoptTargets (entryIds) => void — hand occupants to the
 *                                modal's target set; it toggles on what's missing
 */
export const useTemplatePlacementSection = ({
  ability,
  order = [],
  casterEntryId,
  positionsState,
  adoptTargets,
}) => {
  const {
    request, requesting, available, canPing, ping, canTemplate, placeTemplate, templateAck, cancel,
  } = useSceneSnapshot();
  const { protocol } = useBridgeStatus();
  const { appendLog, patchLogEntry } = useEncounter();
  const [snapshot, setSnapshot] = useState(null);
  const [marker, setMarker] = useState(null);
  const [failed, setFailed] = useState(false);
  const [adopted, setAdopted] = useState(false);
  const [direction, setDirection] = useState(null); // rosette pick, cone/line only (#1751 S5)
  const [templateOutcome, setTemplateOutcome] = useState(null); // 'placed' | 'failed' | null (#1751 S3)

  const area = useMemo(() => parseSpellArea(ability), [ability]);
  const hasArea = !!area;
  const directional = area?.shape === 'cone' || area?.shape === 'line';
  // #1735 S3: a cone/line only gets the self-origin flow once the bridge
  // speaks the protocol that taught `templateplace` its `direction`/`width`
  // fields (PR #1763) — below that floor `spellArea.js`'s own
  // `areaComputesOccupancy`/`PLACEABLE_SHAPES` now say cone/line behave like
  // burst/emanation, but there is nowhere on the wire to SEND that yet, and
  // no facing to compute from without the rosette this floor never shows.
  // Both booleans below suppress that until the protocol (and therefore the
  // whole flow) is actually available — the pre-#1735 v1 fallback runs
  // unchanged for an older bridge.
  const directionalReady = directional && (protocol ?? 0) >= DIRECTIONAL_AREA_PROTOCOL;
  const needsPlacement = areaNeedsPlacement(area) && !directionalReady;
  const computesOccupancy = areaComputesOccupancy(area) && (!directional || directionalReady);

  const positions = positionsState?.positions || null;
  // Player-facing occupant lists exclude hidden combatants (#1735 epic
  // ruling, RETROACTIVE to burst/emanation — a latent leak the ruling named).
  // `areaOccupants`'s own "combatants the encounter order does not know"
  // filter is what makes passing a pre-filtered order enough: an entryId
  // `visibleOrder` dropped simply never resolves to an entry, so it's
  // dropped from occupants too, with no separate filter needed there.
  const visibleEncounterOrder = useMemo(() => visibleOrder(order), [order]);

  // The tapped point in world space, then SNAPPED to the nearest grid
  // intersection — a burst (or a cone/line's origin, #1751 OQ-1) originates
  // at a grid line crossing, not a cell. `placedIntersectionWorld` is what
  // gets sent to `templateplace`, so the outline Foundry draws and the point
  // occupancy is measured from agree exactly; `placedIntersection` is the
  // same point in the corner-index space `areaOccupants`/`templateRangeGate`
  // measure in.
  const placedWorld = useMemo(
    () => (marker ? worldPointFromTap(snapshot, marker.nx, marker.ny) : null),
    [snapshot, marker]
  );
  const placedIntersectionWorld = useMemo(
    () => snapToGridIntersection(placedWorld, snapshot?.gridSize),
    [placedWorld, snapshot]
  );
  const placedIntersection = useMemo(
    () => intersectionFromWorld(placedWorld, snapshot?.gridSize),
    [placedWorld, snapshot]
  );

  // An emanation is centred on the caster's occupied RECTANGLE (token-size-
  // aware) — nothing to tap. A self-origin-ready cone/line (#1735 S3) shares
  // the same rectangle (it's the face/corner ANY facing derives from), so
  // both need it; a burst, or a cone/line still on the pre-#1735 fallback,
  // needs the placed intersection instead. Split into rect + center so the
  // overlay (S2) can draw the true rounded-rect ring from the rect itself,
  // not just its center point.
  const casterRect = useMemo(() => {
    if (area?.shape !== 'emanation' && !directionalReady) return null;
    return casterRectFromPosition(positions?.[casterEntryId]);
  }, [area, directionalReady, positions, casterEntryId]);
  const casterWorld = useMemo(
    () => casterRectCenterWorld(casterRect, positionsState?.gridSize),
    [casterRect, positionsState]
  );

  // The rosette's picked direction, translated to the wire's compass-degree
  // vocabulary (#1735 S3) — `ROSETTE_DIRECTIONS` carries `compassDeg`
  // explicitly (rather than this hook assuming the array's order matches
  // `normalizeCompassDeg`'s), so a reorder of one never silently breaks the
  // other. Only meaningful once `directionalReady`; null otherwise, and null
  // before any rosette pick.
  const compassDeg = useMemo(() => {
    if (!directionalReady || !direction) return null;
    return ROSETTE_DIRECTIONS.find((d) => d.name === direction)?.compassDeg ?? null;
  }, [directionalReady, direction]);

  // The self-derived origin a directional `templateplace` carries as its
  // `x`/`y` (#1735 S3) — the SAME point `directionalAreaCells` measures cells
  // from, so the canvas outline and the occupant list never disagree.
  const directionalOrigin = useMemo(
    () => (directionalReady && compassDeg !== null
      ? directionalOriginWorld(casterRect, compassDeg, positionsState?.gridSize)
      : null),
    [directionalReady, compassDeg, casterRect, positionsState]
  );

  // The FULL cone/line cell coverage for the live preview (#1735 S3) —
  // independent of who's actually standing in it, unlike `occupantCells`
  // below: a cone with nobody in it should still show its shape.
  const directionalTemplateCells = useMemo(() => {
    if (!directionalReady || compassDeg === null || !casterRect) return [];
    return directionalAreaCells(area, casterRect, compassDeg);
  }, [directionalReady, compassDeg, casterRect, area]);

  const occupants = useMemo(() => {
    if (!computesOccupancy) return [];
    if (needsPlacement && !placedIntersection) return [];
    if (directionalReady && compassDeg === null) return [];
    return areaOccupants(area, {
      originIntersection: placedIntersection,
      positions,
      casterEntryId,
      order: visibleEncounterOrder,
      compassDeg,
    });
  }, [
    area, computesOccupancy, needsPlacement, placedIntersection, positions, casterEntryId,
    visibleEncounterOrder, directionalReady, compassDeg,
  ]);

  // The cells the app will actually count, for the preview (#1751 S2) — every
  // occupant's own `positions` cell, re-derived rather than threaded through
  // `areaOccupants` (which intentionally returns entryId/name/kind/feet, not
  // the cell — occupancy math and the preview's drawing needs are separate
  // concerns). Hidden combatants never enter `occupants` in the first place
  // (see `visibleEncounterOrder` above), so their cells never shade here
  // either — the same fix applies to the counted-cell preview as the text
  // list below it.
  const occupantCells = useMemo(
    () => occupants
      .map((o) => positions?.[o.entryId])
      .filter(Boolean)
      .map((p) => ({ col: p.col, row: p.row })),
    [occupants, positions]
  );

  // Where the area actually sits, whether it was tapped or derived. An
  // emanation and a self-origin-ready cone/line derive it from the caster;
  // a burst, or a cone/line still on the fallback, sends the tapped
  // (SNAPPED) intersection.
  const originWorld = area?.shape === 'emanation'
    ? casterWorld
    : directionalReady
      ? directionalOrigin
      : placedIntersectionWorld;

  // ── S4: range hard-block (#1751 OQ-5, ruled 2026-08-16 GM) ────────────────
  // `templateRangeGate` measures caster→placed distance in the SAME
  // grid-coordinate space on both ends — the caster's raw `positions` cell
  // (its anchor corner) against the placed intersection — which is exactly
  // the "pick one space, stay consistent" contract the util documents; the
  // resulting systematic offset is at most half a square, well inside the
  // frame's own ~41%-in-the-corners slop the capture radius already accepts.
  // Unparseable ranges (touch/self/prose) degrade to `blocked: false` inside
  // the util itself — nothing here needs to special-case that.
  //
  // Self-origin shapes (emanation always, cone/line once `directionalReady`)
  // trivially pass: `needsPlacement` is false for them, so this hits the
  // early `{ blocked: false, ... }` branch below without ever calling
  // `templateRangeGate`. That's correct, not a gap — a cone/line's `range`
  // content field (when present at all) describes the SHAPE'S OWN LENGTH
  // (`area.feet` already carries that), not a placement distance from the
  // caster the way a burst's does, so there is nothing for a placement-range
  // gate to measure here in the first place.
  const casterCell = positions?.[casterEntryId] || null;
  const rangeGate = useMemo(() => {
    if (!needsPlacement || !placedIntersection) {
      return { blocked: false, rangeFeet: parseRangeIncrement(ability?.range), feet: null };
    }
    return templateRangeGate({ range: ability?.range, casterCell, placedCell: placedIntersection });
  }, [needsPlacement, placedIntersection, ability, casterCell]);

  // A gate that CAN fail, unlike wave 1's placement gate: an out-of-range tap
  // hard-blocks. See the class doc comment above re: the modal-level
  // `confirmEnabled` wiring this still needs, done by a sibling this wave.
  const gateOk = !rangeGate.blocked;

  const directionVector = useMemo(
    () => (direction ? ROSETTE_DIRECTIONS.find((d) => d.name === direction) || null : null),
    [direction]
  );

  // #1751 S1: the spell's own range (plus the area's own reach) sizes the
  // caster-centered capture, so the far edge of a legally-placed burst is
  // still in frame. `parseRangeIncrement` returns null for touch/self/prose/
  // unparseable text — the "sensible default" for that case is to send NO
  // `radiusFeet` at all, deferring to the bridge's own default (1.5× the
  // caster's Speed, `moverCaptureRect`'s existing fallback via
  // `foundry-bridge/snapshots.js`'s `rectForMover`) rather than inventing a
  // second magic number this app doesn't otherwise know.
  const rangeFeet = useMemo(() => parseRangeIncrement(ability?.range), [ability]);
  const captureRadiusFeet = useMemo(
    () => (rangeFeet != null ? rangeFeet + (area?.feet || 0) : undefined),
    [rangeFeet, area]
  );

  // Snapshot of the `positions` reference at the moment of capture (#1751
  // OQ-3) — `cnmh_positions_global` carries no wire timestamp to compare
  // against `snapshot.ts`, but useSyncedState hands back a fresh object
  // reference on every bridge repush, so "positions changed since this photo
  // was taken" is exactly "the reference we captured no longer matches the
  // live one". Cheaper and more honest than inventing a clock comparison.
  const capturedPositionsRef = useRef(null);
  const stale = !!snapshot && !!positions && positions !== capturedPositionsRef.current;

  // Invalidates any in-flight capture this instance started — bumped on
  // every fresh capture() call (a stray earlier reply must never land after
  // a newer one) AND on unmount.
  const captureTokenRef = useRef(0);

  const capture = useCallback(async () => {
    const token = (captureTokenRef.current += 1);
    setFailed(false);
    setMarker(null);
    setAdopted(false);
    setDirection(null);
    setTemplateOutcome(null);

    // #1751 S1: a caster-centered capture at spell range, gated at
    // MAP_TARGET_PROTOCOL (17 — the shared bump that also taught `positions`
    // width/height, #1751/#1749). Below the floor, or when the mover-centered
    // request comes back `ok:false`/times out (resolves null either way, see
    // useSceneSnapshot), fall back to the bare legacy `request()` — the exact
    // GM-viewport capture every pre-wave-2 client already gets.
    let snap = null;
    if ((protocol ?? 0) >= MAP_TARGET_PROTOCOL) {
      snap = await request({ moverId: casterEntryId, radiusFeet: captureRadiusFeet });
    }
    if (!snap && captureTokenRef.current === token) {
      snap = await request();
    }
    if (captureTokenRef.current !== token) return; // superseded by a newer capture, or unmounted

    if (snap) {
      capturedPositionsRef.current = positions;
      setSnapshot(snap);
    } else {
      setFailed(true);
    }
  }, [request, protocol, casterEntryId, captureRadiusFeet, positions]);

  // The player leaves this section (the modal closes, or this hook instance
  // unmounts) before an in-flight capture resolves: cancel() frees
  // useSceneSnapshot's one-in-flight slot so the next mount's request() isn't
  // silently swallowed, and bumping the token stops the eventual resolution
  // from calling setState on an unmounted section (#1751 S1, mirrors
  // useMoverMapSurface's own unmount cleanup).
  useEffect(() => () => {
    captureTokenRef.current += 1;
    cancel();
  }, [cancel]);

  // #1751 S3: correlate OUR OWN template placement against the (fire-and-
  // forget, last-writer-wins) `templatedone` channel by the request id
  // `placeTemplate()` handed back — never "whatever the last ack happened to
  // be", which could belong to a different table member's cast entirely.
  const pendingTemplateRef = useRef(null); // { reqId, logId } | null

  useEffect(() => {
    const pending = pendingTemplateRef.current;
    if (!pending || !templateAck || templateAck.id !== pending.reqId) return;
    pendingTemplateRef.current = null;
    setTemplateOutcome(templateAck.ok ? 'placed' : 'failed');
    if (templateAck.ok) {
      // The "cast record" this codebase has: the log entry `applyOnConfirm`
      // already wrote. Patched in once the ack lands (well after the log
      // line itself), so #1734 S5's cleanup rail has a `templateId` to find.
      patchLogEntry(pending.logId, { templateId: templateAck.templateId ?? null });
    }
  }, [templateAck, patchLogEntry]);

  const adopt = useCallback(() => {
    adoptTargets?.(occupants.map((o) => o.entryId));
    setAdopted(true);
  }, [adoptTargets, occupants]);

  // Confirm slice (#1573 B4): draw the real outline on the canvas when the
  // bridge can (the bridge pings its centre too), otherwise fall back to B2's
  // bare ping — a protocol-12 module still shows the table where it landed.
  // #1735 S3: a directionalReady cone/line now draws too — a directional
  // `direction`/`width` rides along, same as any other field on this
  // request. Below DIRECTIONAL_AREA_PROTOCOL a cone/line still only ever
  // pings (the local `computesOccupancy`, NOT `spellArea.js`'s own
  // `areaComputesOccupancy(area)`, gates this — the local one already folds
  // in the protocol floor; calling the imported function directly here would
  // send a directional template to a bridge that can't parse it).
  // #1751 S4: an out-of-range tap hard-blocks BOTH the draw and the ping —
  // nothing about this placement should reach the table at all.
  const applyOnConfirm = useCallback(() => {
    if (!hasArea || !originWorld) return;
    if (rangeGate.blocked) return;
    const sceneId = snapshot?.capture?.sceneId;
    const templateReq = canTemplate && computesOccupancy
      && placeTemplate({
        shape: area.shape,
        feet: area.feet,
        x: originWorld.x,
        y: originWorld.y,
        sceneId,
        name: ability?.name,
        ...(directionalReady ? { direction: compassDeg } : {}),
        ...(directionalReady && area.shape === 'line' ? { width: area.width || 5 } : {}),
      });
    if (!templateReq && canPing) {
      ping({ x: originWorld.x, y: originWorld.y, sceneId });
    }
    const caught = occupants.length
      ? ` — ${occupants.length} creature${occupants.length === 1 ? '' : 's'} in the area`
      : '';
    const logId = appendLog({
      type: 'action',
      text: `${ability?.name || 'Area'} placed (${areaLabel(area)})${caught}`,
      templateId: null,
    });
    if (templateReq) {
      pendingTemplateRef.current = { reqId: templateReq.id, logId };
    }
  }, [
    hasArea, originWorld, rangeGate, canTemplate, computesOccupancy, placeTemplate, canPing, ping,
    snapshot, occupants, appendLog, ability, area, directionalReady, compassDeg,
  ]);

  // Nothing to show for a spell with no area. #1751 OQ-6: the emanation
  // occupant list and the area label are pure `positions` + parsed-area
  // math and need no capture, so `hasArea` alone gates the section — only
  // the capture/placement UI below (the button, the snapshot viewer) gates
  // on `available`. A bridge-less client still gets the full section for a
  // spell that doesn't need placement.
  // Do we know enough to claim an occupancy answer at all? A burst needs its
  // tap; a directionalReady cone/line needs a rosette pick; everything else
  // that computes occupancy (emanation, or a directionalReady cone/line once
  // picked) knows immediately.
  const occupancyReady = computesOccupancy
    && (needsPlacement ? !!placedIntersection : (!directionalReady || compassDeg !== null));

  const section = !hasArea ? null : (
    <>
      <hr className="ct-divider" />
      <section className="ct-section" data-testid="area-placement-section">
        <h3 className="ct-section-title">Area — {areaLabel(area)}</h3>

        {!needsPlacement && !directional && (
          <div className="uam-variant-note">
            Centred on you — no placement needed.
          </div>
        )}

        {(needsPlacement || directionalReady) && !available && (
          <div className="uam-variant-note" role="status">
            No live map available — cast without placing, or let the GM judge
            who's caught.
          </div>
        )}

        {(needsPlacement || directionalReady) && available && !snapshot && (
          <button
            type="button"
            className="btn-secondary"
            onClick={capture}
            disabled={requesting}
          >
            {requesting ? 'Asking the GM screen…' : 'Place on the map'}
          </button>
        )}

        {failed && (
          <div className="uam-variant-note" role="status">
            No snapshot came back — cast without placing, or try again.
          </div>
        )}

        {stale && (
          <div className="uam-variant-note" role="status" data-testid="area-stale-banner">
            The battlefield has changed since this photo.{' '}
            <button type="button" className="btn-secondary" onClick={capture}>
              Refresh
            </button>
          </div>
        )}

        {available && snapshot && (
          <>
            <MapSnapshotViewer
              src={snapshot.url}
              marker={directionalReady ? null : marker}
              onPick={directionalReady ? undefined : (point) => {
                setMarker(point);
                setAdopted(false);
                setDirection(null);
                setTemplateOutcome(null);
              }}
              overlay={(
                <SnapshotAreaOverlay
                  snapshot={snapshot}
                  shape={area.shape}
                  feet={area.feet}
                  origin={
                    area.shape === 'emanation'
                      ? null
                      : directionalReady ? directionalOrigin : placedIntersectionWorld
                  }
                  casterRect={
                    area.shape === 'emanation'
                      ? casterRect
                      : directionalReady ? casterRect : null
                  }
                  direction={directionalReady ? null : directionVector}
                  templateCells={directionalReady ? directionalTemplateCells : []}
                  occupantCells={occupantCells}
                  showLattice
                />
              )}
            />
            {/* #1735 S3: a self-origin-ready cone/line jumps straight to the
                rosette — no origin tap first, unlike the pre-#1735 fallback
                just below. */}
            {directionalReady && (
              <DirectionRosette
                value={direction}
                onChange={(name) => {
                  setDirection(name);
                  setAdopted(false);
                  setTemplateOutcome(null);
                }}
                label={`${area.shape} facing`}
              />
            )}
            {/* Pre-#1735 fallback, kept verbatim: a cone/line only pings an
                aim point, and the GM adjudicates who is caught. */}
            {!computesOccupancy && !directionalReady && marker && (
              <>
                <div className="uam-variant-note">
                  A {area.shape} needs a facing, so the GM calls who is caught — your
                  mark pings the map on confirm. Cell occupancy for cones/lines needs
                  #1735's geometry, not built here.
                </div>
                <DirectionRosette
                  value={direction}
                  onChange={setDirection}
                  label={`${area.shape} facing`}
                />
              </>
            )}
          </>
        )}

        {needsPlacement && rangeGate.blocked && (
          <div className="uam-variant-note" role="alert" data-testid="area-range-blocked">
            Out of range — {rangeGate.feet} ft is beyond {ability?.name || 'this spell'}'s{' '}
            {rangeGate.rangeFeet}-ft range. Tap closer to place it.
          </div>
        )}

        {occupancyReady && (
          <div className="uam-variant-note" data-testid="area-occupants">
            {!positions ? (
              'Token positions unavailable — the GM will judge who is caught.'
            ) : occupants.length === 0 ? (
              'No creatures in the area.'
            ) : (
              <>
                In the area:{' '}
                {occupants.map((o) => `${o.name} (${o.feet} ft)`).join(', ')}
              </>
            )}
          </div>
        )}

        {computesOccupancy && occupants.length > 0 && (
          <button
            type="button"
            className="btn-secondary"
            onClick={adopt}
            disabled={adopted || rangeGate.blocked}
          >
            {adopted
              ? 'Targets set ✓'
              : `Target these ${occupants.length}`}
          </button>
        )}

        {templateOutcome === 'placed' && (
          <div className="uam-variant-note" role="status" data-testid="area-template-outcome">
            The outline landed on the table.
          </div>
        )}
        {templateOutcome === 'failed' && (
          <div className="uam-variant-note" role="alert" data-testid="area-template-outcome">
            The outline didn't land — wrong scene, or Foundry couldn't create it.
          </div>
        )}
      </section>
    </>
  );

  return { section, applyOnConfirm, hasArea, gateOk };
};

export default useTemplatePlacementSection;
