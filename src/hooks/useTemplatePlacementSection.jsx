import React, { useCallback, useMemo, useState } from 'react';
import MapSnapshotViewer from '../components/encounter/MapSnapshotViewer';
import { useSceneSnapshot } from './useSceneSnapshot';
import { useEncounter } from './useEncounter';
import { worldPointFromTap } from '../utils/snapshotGeometry';
import {
  parseSpellArea, areaNeedsPlacement, areaComputesOccupancy, areaOccupants, areaLabel,
  snapToGridIntersection, intersectionFromWorld, casterRectFromPosition, casterRectCenterWorld,
} from '../utils/spellArea';

/**
 * Area placement (#1573 B3) — where does the Fireball actually go?
 *
 * Players have no canvas, so an area spell has always resolved as "the GM
 * decides who was in it". This section puts B1's snapshot in the cast flow:
 * tap the map, and the burst's occupants are computed from real token
 * positions and offered as the save targets.
 *
 * Shape behavior follows PF2e (see utils/spellArea):
 *   burst      → tap to place; occupants computed from the tapped cell
 *   emanation  → nothing to place (centred on you); occupants computed at once
 *   cone/line  → tap an aim point, which pings so the table sees the intent;
 *                occupancy needs a facing, so the GM still adjudicates
 *
 * Placement is deliberately OPTIONAL — there is no confirm gate. Every area
 * spell must stay castable exactly as before when the bridge is offline, in the
 * sandbox, or when the player simply doesn't need the map. That is why this
 * module returns no `gateOk`: a gate that can never fail is dead code.
 *
 * Section-hook shape, matching the #1317 D1/D2 pattern:
 *   { section, applyOnConfirm, hasArea }
 *
 * @param {Object} ability
 * @param {Array}  order          encounter order (names/kind for occupants)
 * @param {string} casterEntryId  the caster's combatant id (emanation origin)
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
    request, requesting, available, canPing, ping, canTemplate, placeTemplate,
  } = useSceneSnapshot();
  const { appendLog } = useEncounter();
  const [snapshot, setSnapshot] = useState(null);
  const [marker, setMarker] = useState(null);
  const [failed, setFailed] = useState(false);
  const [adopted, setAdopted] = useState(false);

  const area = useMemo(() => parseSpellArea(ability), [ability]);
  const hasArea = !!area;
  const needsPlacement = areaNeedsPlacement(area);
  const computesOccupancy = areaComputesOccupancy(area);

  const positions = positionsState?.positions || null;

  // The tapped point in world space, then SNAPPED to the nearest grid
  // intersection — a burst originates at a grid line crossing, not a cell
  // (#1751 OQ-1, ruled 2026-08-16 GM; see spellArea.js's convention note).
  // `placedIntersectionWorld` is what gets sent to `templateplace`, so the
  // outline Foundry draws and the point occupancy is measured from agree
  // exactly; `placedIntersection` is the same point in the corner-index
  // space `areaOccupants` measures in.
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
  // aware, #1751 OQ-1) — nothing to tap; a burst needs the placed
  // intersection first.
  const occupants = useMemo(() => {
    if (!computesOccupancy) return [];
    if (needsPlacement && !placedIntersection) return [];
    return areaOccupants(area, {
      originIntersection: placedIntersection,
      positions,
      casterEntryId,
      order,
    });
  }, [area, computesOccupancy, needsPlacement, placedIntersection, positions, casterEntryId, order]);

  const capture = useCallback(async () => {
    setFailed(false);
    setMarker(null);
    setAdopted(false);
    const snap = await request();
    if (snap) setSnapshot(snap); else setFailed(true);
  }, [request]);

  const adopt = useCallback(() => {
    adoptTargets?.(occupants.map((o) => o.entryId));
    setAdopted(true);
  }, [adoptTargets, occupants]);

  // An emanation has no tapped point, but its centre is known: the centre of
  // the caster's occupied RECTANGLE (token-size-aware — a 2x2 caster's
  // outline is centred on their whole space, not their anchor cell). That's
  // enough to draw its outline without ever opening the map.
  const casterWorld = useMemo(() => {
    if (area?.shape !== 'emanation') return null;
    const rect = casterRectFromPosition(positions?.[casterEntryId]);
    return casterRectCenterWorld(rect, positionsState?.gridSize);
  }, [area, positions, casterEntryId, positionsState]);

  // Where the area actually sits, whether it was tapped or derived. A burst
  // sends the SNAPPED intersection, not the raw tap.
  const originWorld = area?.shape === 'emanation' ? casterWorld : placedIntersectionWorld;

  // Confirm slice (#1573 B4): draw the real outline on the canvas when the
  // bridge can (the bridge pings its centre too), otherwise fall back to B2's
  // bare ping — a protocol-12 module still shows the table where it landed.
  // Cones and lines are never drawn: they need a facing, so they only ping.
  const applyOnConfirm = useCallback(() => {
    if (!hasArea || !originWorld) return;
    const sceneId = snapshot?.capture?.sceneId;
    const drawn = canTemplate && areaComputesOccupancy(area)
      && placeTemplate({
        shape: area.shape,
        feet: area.feet,
        x: originWorld.x,
        y: originWorld.y,
        sceneId,
        name: ability?.name,
      });
    if (!drawn && canPing) {
      ping({ x: originWorld.x, y: originWorld.y, sceneId });
    }
    const caught = occupants.length
      ? ` — ${occupants.length} creature${occupants.length === 1 ? '' : 's'} in the area`
      : '';
    appendLog?.({
      type: 'action',
      text: `${ability?.name || 'Area'} placed (${areaLabel(area)})${caught}`,
    });
  }, [
    hasArea, originWorld, canTemplate, placeTemplate, canPing, ping,
    snapshot, occupants, appendLog, ability, area,
  ]);

  // Nothing to show for a spell with no area. #1751 OQ-6: the emanation
  // occupant list and the area label are pure `positions` + parsed-area
  // math and need no capture, so `hasArea` alone gates the section — only
  // the capture/placement UI below (the button, the snapshot viewer) gates
  // on `available`. A bridge-less client still gets the full section for a
  // spell that doesn't need placement.
  const section = !hasArea ? null : (
    <>
      <hr className="ct-divider" />
      <section className="ct-section" data-testid="area-placement-section">
        <h3 className="ct-section-title">Area — {areaLabel(area)}</h3>

        {!needsPlacement && (
          <div className="uam-variant-note">
            Centred on you — no placement needed.
          </div>
        )}

        {needsPlacement && !available && (
          <div className="uam-variant-note" role="status">
            No live map available — cast without placing, or let the GM judge
            who's caught.
          </div>
        )}

        {needsPlacement && available && !snapshot && (
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

        {available && snapshot && (
          <>
            <MapSnapshotViewer
              src={snapshot.url}
              marker={marker}
              onPick={(point) => { setMarker(point); setAdopted(false); }}
            />
            {!computesOccupancy && marker && (
              <div className="uam-variant-note">
                A {area.shape} needs a facing, so the GM calls who is caught — your
                mark pings the map on confirm.
              </div>
            )}
          </>
        )}

        {computesOccupancy && (needsPlacement ? !!placedIntersection : true) && (
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
            disabled={adopted}
          >
            {adopted
              ? 'Targets set ✓'
              : `Target these ${occupants.length}`}
          </button>
        )}
      </section>
    </>
  );

  return { section, applyOnConfirm, hasArea };
};

export default useTemplatePlacementSection;
