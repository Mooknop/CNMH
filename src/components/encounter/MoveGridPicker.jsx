import React from 'react';
import './MoveGridPicker.css';

// Presentational relative grid for token movement. The origin sits at the
// center; the radius is derived from maxFeet so the whole reachable set fits.
//
// Props:
//   origin      { col, row }
//   reachable   [{ col, row, feet, terrain }]
//   blocked     [{ col, row, kind }]   kind: 'wall' | 'ally' | 'enemy'
//   maxFeet     number   (drives the grid radius when `radius` is not given)
//   radius      number   (optional; forces a fixed radius, e.g. 1 for the
//                         8-direction step pad — overrides the maxFeet heuristic)
//   stepMode    boolean  (optional; render a direction arrow per cell instead of
//                         the feet cost, and a dot on the origin — a D-pad feel)
//   cancelLabel string   (optional; label for the dismiss button, default Cancel)
//   onSelect    ({ col, row }) => void
//   onCancel    () => void

const keyOf = (col, row) => `${col},${row}`;

// Blocked-obstacle kinds → human label for aria/legend.
const BLOCK_LABEL = { wall: 'Wall', ally: 'Ally', enemy: 'Enemy' };

// Relative offset (dc,dr) → compass label + arrow glyph for step-pad cells.
// dr is screen-space (row+1 is down/south).
const DIR = {
  '0,-1':  { glyph: '↑', name: 'north' },
  '1,-1':  { glyph: '↗', name: 'northeast' },
  '1,0':   { glyph: '→', name: 'east' },
  '1,1':   { glyph: '↘', name: 'southeast' },
  '0,1':   { glyph: '↓', name: 'south' },
  '-1,1':  { glyph: '↙', name: 'southwest' },
  '-1,0':  { glyph: '←', name: 'west' },
  '-1,-1': { glyph: '↖', name: 'northwest' },
};

const MoveGridPicker = ({
  origin,
  reachable = [],
  blocked = [],
  maxFeet = 25,
  radius: radiusProp,
  stepMode = false,
  cancelLabel = 'Cancel',
  onSelect,
  onCancel,
}) => {
  if (!origin) return null;

  // A fixed `radius` (e.g. the step pad's 1) overrides the heuristic. Otherwise
  // trim the grid to the farthest reachable square + 1 cell of context (the
  // wall/obstacle just beyond): open terrain keeps the full theoretical radius,
  // a walled room shrinks so players don't stare at unreachable empty squares.
  const theoreticalRadius = Math.max(1, Math.round(maxFeet / 5));
  const maxReachExtent = reachable.reduce(
    (max, s) => Math.max(max, Math.abs(s.col - origin.col), Math.abs(s.row - origin.row)),
    0
  );
  const radius = radiusProp ?? Math.min(theoreticalRadius, Math.max(1, maxReachExtent + 1));
  const span = radius * 2 + 1;

  const reachableMap = new Map(reachable.map((s) => [keyOf(s.col, s.row), s]));
  // Older payloads may omit kind; default those obstacles to 'wall'.
  const blockedMap = new Map(blocked.map((b) => [keyOf(b.col, b.row), b.kind ?? 'wall']));

  const cells = [];
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      const col = origin.col + dc;
      const row = origin.row + dr;
      const k = keyOf(col, row);
      const isOrigin = dc === 0 && dr === 0;
      const square = reachableMap.get(k);
      const blockKind = blockedMap.get(k);

      let status = 'out';
      let kind = null;
      if (isOrigin) status = 'origin';
      else if (square) status = square.terrain === 'difficult' ? 'difficult' : 'reachable';
      else if (blockKind) {
        status = `blocked-${blockKind}`;
        kind = blockKind;
      }

      cells.push({ key: k, col, row, dc, dr, status, kind, feet: square?.feet });
    }
  }

  return (
    <div className={`mgp${stepMode ? ' mgp--step' : ''}`} role="group" aria-label="Movement grid">
      <div
        className="mgp-grid"
        style={{ gridTemplateColumns: `repeat(${span}, 1fr)` }}
      >
        {cells.map((c) => {
          if (c.status === 'reachable' || c.status === 'difficult') {
            const dir = stepMode ? DIR[`${c.dc},${c.dr}`] : null;
            const difficult = c.status === 'difficult' ? ' (difficult terrain)' : '';
            const label = dir
              ? `Step ${dir.name}${difficult}`
              : `Move to ${c.col},${c.row}${difficult} — ${c.feet} ft`;
            return (
              <button
                key={c.key}
                type="button"
                className={`mgp-cell mgp-cell--${c.status}`}
                aria-label={label}
                onClick={() => onSelect?.({ col: c.col, row: c.row })}
              >
                {stepMode ? (dir?.glyph ?? '') : c.feet}
              </button>
            );
          }
          const originGlyph = stepMode && c.status === 'origin' ? '•' : null;
          return (
            <div
              key={c.key}
              className={`mgp-cell mgp-cell--${c.status}`}
              aria-label={c.kind ? `Blocked by ${BLOCK_LABEL[c.kind]}` : undefined}
              aria-hidden={c.kind || originGlyph ? undefined : 'true'}
            >
              {originGlyph}
            </div>
          );
        })}
      </div>
      <ul className="mgp-legend" aria-label="Obstacle legend">
        <li className="mgp-legend-item">
          <span className="mgp-swatch mgp-swatch--wall" aria-hidden="true" />Wall
        </li>
        <li className="mgp-legend-item">
          <span className="mgp-swatch mgp-swatch--ally" aria-hidden="true" />Ally
        </li>
        <li className="mgp-legend-item">
          <span className="mgp-swatch mgp-swatch--enemy" aria-hidden="true" />Enemy
        </li>
      </ul>
      <button type="button" className="btn-secondary mgp-cancel" onClick={onCancel}>
        {cancelLabel}
      </button>
    </div>
  );
};

export default MoveGridPicker;
