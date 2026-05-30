import React from 'react';
import './MoveGridPicker.css';

// Presentational relative grid for token movement. The origin sits at the
// center; the radius is derived from maxFeet so the whole reachable set fits.
//
// Props:
//   origin     { col, row }
//   reachable  [{ col, row, feet, terrain }]
//   blocked    [{ col, row }]
//   maxFeet    number   (drives the grid radius)
//   onSelect   ({ col, row }) => void
//   onCancel   () => void

const keyOf = (col, row) => `${col},${row}`;

const MoveGridPicker = ({ origin, reachable = [], blocked = [], maxFeet = 25, onSelect, onCancel }) => {
  if (!origin) return null;

  const radius = Math.max(1, Math.round(maxFeet / 5));
  const span = radius * 2 + 1;

  const reachableMap = new Map(reachable.map((s) => [keyOf(s.col, s.row), s]));
  const blockedSet = new Set(blocked.map((b) => keyOf(b.col, b.row)));

  const cells = [];
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      const col = origin.col + dc;
      const row = origin.row + dr;
      const k = keyOf(col, row);
      const isOrigin = dc === 0 && dr === 0;
      const square = reachableMap.get(k);
      const isBlocked = blockedSet.has(k);

      let status = 'out';
      if (isOrigin) status = 'origin';
      else if (square) status = square.terrain === 'difficult' ? 'difficult' : 'reachable';
      else if (isBlocked) status = 'blocked';

      cells.push({ key: k, col, row, status, feet: square?.feet });
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
              aria-hidden="true"
            />
          )
        )}
      </div>
      <button type="button" className="btn-secondary mgp-cancel" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
};

export default MoveGridPicker;
