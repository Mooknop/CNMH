// src/components/encounter/commandsheet/ActionTile.jsx
// A single tile in the Command Sheet action grid (#410). Shows the cost glyph,
// name, and the one stat that matters; tapping opens the existing detail/resolve
// path via onSelect.
import React from 'react';
import ActionSymbol from '../../shared/ActionSymbol';

const ActionTile = ({ tile, onSelect }) => {
  const glyphCost = tile.variableActionCount ? tile.variableActionCount.min : tile.cost;
  const rightTrait = tile.traits?.[0] ?? null;

  return (
    <button
      type="button"
      className={`cmd-tile${tile.inactive ? ' cmd-tile--inactive' : ''}`}
      onClick={() => onSelect(tile)}
      aria-label={tile.name}
    >
      <span className="cmd-tile-top">
        <span className="cmd-tile-cost">
          <ActionSymbol cost={glyphCost} />
          {tile.variableActionCount && <span className="cmd-tile-cost-var">+</span>}
        </span>
        {rightTrait && <span className="cmd-tile-trait">{rightTrait}</span>}
      </span>
      <span className="cmd-tile-name">{tile.name}</span>
      {tile.statLine && <span className="cmd-tile-stat">{tile.statLine}</span>}
    </button>
  );
};

export default ActionTile;
