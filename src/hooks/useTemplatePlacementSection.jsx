import React, { useCallback, useMemo, useState } from 'react';
import MapSnapshotViewer from '../components/encounter/MapSnapshotViewer';
import { useSceneSnapshot } from './useSceneSnapshot';
import { useEncounter } from './useEncounter';
import { worldPointFromTap, cellFromWorldPoint } from '../utils/snapshotGeometry';
import {
  parseSpellArea, areaNeedsPlacement, areaComputesOccupancy, areaOccupants, areaLabel,
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
  const { request, requesting, available, canPing, ping } = useSceneSnapshot();
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

  // The tapped point in world space, then in the bridge's { col, row }.
  const placedWorld = useMemo(
    () => (marker ? worldPointFromTap(snapshot, marker.nx, marker.ny) : null),
    [snapshot, marker]
  );
  const placedCell = useMemo(
    () => cellFromWorldPoint(placedWorld, snapshot?.gridSize),
    [placedWorld, snapshot]
  );

  // An emanation is centred on the caster, so its occupants are known without
  // any tap; a burst needs the placed cell first.
  const occupants = useMemo(() => {
    if (!computesOccupancy) return [];
    if (needsPlacement && !placedCell) return [];
    return areaOccupants(area, {
      originCell: placedCell,
      positions,
      casterEntryId,
      order,
    });
  }, [area, computesOccupancy, needsPlacement, placedCell, positions, casterEntryId, order]);

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

  // Confirm slice: ping where the area landed so the table sees it, and record
  // the placement in the combat log. B4 upgrades the ping to a real
  // MeasuredTemplate; the log line is useful either way.
  const applyOnConfirm = useCallback(() => {
    if (!hasArea || !placedWorld) return;
    if (canPing) {
      ping({ x: placedWorld.x, y: placedWorld.y, sceneId: snapshot?.capture?.sceneId });
    }
    const caught = occupants.length
      ? ` — ${occupants.length} creature${occupants.length === 1 ? '' : 's'} in the area`
      : '';
    appendLog?.({
      type: 'action',
      text: `${ability?.name || 'Area'} placed (${areaLabel(area)})${caught}`,
    });
  }, [hasArea, placedWorld, canPing, ping, snapshot, occupants, appendLog, ability, area]);

  // Nothing to show for a spell with no area, or when the bridge can't capture.
  const section = (!hasArea || !available) ? null : (
    <>
      <hr className="ct-divider" />
      <section className="ct-section" data-testid="area-placement-section">
        <h3 className="ct-section-title">Area — {areaLabel(area)}</h3>

        {!needsPlacement && (
          <div className="uam-variant-note">
            Centred on you — no placement needed.
          </div>
        )}

        {needsPlacement && !snapshot && (
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

        {snapshot && (
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

        {computesOccupancy && (needsPlacement ? !!placedCell : true) && (
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
