// Snapshot tap → world coordinates (#1573 B2).
//
// The bridge captures the Foundry stage's worldTransform alongside the image:
// an affine matrix mapping WORLD → SCREEN pixels at capture time.
//
//   sx = a·wx + c·wy + tx
//   sy = b·wx + d·wy + ty
//
// A tap on the rendered image gives normalized (nx, ny) in [0,1] — resolution
// independent, so the app can display the snapshot at any size. Multiply by the
// captured screen dimensions to recover capture-space pixels, then apply the
// INVERSE matrix to land back in world coordinates, which is what the canvas
// (and `pingpoint`) speaks.
//
// `worldRect` is the fallback when the matrix is missing or singular (a
// degenerate transform can't be inverted): a plain linear interpolation across
// the viewport rectangle. Less exact under rotation, but a sane "around here".

// Invert the affine transform for one point. Returns null when the matrix is
// absent or non-invertible, so callers can fall back.
const worldFromMatrix = (capture, sx, sy) => {
  if (!capture) return null;
  const { a = 1, b = 0, c = 0, d = 1, tx = 0, ty = 0 } = capture;
  const det = a * d - b * c;
  if (!Number.isFinite(det) || det === 0) return null;
  const px = sx - tx;
  const py = sy - ty;
  return {
    x: (d * px - c * py) / det,
    y: (a * py - b * px) / det,
  };
};

const worldFromRect = (worldRect, nx, ny) => {
  const { x1 = 0, y1 = 0, x2 = 0, y2 = 0 } = worldRect || {};
  return { x: x1 + (x2 - x1) * nx, y: y1 + (y2 - y1) * ny };
};

/**
 * World coordinates for a normalized tap on a snapshot.
 *
 * @param {Object} snapshot  the snapdone payload ({ capture, worldRect })
 * @param {number} nx        horizontal tap position, 0..1 (clamped)
 * @param {number} ny        vertical tap position, 0..1 (clamped)
 * @returns {{x:number,y:number}|null} world point, or null without usable data
 */
export function worldPointFromTap(snapshot, nx, ny) {
  if (!snapshot) return null;
  const clampedX = Math.min(1, Math.max(0, Number(nx)));
  const clampedY = Math.min(1, Math.max(0, Number(ny)));
  if (!Number.isFinite(clampedX) || !Number.isFinite(clampedY)) return null;

  const { capture, worldRect } = snapshot;
  const screenW = Number(capture?.screenW);
  const screenH = Number(capture?.screenH);
  if (capture && screenW > 0 && screenH > 0) {
    const world = worldFromMatrix(capture, clampedX * screenW, clampedY * screenH);
    if (world) return world;
  }
  if (worldRect) return worldFromRect(worldRect, clampedX, clampedY);
  return null;
}

/**
 * Grid cell containing a world point — the bridge's `{ col, row }` vocabulary
 * (shared with moveopts / positions), for occupancy math in B3.
 */
export function cellFromWorldPoint(world, gridSize) {
  const size = Number(gridSize);
  if (!world || !Number.isFinite(size) || size <= 0) return null;
  return { col: Math.floor(world.x / size), row: Math.floor(world.y / size) };
}

// --- Forward direction (#1744 S2): world → snapshot -------------------------
//
// Drawing something ON the snapshot (a route ghost, a cell highlight) needs
// the opposite trip from worldPointFromTap: WORLD → normalized (nx, ny).
// Affine maps preserve straight lines and ratios exactly (no inversion
// needed — that's only required to go the other way), so this is just the
// forward matrix multiplication, with the same worldRect fallback for a
// missing/unusable capture. Deliberately NOT clamped to [0,1] — a route can
// legitimately run past the captured frame, and the caller (an SVG overlay
// inside `.msv-frame`, which clips) decides what to do with an off-frame
// point rather than having it silently snapped to an edge.

const screenFromMatrix = (capture, wx, wy) => {
  if (!capture) return null;
  const { a = 1, b = 0, c = 0, d = 1, tx = 0, ty = 0 } = capture;
  return { sx: a * wx + c * wy + tx, sy: b * wx + d * wy + ty };
};

const normalizedFromRect = (worldRect, wx, wy) => {
  const { x1 = 0, y1 = 0, x2 = 0, y2 = 0 } = worldRect || {};
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (!dx || !dy) return null; // degenerate rect — nothing sane to divide by
  return { nx: (wx - x1) / dx, ny: (wy - y1) / dy };
};

/**
 * Normalized snapshot position for a world point — the inverse of
 * `worldPointFromTap`'s math.
 *
 * @param {{x:number,y:number}} world  a world-space point
 * @param {Object} snapshot            the snapdone payload ({ capture, worldRect })
 * @returns {{nx:number,ny:number}|null}
 */
export function normalizedFromWorld(world, snapshot) {
  if (!world || !snapshot) return null;
  const wx = Number(world.x);
  const wy = Number(world.y);
  if (!Number.isFinite(wx) || !Number.isFinite(wy)) return null;

  const { capture, worldRect } = snapshot;
  const screenW = Number(capture?.screenW);
  const screenH = Number(capture?.screenH);
  if (capture && screenW > 0 && screenH > 0) {
    const screen = screenFromMatrix(capture, wx, wy);
    if (screen) return { nx: screen.sx / screenW, ny: screen.sy / screenH };
  }
  if (worldRect) return normalizedFromRect(worldRect, wx, wy);
  return null;
}

/**
 * A grid cell's four corners, in normalized snapshot space — for drawing a
 * cell outline (the planned destination, the mover's own square) on top of
 * the image. Corners are returned in order (top-left, top-right, bottom-right,
 * bottom-left), matching the `col*size .. (col+1)*size` convention
 * `cellFromWorldPoint` addresses a cell by (it floors — a cell's world span is
 * `[col*size, (col+1)*size)`).
 *
 * @param {number} col
 * @param {number} row
 * @param {Object} snapshot  the snapdone payload ({ capture, worldRect, gridSize })
 * @returns {Array<{nx:number,ny:number}>|null}  4 corners, or null without a usable grid size
 */
export function cellPolygonOnSnapshot(col, row, snapshot) {
  const size = Number(snapshot?.gridSize);
  if (!Number.isFinite(size) || size <= 0) return null;
  const corners = [
    { x: col * size, y: row * size },
    { x: (col + 1) * size, y: row * size },
    { x: (col + 1) * size, y: (row + 1) * size },
    { x: col * size, y: (row + 1) * size },
  ];
  const polygon = corners.map((corner) => normalizedFromWorld(corner, snapshot));
  return polygon.every(Boolean) ? polygon : null;
}
