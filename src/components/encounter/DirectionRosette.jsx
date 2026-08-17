import React from 'react';
import './DirectionRosette.css';

// 8-point compass direction picker (#1751 OQ-2) — presentational only.
//
// #1735 (cones/lines) needs a facing, and the epic's own research priced
// three ways to get one on a tap surface: a second precision tap (a few
// degrees of finger slop rotates a far cone edge by a whole square), a
// tap-and-drag (which would need new gesture state inside MapSnapshotViewer,
// a component three flows now share), or this — an 8-point rosette after the
// origin tap. Ruled 2026-08-16: the rosette. No gesture work, and it
// grid-quantizes by construction, which is the PF2e cone convention #1735 S1
// tests against ("30-ft cone at the 8 compass points").
//
// This component owns ONLY the picker surface: which of 8 compass points is
// selected. It has no hooks, no map, no geometry — #1735 turns the chosen
// direction into cone/line cells and the `direction` wire field. The compass
// vocabulary (glyph + name per point) matches MoveGridPicker's `DIR` table
// (#1736) so the same 8 names read consistently across the movement step-pad
// and this rosette.
//
// dc/dr are screen-space offsets (dr south = +1), included for a consumer
// that wants a direction as a unit vector rather than a name. `compassDeg`
// (#1735 S3) is the SAME point expressed in the wire vocabulary — degrees
// clockwise from north, `normalizeCompassDeg`'s convention
// (`utils/spellArea.js`) — spelled out explicitly here rather than left as
// "whatever this array's index times 45 works out to", so a consumer never
// has to assume the two orderings stay in lockstep.
export const ROSETTE_DIRECTIONS = [
  { name: 'north', glyph: '↑', dc: 0, dr: -1, compassDeg: 0 },
  { name: 'northeast', glyph: '↗', dc: 1, dr: -1, compassDeg: 45 },
  { name: 'east', glyph: '→', dc: 1, dr: 0, compassDeg: 90 },
  { name: 'southeast', glyph: '↘', dc: 1, dr: 1, compassDeg: 135 },
  { name: 'south', glyph: '↓', dc: 0, dr: 1, compassDeg: 180 },
  { name: 'southwest', glyph: '↙', dc: -1, dr: 1, compassDeg: 225 },
  { name: 'west', glyph: '←', dc: -1, dr: 0, compassDeg: 270 },
  { name: 'northwest', glyph: '↖', dc: -1, dr: -1, compassDeg: 315 },
];

/**
 * @param {string|null} [value]      the selected direction's `name` (one of
 *                                   ROSETTE_DIRECTIONS), or null for none yet
 * @param {(name: string) => void} [onChange]
 * @param {string} [label]           accessible group label
 */
const DirectionRosette = ({ value = null, onChange, label = 'Direction' }) => (
  <div className="dir-rosette" role="group" aria-label={label}>
    <div className="dir-rosette-grid">
      {ROSETTE_DIRECTIONS.map((dir) => (
        <button
          key={dir.name}
          type="button"
          className={`dir-rosette-point dir-rosette-point--${dir.name}${
            value === dir.name ? ' dir-rosette-point--selected' : ''
          }`}
          aria-pressed={value === dir.name}
          aria-label={dir.name}
          onClick={() => onChange?.(dir.name)}
        >
          {dir.glyph}
        </button>
      ))}
      <div className="dir-rosette-center" aria-hidden="true" />
    </div>
  </div>
);

export default DirectionRosette;
