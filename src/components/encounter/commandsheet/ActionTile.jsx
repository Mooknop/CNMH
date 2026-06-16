// src/components/encounter/commandsheet/ActionTile.jsx
// A single tile in the Command Sheet action grid (#410). Shows the cost glyph,
// name, and the one stat that matters; tapping opens the existing detail/resolve
// path via onSelect. In encounter mode a target-needing tile (#411) dims and
// hints "Tap a foe" until the player has focused one in the InitiativeStrip — the
// tile stays tappable (the resolver has its own target picker), the cue just
// points players at the focus-first flow.
import React from 'react';
import ActionSymbol from '../../shared/ActionSymbol';

// Why a consumable costs more than its 1-action drink/apply (#428): the extra is
// the draw (worn) / retrieve (stowed) Interact to get it in hand.
const DRAW_CUE = { stowed: 'retrieve +2' };
const drawCueFor = (tile) =>
  tile.kind === 'consumable' && tile.drawCost > 0
    ? (DRAW_CUE[tile.raw?.state] || `draw +${tile.drawCost}`)
    : null;

const ActionTile = ({ tile, onSelect, encounterMode = false, hasFocus = false }) => {
  const glyphCost = tile.variableActionCount ? tile.variableActionCount.min : tile.cost;
  const rightTrait = tile.traits?.[0] ?? null;
  const awaitingFocus = encounterMode && tile.needsTarget && !hasFocus;
  const drawCue = drawCueFor(tile);

  const className = [
    'cmd-tile',
    tile.inactive ? 'cmd-tile--inactive' : '',
    awaitingFocus ? 'cmd-tile--awaiting-focus' : '',
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={className}
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
      {awaitingFocus ? (
        <span className="cmd-tile-hint">Tap a foe to target</span>
      ) : drawCue ? (
        <span className="cmd-tile-stat cmd-tile-stat--draw">{drawCue}</span>
      ) : (
        tile.statLine && <span className="cmd-tile-stat">{tile.statLine}</span>
      )}
    </button>
  );
};

export default ActionTile;
