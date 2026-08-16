// Tap → marker hit test (#1749 OQ-1 ruling: "marker-snapping + framing cap
// adopted... tolerance unit: nearest marker within a CSS-px radius (slice
// picks the constant)"). Pure geometry — no React, no relay — so a tap
// resolves against whatever `buildTokenMarkers` (src/utils/tokenMarkers.js)
// produced, decoupled from how that list was built.
//
// Two passes, in order:
//   1. DIRECT HIT — the tap point lands inside a marker's footprint polygon.
//      Always wins outright, regardless of tolerance: a multi-square token's
//      footprint IS its tappable area, per OQ-1's whole argument for
//      snapping over cell-equality (a 2x2 ogre's centre must resolve to the
//      ogre, not to "nothing" or whatever square it happens to floor onto).
//   2. NEAREST-WITHIN-TOLERANCE — no direct hit: the marker whose CENTER is
//      closest to the tap, in CSS px, and no farther than `toleranceCssPx`.
//      Tolerance is a screen-space (finger) unit, not a normalized/grid one
//      (OQ-1: "CSS px is the honest unit for a finger"), so converting it
//      needs the rendered pane's on-screen size — pass it in, this module
//      has no DOM access of its own.
//
// Ambiguity (two markers within tolerance): the nearest wins. On an EXACT
// distance tie, the earlier marker in the input `markers` array wins — a
// stable, order-dependent tie-break. Callers that care about which of two
// equidistant markers wins a tie should order `markers` deterministically
// (e.g. by initiative/entryId), same expectation `usePathPreview` places on
// its own per-tokenId map.

// Half of the ~44-48 CSS px minimum comfortable touch target (WCAG 2.5.5 /
// Material Design) used as a snap RADIUS rather than a target width: two
// markers each still get their own snap zone as long as their centers are at
// least a touch-target's width apart, which is the common case for anything
// but a tightly-packed pile of tokens (already covered by the direct-hit
// pass above).
export const DEFAULT_HIT_TOLERANCE_PX = 24;

// Ray-casting point-in-polygon (even-odd rule). Works for any simple polygon
// — footprintCorners always returns a convex quad (an affine-transformed
// rectangle), but this doesn't assume convexity.
const pointInPolygon = ({ nx, ny }, polygon) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].nx;
    const yi = polygon[i].ny;
    const xj = polygon[j].nx;
    const yj = polygon[j].ny;
    const intersects = (yi > ny) !== (yj > ny) &&
      nx < ((xj - xi) * (ny - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
};

// Euclidean distance between a normalized tap and a normalized marker
// center, converted to CSS px via the rendered pane's on-screen size.
const distanceCssPx = (tap, center, paneWidthPx, paneHeightPx) => {
  const dx = (tap.nx - center.nx) * paneWidthPx;
  const dy = (tap.ny - center.ny) * paneHeightPx;
  return Math.hypot(dx, dy);
};

// Stable "smallest distance wins, first-seen wins ties" reduction shared by
// both passes.
const nearest = (candidates) =>
  candidates.reduce(
    (best, cur) => (best === null || cur.distancePx < best.distancePx ? cur : best),
    null
  );

/**
 * Resolve a normalized tap to the marker it hit, or null.
 *
 * @param {{nx:number, ny:number}} tap - normalized tap position (0..1), the
 *   same shape `MapSnapshotViewer.onPick` reports
 * @param {Array} markers - `buildTokenMarkers` output: [{entryId, center:{nx,ny}, footprint, ...}]
 * @param {Object} [opts]
 * @param {number} [opts.toleranceCssPx] - snap radius in CSS px (default DEFAULT_HIT_TOLERANCE_PX)
 * @param {number} [opts.paneWidthPx] - the rendered pane's on-screen width, CSS px
 * @param {number} [opts.paneHeightPx] - the rendered pane's on-screen height, CSS px
 * @returns {Object|null} the hit marker, or null
 */
export function hitTestMarkers(
  tap,
  markers,
  { toleranceCssPx = DEFAULT_HIT_TOLERANCE_PX, paneWidthPx, paneHeightPx } = {}
) {
  if (!tap || !Number.isFinite(tap.nx) || !Number.isFinite(tap.ny)) return null;
  if (!Array.isArray(markers) || markers.length === 0) return null;

  // Pass 1: direct hits inside a footprint — a hit here needs no pane size
  // at all, since polygon containment is entirely in normalized space.
  const direct = markers.filter((m) => m.footprint && pointInPolygon(tap, m.footprint));
  if (direct.length > 0) {
    if (direct.length === 1) return direct[0];
    // Overlapping footprints (rare — stacked tokens): fall through to
    // nearest-center-wins if a pane size is available, else the first hit.
    if (!(paneWidthPx > 0 && paneHeightPx > 0)) return direct[0];
    const scored = direct
      .filter((m) => m.center)
      .map((m) => ({ marker: m, distancePx: distanceCssPx(tap, m.center, paneWidthPx, paneHeightPx) }));
    return (nearest(scored) ?? { marker: direct[0] }).marker;
  }

  // Pass 2: nearest marker center within tolerance. Needs the pane's
  // on-screen size to convert the px tolerance against normalized centers.
  if (!(paneWidthPx > 0 && paneHeightPx > 0)) return null;
  const withinTolerance = markers
    .filter((m) => m.center)
    .map((m) => ({ marker: m, distancePx: distanceCssPx(tap, m.center, paneWidthPx, paneHeightPx) }))
    .filter((m) => m.distancePx <= toleranceCssPx);
  const winner = nearest(withinTolerance);
  return winner ? winner.marker : null;
}

export default hitTestMarkers;
