import React from 'react';
import { normalizedFromWorld, cellPolygonOnSnapshot } from '../../utils/snapshotGeometry';
import './SnapshotRouteOverlay.css';

// Route ghost drawn ON the snapshot (#1744 S2). Pure presentational SVG in
// percentage/viewBox space — mounted as MapSnapshotViewer's `overlay` prop,
// inside `.msv-pane`, so it inherits the existing pan/zoom transform for
// free (the same trick `.msv-pin` already uses with left/top percentages).
// Zero re-render math on resize or zoom: every point here is a %, computed
// once from the snapshot's forward geometry.
//
// Serves BOTH ghost kinds the epic describes — the viewer's own in-progress
// plan ("your route") and another mover's in-flight `pathpreview` ("their
// route", #1744 S3/WS-4, a later wave) — distinguished only by the
// `variant` class, never by different geometry code.
//
// Props:
//   snapshot     the snapdone payload ({ capture, worldRect, gridSize })
//   cells        [{ col, row }, …]  the route past the origin (moveplanned's
//                `path`, or a pathpreview payload's `path`)
//   origin       { col, row } | null — the mover's current cell; drawn as a
//                highlighted square AND the route line's starting point
//   destination  { col, row } | null — the route's landing cell, highlighted
//                distinctly; defaults to the last entry in `cells`
//   showLattice  boolean — draw a light grid over the captured region (OQ-3
//                precision aid), bounded by `snapshot.worldRect`
//   variant      'own' | 'ghost' — 'own' is the viewer's in-progress plan;
//                'ghost' (S3/WS-4) is someone else's in-flight move
const cellCenter = (cell, snapshot) => {
  const size = Number(snapshot?.gridSize);
  if (!cell || !Number.isFinite(size) || size <= 0) return null;
  return normalizedFromWorld({ x: (cell.col + 0.5) * size, y: (cell.row + 0.5) * size }, snapshot);
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
    const top = normalizedFromWorld({ x: c * size, y: yMin }, snapshot);
    const bottom = normalizedFromWorld({ x: c * size, y: yMax }, snapshot);
    if (top && bottom) lines.push({ x1: top.nx * 100, y1: top.ny * 100, x2: bottom.nx * 100, y2: bottom.ny * 100 });
  }
  for (let r = rowStart; r <= rowEnd; r += 1) {
    const left = normalizedFromWorld({ x: xMin, y: r * size }, snapshot);
    const right = normalizedFromWorld({ x: xMax, y: r * size }, snapshot);
    if (left && right) lines.push({ x1: left.nx * 100, y1: left.ny * 100, x2: right.nx * 100, y2: right.ny * 100 });
  }
  return lines;
};

const toPoints = (polygon) => polygon.map((p) => `${p.nx * 100},${p.ny * 100}`).join(' ');

const SnapshotRouteOverlay = ({
  snapshot,
  cells = [],
  origin = null,
  destination = null,
  showLattice = false,
  variant = 'own',
}) => {
  if (!snapshot) return null;

  const routeCells = [origin, ...(cells || [])].filter(Boolean);
  const routePoints = routeCells.map((c) => cellCenter(c, snapshot)).filter(Boolean);

  const destCell = destination ?? (cells && cells.length ? cells[cells.length - 1] : null);
  const destPolygon = destCell ? cellPolygonOnSnapshot(destCell.col, destCell.row, snapshot) : null;
  const originPolygon = origin ? cellPolygonOnSnapshot(origin.col, origin.row, snapshot) : null;

  const lattice = showLattice ? buildLattice(snapshot) : [];

  return (
    <svg
      className={`sro sro--${variant}`}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {lattice.map((line, i) => (
        <line key={`lattice-${i}`} className="sro-lattice" x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
      ))}
      {originPolygon && (
        <polygon className="sro-origin" points={toPoints(originPolygon)} />
      )}
      {routePoints.length > 1 && (
        <polyline className="sro-line" points={routePoints.map((p) => `${p.nx * 100},${p.ny * 100}`).join(' ')} />
      )}
      {destPolygon && (
        <polygon className="sro-dest" points={toPoints(destPolygon)} />
      )}
    </svg>
  );
};

export default SnapshotRouteOverlay;
