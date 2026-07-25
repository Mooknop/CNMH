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
