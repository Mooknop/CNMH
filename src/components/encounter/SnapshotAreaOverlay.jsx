import React from 'react';
import { normalizedFromWorld, cellPolygonOnSnapshot } from '../../utils/snapshotGeometry';
import './SnapshotAreaOverlay.css';

// Area-spell shape preview drawn ON the snapshot (#1751 S2) — the sibling
// `SnapshotAreaOverlay` the epic's design sketch (§B) asks for: same %-space
// SVG mounted through `MapSnapshotViewer`'s `overlay` prop, inside
// `.msv-pane`, so it inherits pan/zoom for free exactly like
// `SnapshotRouteOverlay`. Everything here is pure geometry over the
// snapshot's forward transform (`normalizedFromWorld`) — no hooks, no relay.
//
// Draws, deliberately:
//   1. The shape OUTLINE — what the player is about to commit to:
//        burst      a true circle of `feet` radius centred on the snapped
//                   grid INTERSECTION (#1751 OQ-1) — this is also exactly
//                   what Foundry's Region will draw (`createMeasuredTemplate`
//                   uses the same pixel-radius formula from the same point).
//        emanation  a ROUNDED-RECTANGLE ring: the caster's occupied
//                   rectangle (token-size-aware, OQ-1) expanded outward by
//                   `feet` — straight edges offset by the radius, quarter-
//                   circle arcs at the four corners. This is the Minkowski
//                   sum of the rectangle and a disk of that radius, and it
//                   is the TRUE boundary `areaOccupants`'s `feetFromRectToCell`
//                   measures against (nearest edge of the rectangle, not its
//                   center point) — for ANY caster size, not just non-1x1
//                   ones. It deliberately does NOT match the plain circle
//                   Foundry's Region actually draws for an emanation
//                   (`createMeasuredTemplate` always draws a circle, centred
//                   on `casterRectCenterWorld` — the rectangle's CENTER, no
//                   rounded-rect complexity at all). Surfacing that exact
//                   divergence — the canvas's circle vs. the app's true
//                   occupancy boundary — is the point of this overlay; see
//                   the epic's design sketch §B ("the disagreement is not a
//                   bug to hide").
//        cone/line  NOT computed here (#1735's geometry) — only a DIRECTION
//                   INDICATOR (an arrow) once a rosette pick exists, never
//                   cone/line cell occupancy.
//   2. The counted CELLS — every cell `areaOccupants` actually included
//      (shaded), so the player sees exactly what the occupant list below
//      the map is describing.
//   3. An optional LATTICE (`showLattice`), identical trick to
//      `SnapshotRouteOverlay`'s.
//
// Props:
//   snapshot       the snapdone payload ({ capture, worldRect, gridSize })
//   shape          'burst' | 'emanation' | 'cone' | 'line'
//   feet           the area's reach in feet
//   origin         world {x,y} — the snapped grid intersection a burst/
//                  cone/line originates from; null for emanation
//   casterRect     {col,row,width,height} — the emanation origin; null
//                  otherwise
//   direction      { dc, dr } unit-ish offset (from DirectionRosette, #1751
//                  S5) — draws the cone/line facing arrow when present;
//                  ignored for burst/emanation
//   occupantCells  [{col,row}, …] — cells to shade (from `areaOccupants`,
//                  mapped back to their `positions` cell)
//   showLattice    boolean
//   feetPerSquare  scene scale (PF2e default 5), matching `spellArea.js`

const CIRCLE_SEGMENTS = 48;
const CORNER_SEGMENTS = 12;

const worldToNorm = (world, snapshot) => {
  const n = normalizedFromWorld(world, snapshot);
  return n ? { x: n.nx * 100, y: n.ny * 100 } : null;
};

const toAttr = (points) => points.map((p) => `${p.x},${p.y}`).join(' ');

const circleWorldPoints = (center, radiusPx) => {
  const pts = [];
  for (let i = 0; i < CIRCLE_SEGMENTS; i += 1) {
    const t = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
    pts.push({ x: center.x + radiusPx * Math.cos(t), y: center.y + radiusPx * Math.sin(t) });
  }
  return pts;
};

// The Minkowski-expanded rectangle boundary — see the doc comment above.
// Consecutive corner arcs' start/end points already fall exactly on the
// straight edges, so simply connecting all the sampled points in order
// reproduces the straight edges too — no separate edge-segment code needed.
const roundedRectWorldPoints = (rect, gridSize, radiusPx) => {
  const left = rect.col * gridSize;
  const top = rect.row * gridSize;
  const right = (rect.col + rect.width) * gridSize;
  const bottom = (rect.row + rect.height) * gridSize;
  const corners = [
    { cx: right, cy: top, start: -Math.PI / 2, end: 0 },
    { cx: right, cy: bottom, start: 0, end: Math.PI / 2 },
    { cx: left, cy: bottom, start: Math.PI / 2, end: Math.PI },
    { cx: left, cy: top, start: Math.PI, end: 1.5 * Math.PI },
  ];
  const pts = [];
  corners.forEach((c) => {
    for (let i = 0; i <= CORNER_SEGMENTS; i += 1) {
      const t = c.start + (c.end - c.start) * (i / CORNER_SEGMENTS);
      pts.push({ x: c.cx + radiusPx * Math.cos(t), y: c.cy + radiusPx * Math.sin(t) });
    }
  });
  return pts;
};

