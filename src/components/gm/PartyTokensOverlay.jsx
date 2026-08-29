import React from 'react';
import './PartyTokensOverlay.css';

// PC tap targets drawn ON the party-framed snapshot (#1808, epic #1804 S4) —
// a `SnapshotRouteOverlay` / `TokenMarkersOverlay` sibling: the same flat
// 0–100 percentage-space SVG mounted as `MapSnapshotViewer`'s `overlay`, inside
// `.msv-pane`, so it inherits the viewer's pan/zoom transform for free.
//
// Pure presentational + pure props. The marker list comes from
// `buildPartyMarkers` (src/utils/tokenMarkers.js) — the SAME derivation the
// pane hit-tests taps against via `hitTestMarkers`, so the ring the GM sees and
// the ring their finger resolves to can never disagree.
//
// POINTER EVENTS: the layer is `pointer-events: none` like every other
// snapshot overlay. Selection is NOT a click handler here — it's the pane's
// single map-tap handler resolving a normalized tap against these markers
// first (a PC) and falling through to a destination cell otherwise. One tap
// path means the 44px-equivalent snap radius applies to both, and the viewer's
// pan/pinch gesture discipline is never bypassed.
//
// Each marker is tinted with its PC's roster accent through `--marker-accent`
// (the dynamic-per-character custom-property recipe), falling back to the
// shared PC tint when the roster has no match for a `moverId`.
//
// INVISIBLE HIT AREAS (user-requested follow-up to #1804, #1822/#1831): the
// party map is a live canvas snapshot — the real Foundry tokens are already
// visible in the picture, so a drawn ring/dot/name-label on top of them was
// redundant visual noise. Every element below still renders — same DOM
// identity (`data-mover-id`, `.pto-marker`(`--selected`), `.pto-footprint`,
// `.pto-dot`, `.pto-label`) the tap hit-test geometry (`hitTestMarkers`) and
// the unit/e2e suites both key off — it simply paints nothing any more
// (PartyTokensOverlay.css strips fill/stroke/opacity to 0). Selection
// feedback now lives ONLY in the roster chips (`DockExplorationRoster`,
// which already render selected state of their own) — `.pto-marker--selected`
// is still applied here so the DOM (and the tests) can still tell selection
// state apart, it simply carries no visual treatment.
//
// SELECTION IS A SET (#1824, epic #1822 A2): `selectedIds` carries every
// currently-selected mover, not just one — a destination tap moves the whole
// set (size 1 = today's flow; size 2+ dispatch lands in slice B1). Every
// member still gets the `--selected` class, just with nothing left to render.
const toPoints = (polygon) => polygon.map((p) => `${p.nx * 100},${p.ny * 100}`).join(' ');

const PartyTokensOverlay = ({ markers = [], selectedIds = null, dimmed = false }) => {
  if (!markers.length) return null;

  return (
    <svg
      className={`pto${dimmed ? ' pto--dimmed' : ''}`}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {markers.map((m) => {
        const selected = !!selectedIds?.has?.(m.moverId);
        return (
          <g
            key={m.moverId}
            data-mover-id={m.moverId}
            className={`pto-marker${selected ? ' pto-marker--selected' : ''}`}
            style={m.accent ? { '--marker-accent': m.accent } : undefined}
          >
            {m.footprint && (
              <polygon className="pto-footprint" points={toPoints(m.footprint)} />
            )}
            {selected && (
              <circle className="pto-select" cx={m.center.nx * 100} cy={m.center.ny * 100} r="3.4" />
            )}
            <circle className="pto-dot" cx={m.center.nx * 100} cy={m.center.ny * 100} r="1.6" />
            <text
              className="pto-label"
              x={m.center.nx * 100}
              y={m.center.ny * 100}
              textAnchor="middle"
              dominantBaseline="hanging"
              dy="2.6"
            >
              {m.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

export default PartyTokensOverlay;
