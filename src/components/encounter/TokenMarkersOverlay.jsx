import React from 'react';
import { buildTokenMarkers } from '../../utils/tokenMarkers';
import './TokenMarkersOverlay.css';

// Token markers drawn ON the snapshot (#1749 epic, wave-1 foundation) — a
// `SnapshotRouteOverlay` sibling: same %-space SVG, same `overlay` prop on
// `MapSnapshotViewer`, inside `.msv-pane`, inheriting pan/zoom for free.
//
// Pure presentational + pure props, exactly like SnapshotRouteOverlay: given
// the same `positions`/`order`/`snapshot` data the rest of the app already
// reads (nothing new is fetched or subscribed to here), it derives the
// marker list via `buildTokenMarkers` (src/utils/tokenMarkers.js — the SAME
// derivation the tap hit-test in src/utils/markerHitTest.js consumes, so
// "where is this marker" has one source of truth) and draws a
// footprint-shaped rectangle + a labeled center dot per visible combatant.
//
// Hidden combatants are excluded by `buildTokenMarkers` itself — defense in
// depth on top of the bridge's own `positions` filter (#1749 OQ-5 ruling).
// This component never sees a hidden entry's position at all if either side
// of that filter did its job.
//
// Mounted by `useMapTargetSection` (#1749 S4) inside `RollSheet`'s `editPanel`,
// beside the `TargetPicker` chips — the chips say WHO, this says WHERE, and
// both drive the same `useTargeting` set (OQ-6 ruling: no toggle, both at
// once). Still pure props: the selection/flanked/reach state below is decided
// by the caller and merely rendered here.
//
// Props:
//   snapshot     the snapdone payload ({ capture, worldRect, gridSize })
//   positions    the raw cnmh_positions_global payload ({ gridSize, positions })
//   order        encounter.order entries [{ entryId, kind, name, disposition?, hidden? }]
//   markers      pre-derived `buildTokenMarkers` output — pass it when the
//                caller ALREADY built the list to hit-test taps against, so
//                the drawing and the hit test can never disagree about where a
//                marker is. Omitted, this derives its own from the three props
//                above (the wave-1 standalone behaviour).
//   selectedIds  entryIds currently in the target set — drawn with a selection ring
//   flankedIds   entryIds the viewer flanks (#1749 S5) — get the ⚔ badge
//   outOfReachIds entryIds `useAdjacency.inReach` says are NOT reachable; dimmed
//   originId     the attacker's own entryId, marked as the vantage point
const toPoints = (polygon) => polygon.map((p) => `${p.nx * 100},${p.ny * 100}`).join(' ');

// Half a cell in normalized space, for badge offsets that follow the token's
// actual footprint rather than a fixed nudge.
const halfSpan = (footprint) => {
  const xs = footprint.map((p) => p.nx);
  const ys = footprint.map((p) => p.ny);
  return {
    x: (Math.max(...xs) - Math.min(...xs)) / 2,
    y: (Math.max(...ys) - Math.min(...ys)) / 2,
  };
};

const TokenMarkersOverlay = ({
  snapshot,
  positions,
  order = [],
  markers: markersProp = null,
  selectedIds = [],
  flankedIds = [],
  outOfReachIds = [],
  originId = null,
}) => {
  if (!snapshot) return null;

  const markers = markersProp ?? buildTokenMarkers({ positions, order, snapshot });
  if (markers.length === 0) return null;

  const selected = new Set(selectedIds);
  const flanked = new Set(flankedIds);
  const unreachable = new Set(outOfReachIds);

  return (
    <svg
      className="tmo"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {markers.map((m) => {
        const isSelected = selected.has(m.entryId);
        const span = halfSpan(m.footprint);
        return (
          <g
            key={m.entryId}
            data-entry-id={m.entryId}
            className={[
              'tmo-marker',
              `tmo-marker--${m.tint || 'enemy'}`,
              isSelected ? 'tmo-marker--selected' : '',
              unreachable.has(m.entryId) ? 'tmo-marker--far' : '',
              m.entryId === originId ? 'tmo-marker--origin' : '',
            ].filter(Boolean).join(' ')}
          >
            <polygon className="tmo-footprint" points={toPoints(m.footprint)} />
            {isSelected && (
              <circle
                className="tmo-select"
                cx={m.center.nx * 100}
                cy={m.center.ny * 100}
                r={Math.max(span.x, span.y) * 100}
              />
            )}
            <circle className="tmo-dot" cx={m.center.nx * 100} cy={m.center.ny * 100} r="1.6" />
            {flanked.has(m.entryId) && (
              <text
                className="tmo-flank"
                x={(m.center.nx + span.x) * 100}
                y={(m.center.ny - span.y) * 100}
                textAnchor="middle"
                dominantBaseline="hanging"
              >
                ⚔
              </text>
            )}
            {m.name && (
              <text
                className="tmo-label"
                x={m.center.nx * 100}
                y={m.center.ny * 100}
                textAnchor="middle"
                dominantBaseline="hanging"
                dy="2.2"
              >
                {m.name}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

export default TokenMarkersOverlay;