// A direction HINT for cone/line (#1751 S5) — an arrow of fixed visual
// length from the origin toward the rosette's chosen compass point.
// Deliberately NOT scaled by `feet`: this is not the spell's reach, only a
// facing indicator, so it must never look like measured cone/line geometry
// (that's #1735's `coneCells`/`lineCells`, not built here).
const ARROW_LENGTH_SQUARES = 1.5;
const ARROW_HEAD_SQUARES = 0.4;
const ARROW_WIDTH_SQUARES = 0.28;

const directionArrowWorldPoints = (origin, direction, gridSize) => {
  const mag = Math.hypot(direction.dc, direction.dr) || 1;
  const ux = direction.dc / mag;
  const uy = direction.dr / mag;
  const len = gridSize * ARROW_LENGTH_SQUARES;
  const headLen = gridSize * ARROW_HEAD_SQUARES;
  const headWidth = gridSize * ARROW_WIDTH_SQUARES;
  const tip = { x: origin.x + ux * len, y: origin.y + uy * len };
  const shaftEnd = { x: origin.x + ux * (len - headLen), y: origin.y + uy * (len - headLen) };
  const px = -uy;
  const py = ux;
  const left = { x: shaftEnd.x + px * headWidth, y: shaftEnd.y + py * headWidth };
  const right = { x: shaftEnd.x - px * headWidth, y: shaftEnd.y - py * headWidth };
  return { shaftEnd, tip, left, right };
};

const buildLattice = (snapshot) => {
  const size = Number(snapshot?.gridSize);
  const rect = snapshot?.worldRect;
  if (!Number.isFinite(size) || size <= 0 || !rect) return [];

  const xMin = Math.min(rect.x1, rect.x2);
  const xMax = Math.max(rect.x1, rect.x2);
  const yMin = Math.min(rect.y1, rect.y2);
  const yMax = Math.max(rect.y1, rect.y2);
  const colStart = Math.floor(xMin / size);
  const colEnd = Math.ceil(xMax / size);
  const rowStart = Math.floor(yMin / size);
  const rowEnd = Math.ceil(yMax / size);

  const lines = [];
  for (let c = colStart; c <= colEnd; c += 1) {
    const top = worldToNorm({ x: c * size, y: yMin }, snapshot);
    const bottom = worldToNorm({ x: c * size, y: yMax }, snapshot);
    if (top && bottom) lines.push({ x1: top.x, y1: top.y, x2: bottom.x, y2: bottom.y });
  }
  for (let r = rowStart; r <= rowEnd; r += 1) {
    const left = worldToNorm({ x: xMin, y: r * size }, snapshot);
    const right = worldToNorm({ x: xMax, y: r * size }, snapshot);
    if (left && right) lines.push({ x1: left.x, y1: left.y, x2: right.x, y2: right.y });
  }
  return lines;
};

const SnapshotAreaOverlay = ({
  snapshot,
  shape,
  feet,
  origin = null,
  casterRect = null,
  direction = null,
  occupantCells = [],
  showLattice = false,
  feetPerSquare = 5,
}) => {
  const gridSize = Number(snapshot?.gridSize);
  if (!snapshot || !Number.isFinite(gridSize) || gridSize <= 0) return null;

  const radiusPx = Number.isFinite(feet) && feet > 0 ? (feet / feetPerSquare) * gridSize : 0;

  let outlinePoints = null;
  if (shape === 'burst' && origin && radiusPx > 0) {
    outlinePoints = circleWorldPoints(origin, radiusPx);
  } else if (shape === 'emanation' && casterRect && radiusPx > 0) {
    outlinePoints = roundedRectWorldPoints(casterRect, gridSize, radiusPx);
  }
  const outlineAttr = outlinePoints
    ? toAttr(outlinePoints.map((p) => worldToNorm(p, snapshot)).filter(Boolean))
    : null;

  const arrow = (shape === 'cone' || shape === 'line') && origin && direction
    ? directionArrowWorldPoints(origin, direction, gridSize)
    : null;
  const arrowShaftStart = arrow ? worldToNorm(origin, snapshot) : null;
  const arrowShaftEnd = arrow ? worldToNorm(arrow.shaftEnd, snapshot) : null;
  const arrowHead = arrow
    ? [arrow.tip, arrow.left, arrow.right].map((p) => worldToNorm(p, snapshot)).filter(Boolean)
    : null;

  const cellPolygons = occupantCells
    .map((cell) => cellPolygonOnSnapshot(cell.col, cell.row, snapshot))
    .filter(Boolean)
    .map((polygon) => polygon.map((p) => ({ x: p.nx * 100, y: p.ny * 100 })));

  const lattice = showLattice ? buildLattice(snapshot) : [];

  return (
    <svg
      className={`sao sao--${shape}`}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {lattice.map((line, i) => (
        <line key={`lattice-${i}`} className="sao-lattice" x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
      ))}
      {cellPolygons.map((polygon, i) => (
        <polygon key={`cell-${i}`} className="sao-cell" points={toAttr(polygon)} />
      ))}
      {outlineAttr && (
        <polygon className="sao-outline" points={outlineAttr} />
      )}
      {arrow && arrowShaftStart && arrowShaftEnd && (
        <line
          className="sao-direction-shaft"
          x1={arrowShaftStart.x} y1={arrowShaftStart.y}
          x2={arrowShaftEnd.x} y2={arrowShaftEnd.y}
        />
      )}
      {arrow && arrowHead && arrowHead.length === 3 && (
        <polygon className="sao-direction-head" points={toAttr(arrowHead)} />
      )}
    </svg>
  );
};

export default SnapshotAreaOverlay;
