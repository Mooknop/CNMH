import React from 'react';
import './DoorGlyphsOverlay.css';

// Per-state door glyph. Reuses the emoji vocabulary `ExplorationDoors.jsx`
// (the player-side "Nearby Doors" panel, #435) already established —
// duplicated rather than imported, since that file is a different surface
// this slice is explicitly told not to touch. A later Claude Design pass
// swaps both to real art at once.
const DOOR_GLYPH = { 0: '🚪', 1: '🔓', 2: '🔒' };
const DOOR_STATE_CLASS = { 0: 'closed', 1: 'open', 2: 'locked' };

const toPercent = (center) => ({ cx: center.nx * 100, cy: center.ny * 100 });

// Door glyphs drawn ON the party-framed snapshot (#1809, epic #1804 S5) — a
// `PartyTokensOverlay` sibling: the same flat 0–100 percentage-space SVG
// mounted as `MapSnapshotViewer`'s `overlay` prop, inside `.msv-pane`, so it
// inherits the viewer's pan/zoom transform for free.
//
// Pure presentational + pure props. `doors` is `buildDoorMarkers`'
// (src/utils/tokenMarkers.js) output — the SAME derivation the pane
// hit-tests taps against, so a glyph the GM sees here and the door their tap
// resolves to can never disagree. Re-filtered by the caller whenever the
// snapshot (frame) changes — this component just draws whatever list it's
// handed.
//
// POINTER EVENTS: `pointer-events: none`, like every other snapshot overlay
// — there is no click handler on this layer. Tap resolution lives in the
// pane's single map-tap handler (doors hit-test AFTER PC markers, BEFORE a
// tap falls through to a movement destination).
//
// NO OPTIMISTIC STATE: a tap that toggles a door does not flip this
// component's glyph locally — the bridge's `dooropts_global` re-push (fired
// from Foundry's own `updateWall` hook) is what updates it, same as a door
// opened natively in Foundry. That keeps this overlay a pure function of the
// synced door list, with no local/server disagreement window to reconcile.
//
// SECRET DOORS (#1809 scope update, #1805): ghosted + dashed
// (`.dgo-marker--secret`) so the GM can tell "the party can see this door"
// from "GM-only, revealed by the wall's own `secret` type" at a glance, with
// no separate legend. Still tappable/toggleable like a regular door — only
// the styling differs.
const DoorGlyphsOverlay = ({ doors = [] }) => {
  if (!doors.length) return null;

  return (
    <svg className="dgo" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {doors.map((door) => {
        const stateClass = DOOR_STATE_CLASS[door.state] ?? 'closed';
        const { cx, cy } = toPercent(door.center);
        return (
          <g
            key={door.wallId}
            data-wall-id={door.wallId}
            data-door-state={door.state}
            className={`dgo-marker dgo-marker--${stateClass}${door.secret ? ' dgo-marker--secret' : ''}`}
          >
            <circle className="dgo-ring" cx={cx} cy={cy} r="2.6" />
            <text className="dgo-glyph" x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
              {DOOR_GLYPH[door.state] ?? '🚪'}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

export default DoorGlyphsOverlay;
