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
// Not wired into anything yet (no RollSheet/editPanel mount, no capture
// request) — that's wave 2 (S4/S6). This is the drawing primitive alone.
//
// Props:
//   snapshot    the snapdone payload ({ capture, worldRect, gridSize })
//   positions   the raw cnmh_positions_global payload ({ gridSize, positions })
//   order       encounter.order entries [{ entryId, kind, name, disposition?, hidden? }]
const toPoints = (polygon) => polygon.map((p) => `${p.nx * 100},${p.ny * 100}`).join(' ');

const TokenMarkersOverlay = ({ snapshot, positions, order = [] }) => {
  if (!snapshot) return null;

  const markers = buildTokenMarkers({ positions, order, snapshot });
  if (markers.length === 0) return null;

  return (
    <svg
      className="tmo"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {markers.map((m) => (
        <g key={m.entryId} className={`tmo-marker tmo-marker--${m.tint || 'enemy'}`}>
          <polygon className="tmo-footprint" points={toPoints(m.footprint)} />
          <circle className="tmo-dot" cx={m.center.nx * 100} cy={m.center.ny * 100} r="1.6" />
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
      ))}
    </svg>
  );
};

export default TokenMarkersOverlay;
