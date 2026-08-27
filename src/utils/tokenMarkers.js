// Token markers on a scene snapshot (#1749 epic, wave 1 foundations) — the
// shared derivation both `TokenMarkersOverlay` (rendering) and the tap
// hit-test (src/utils/markerHitTest.js) build on, so "where is this marker"
// has exactly one answer.
//
// Joins the bridge's `positions` payload (`cnmh_positions_global`,
// { gridSize, positions: { [entryId]: {col,row,width?,height?,hidden?} } })
// against the live encounter `order` for name/kind/disposition, then
// projects each token's footprint onto the snapshot with the same forward
// geometry `SnapshotRouteOverlay` uses (`normalizedFromWorld`,
// `src/utils/snapshotGeometry.js`).
//
// `width`/`height` and `hidden` are the fields #1749's OQ-1/OQ-5 rulings add
// to `positions` (protocol MAP_TARGET_PROTOCOL, shared bump with #1751) —
// read shape-tolerantly here so an older bridge (or a `positions` payload
// recorded before the bump) degrades to a 1x1 visible footprint instead of
// throwing: missing/invalid width or height → 1, missing hidden → false.
//
// Hidden filtering here is DEFENSE IN DEPTH, not the primary control: the
// bridge (S2, a sibling slice) is expected to drop hidden combatants from
// `positions` before they ever reach the wire, mirroring #1746's pathpreview
// filter. This still checks both `pos.hidden` and the joined order entry's
// `hidden` so a partially-rolled-out bridge, or a `positions` payload that
// out-races an `encounter` update, never draws a marker for a creature the
// snapshot image itself omits (`captureSceneSnapshot` already excludes
// hidden tokens from the picture — a marker on top would be a location leak
// worse than the name-in-a-list the chip list used to be).
import { normalizedFromWorld, cellFromWorldPoint, cellPolygonOnSnapshot } from './snapshotGeometry';

const positiveInt = (value, fallback) =>
  Number.isInteger(value) && value >= 1 ? value : fallback;

// A rectangular footprint's four corners in normalized snapshot space —
// `cellPolygonOnSnapshot`'s multi-cell generalization (col/row spanning
// `width`x`height` cells instead of exactly one), same corner order
// (top-left, top-right, bottom-right, bottom-left) and the same "null when
// the geometry can't be computed" contract.
export function footprintCorners(col, row, width, height, snapshot) {
  const size = Number(snapshot?.gridSize);
  if (!Number.isFinite(size) || size <= 0) return null;
  const corners = [
    { x: col * size, y: row * size },
    { x: (col + width) * size, y: row * size },
    { x: (col + width) * size, y: (row + height) * size },
    { x: col * size, y: (row + height) * size },
  ];
  const polygon = corners.map((c) => normalizedFromWorld(c, snapshot));
  return polygon.every(Boolean) ? polygon : null;
}

// Same classification DockOrderStrip/GmCommandDock already use for the
// initiative strip's kind styling — an "ally" is an enemy-kind entry with
// FRIENDLY disposition (CONST.TOKEN_DISPOSITIONS.FRIENDLY = 1); everything
// else enemy-kind is tinted hostile regardless of NEUTRAL/SECRET nuance.
export function tintFor(entry) {
  if (!entry) return null;
  if (entry.kind === 'summon') return 'summon';
  if (entry.kind === 'enemy') return entry.disposition === 1 ? 'ally' : 'enemy';
  return 'pc';
}

const findOrderEntry = (order, entryId) => (order || []).find((e) => e.entryId === entryId) || null;

/**
 * Build the marker list a snapshot overlay draws and a tap hit-tests against.
 *
 * @param {Object} params
 * @param {{gridSize:number, positions:Object}|null} params.positions - the raw `cnmh_positions_global` payload
 * @param {Array} params.order - encounter.order entries [{entryId,kind,name,disposition?,hidden?}]
 * @param {Object} params.snapshot - the snapdone payload ({capture, worldRect, gridSize})
 * @returns {Array<{entryId,name,kind,disposition,tint,col,row,width,height,center:{nx,ny}|null,footprint:Array|null}>}
 */
