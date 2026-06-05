import React from 'react';
import './MoveGridPicker.css';

// Presentational relative grid for token movement. The origin sits at the
// center; the radius is derived from maxFeet so the whole reachable set fits.
//
// Props:
//   origin     { col, row }
//   reachable  [{ col, row, feet, terrain }]
//   blocked    [{ col, row, kind }]   kind: 'wall' | 'ally' | 'enemy'
//   maxFeet    number   (drives the grid radius)
//   onSelect   ({ col, row }) => void
//   onCancel   () => void

const keyOf = (col, row) => `${col},${row}`;

// Blocked-obstacle kinds → human label for aria/legend.
const BLOCK_LABEL = { wall: 'Wall', ally: 'Ally', enemy: 'Enemy' };

const MoveGridPicker = ({ origin, reachable = [], blocked = [], maxFeet = 25, onSelect, onCancel }) => {
  if (!origin) return null;

  const radius = Math.max(1, Math.round(maxFeet / 5));
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

      cells.push({ key: k, col, row, status, kind, feet: square?.feet });
    }
  }

  return (
    <div className="mgp" role="group" aria-label="Movement grid">
      <div
        className="mgp-grid"
        style={{ gridTemplateColumns: `repeat(${span}, 1fr)` }}
      >
        {cells.map((c) =>
          c.status === 'reachable' || c.status === 'difficult' ? (
            <button
              key={c.key}
              type="button"
              className={`mgp-cell mgp-cell--${c.status}`}
              aria-label={`Move to ${c.col},${c.row}${c.status === 'difficult' ? ' (difficult terrain)' : ''} — ${c.feet} ft`}
              onClick={() => onSelect?.({ col: c.col, row: c.row })}
            >
              {c.feet}
            </button>
          ) : (
            <div
              key={c.key}
              className={`mgp-cell mgp-cell--${c.status}`}
              aria-label={c.kind ? `Blocked by ${BLOCK_LABEL[c.kind]}` : undefined}
              aria-hidden={c.kind ? undefined : 'true'}
            />
          )
        )}
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
        Cancel
      </button>
    </div>
  );
};

export default MoveGridPicker;
