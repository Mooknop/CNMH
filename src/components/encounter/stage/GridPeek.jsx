// src/components/encounter/stage/GridPeek.jsx
// The off-turn "grid peek" (#471): the on-turn Command Sheet action grid,
// collapsed behind a pull-up handle and rendered INERT for planning. Reuses
// ActionGrid in read-only mode (encounterMode off ⇒ no "Right Now"/focus dimming;
// readOnly ⇒ tiles are non-interactive) rather than forking the grid.
import React, { useState } from 'react';
import ActionGrid from '../commandsheet/ActionGrid';

const GridPeek = ({ character, themeColor }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className={`stage-peek${open ? ' stage-peek--open' : ''}`}>
      <button
        type="button"
        className="stage-peek-handle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="stage-peek-grip" aria-hidden="true" />
        <span className="stage-peek-label">Your command grid</span>
        <span className="stage-peek-sub">{open ? 'tap to close' : 'ready on your turn'}</span>
        <span className="stage-peek-chev" aria-hidden="true">{open ? '▾' : '▴'}</span>
      </button>
      {open && (
        <div className="stage-peek-body">
          <p className="stage-peek-note">
            Inert until initiative reaches you &mdash; shown for planning.
          </p>
          <ActionGrid
            character={character}
            themeColor={themeColor}
            encounterMode={false}
            readOnly
          />
        </div>
      )}
    </div>
  );
};

export default GridPeek;
