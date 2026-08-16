import React from 'react';
import { isoDistancePolygon } from '../../utils/rangeBands';
import './RangeBandsOverlay.css';

// Range increments and reach, drawn on the snapshot (#1749 S5) — a third
// `SnapshotRouteOverlay`/`TokenMarkersOverlay` sibling: the same %-space SVG
// mounted through `MapSnapshotViewer`'s `overlay` prop, inside `.msv-pane`,
// inheriting pan/zoom for free.
//
// Every number here was already computed and already displayed as text: the
// increments are `MAX_RANGE_INCREMENTS` steps of `parseRangeIncrement(ability
// .range)`, the same input `buildStrikeRangeGating` feeds `rangeIncrementResult`
// with. This slice only answers them BEFORE the roll and spatially, instead of
// after it and per-target.
//
// Nothing drawn here gates anything. `buildStrikeRangeGating.anyTargetOutOfRange`
// is still what blocks a Strike, `useAdjacency.inReach` is still the authority
// on melee reach, and each band's label says so (see `buildRangeBands`).
//
// Props:
//   snapshot     the snapdone payload ({ capture, worldRect, gridSize })
//   originWorld  { x, y } — the attacker's occupied-rect centre, world space
//                (see `originWorldFromPosition`)
//   bands        `buildRangeBands()` output: [{ feet, label, tone, increment }]
//   feetPerSquare
const toPoints = (polygon) => polygon.map((p) => `${p.nx * 100},${p.ny * 100}`).join(' ');

// The label rides the band's topmost sample, nudged inward so it sits on the
// ring rather than above it. Polygon samples start at theta = 0 and run
// counter-clockwise in screen space, so "topmost" is found, not assumed —
// a rotated capture keeps the label on the ring.
const labelAnchor = (polygon) =>
  polygon.reduce((best, p) => (best === null || p.ny < best.ny ? p : best), null);

const RangeBandsOverlay = ({ snapshot, originWorld, bands = [], feetPerSquare = 5 }) => {
  if (!snapshot || !originWorld || !bands.length) return null;

  const drawn = bands
    .map((band) => ({
      band,
      polygon: isoDistancePolygon(originWorld, band.feet, { snapshot, feetPerSquare }),
    }))
    .filter((d) => d.polygon);

  if (drawn.length === 0) return null;

  return (
    <svg
      className="rbo"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* Outermost first, so the tighter (more permissive) bands paint on top. */}
      {[...drawn].reverse().map(({ band, polygon }) => {
        const anchor = labelAnchor(polygon);
        return (
          <g key={`${band.tone}-${band.feet}`} className={`rbo-band rbo-band--${band.tone}`}>
            <polygon className="rbo-ring" points={toPoints(polygon)} />
            {anchor && (
              <text
                className="rbo-label"
                x={anchor.nx * 100}
                y={anchor.ny * 100}
                textAnchor="middle"
                dominantBaseline="hanging"
                dy="0.6"
              >
                {band.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

export default RangeBandsOverlay;