export function buildTokenMarkers({ positions, order, snapshot } = {}) {
  const posMap = positions?.positions;
  if (!posMap || !snapshot) return [];

  const markers = [];
  for (const [entryId, pos] of Object.entries(posMap)) {
    if (!pos || pos.hidden) continue;
    const entry = findOrderEntry(order, entryId);
    if (entry?.hidden) continue;

    const width = positiveInt(pos.width, 1);
    const height = positiveInt(pos.height, 1);
    const footprint = footprintCorners(pos.col, pos.row, width, height, snapshot);
    const center = footprint
      ? normalizedFromWorld(
          {
            x: (pos.col + width / 2) * Number(snapshot.gridSize),
            y: (pos.row + height / 2) * Number(snapshot.gridSize),
          },
          snapshot
        )
      : null;
    if (!footprint || !center) continue; // ungeometrizable (no usable gridSize) — nothing to draw or hit-test

    markers.push({
      entryId,
      name: entry?.name ?? null,
      kind: entry?.kind ?? null,
      disposition: entry?.disposition ?? null,
      tint: tintFor(entry),
      col: pos.col,
      row: pos.row,
      width,
      height,
      center,
      footprint,
    });
  }
  return markers;
}

/**
 * Markers for the PARTY-framed capture's `tokens[]` (#1808, epic #1804 S4).
 *
 * The party ack is a different join from `buildTokenMarkers` above: it carries
 * WORLD-SPACE token centres (`[{ moverId, x, y }]`) straight off the wire —
 * not grid cells out of `positions` keyed by combat entryId — because
 * exploration has no encounter and therefore no order to join against. The
 * roster is the join target instead, so a marker can wear the PC's real name
 * and accent colour.
 *
 * Output is intentionally the SAME shape `hitTestMarkers`
 * (src/utils/markerHitTest.js) consumes — `center` + `footprint` — so the GM's
 * tap resolves against exactly the geometry the overlay drew, the same "one
 * source of truth for where a marker is" contract `buildTokenMarkers` keeps.
 * The footprint is the token's own grid cell (1x1: the party ack carries no
 * token size, and every PC in this campaign is Medium or smaller), which makes
 * a tap ON a PC a direct hit and every other tap a destination.
 *
 * @param {Object} params
 * @param {Array<{moverId:string,x:number,y:number}>} params.tokens - the ack's `tokens`
 * @param {Object} params.snapshot - the snapdone payload ({capture, worldRect, gridSize})
 * @param {Array} [params.characters] - roster docs, for name + accent-index lookup
 * @param {(charId:string, index:number) => string|null} [params.accentFor] - per-PC accent
 * @returns {Array<{moverId,charId,name,accent,world,cell,center,footprint}>}
 */
export function buildPartyMarkers({ tokens, snapshot, characters = [], accentFor = null } = {}) {
  if (!Array.isArray(tokens) || !snapshot) return [];
  const roster = Array.isArray(characters) ? characters : [];

  const markers = [];
  for (const token of tokens) {
    const moverId = token?.moverId;
    const x = Number(token?.x);
    const y = Number(token?.y);
    if (!moverId || !Number.isFinite(x) || !Number.isFinite(y)) continue;

    const center = normalizedFromWorld({ x, y }, snapshot);
    const cell = cellFromWorldPoint({ x, y }, snapshot.gridSize);
    if (!center || !cell) continue; // ungeometrizable — nothing to draw or hit-test

    // `moverId` is whatever the bridge resolves a mover by (resolveMoverId,
    // foundry-bridge/movement.js) — for an actor-mapped PC that IS the roster
    // charId, which is what makes this join a plain id match.
    const index = roster.findIndex((c) => c.id === moverId);
    const character = index >= 0 ? roster[index] : null;

    markers.push({
      moverId,
      charId: character?.id ?? null,
      name: character?.name ?? moverId,
      accent: accentFor ? accentFor(moverId, index) : null,
      world: { x, y },
      cell,
      center,
      footprint: cellPolygonOnSnapshot(cell.col, cell.row, snapshot),
    });
  }
  return markers;
}

export default buildTokenMarkers;
