// src/components/encounter/commandsheet/ActionTile.jsx
// A single tile in the Segmented Deck (#410, encounter UI redesign). Shows the
// cost glyph, name, and the one stat that matters; tapping opens the existing
// detail/resolve path via onSelect. In encounter mode a target-needing tile
// (#411) dims and hints "Tap a foe" until the player has focused one in the
// InitiativeStrip — the tile stays tappable (the resolver has its own target
// picker), the cue just points players at the focus-first flow.
//
// Layouts:
// - card    (default) — 2-col grid card: glyph + trait top row, name, stat
// - compact — 3-col basic-action tile: centered muted glyph + name
// - row     — full-width list row: glyph | name + sub line
import React from 'react';
import ActionSymbol from '../../shared/ActionSymbol';

// Why a consumable costs more than its 1-action drink/apply (#428): the extra is
// the draw (worn) / retrieve (stowed) Interact to get it in hand.
const DRAW_CUE = { stowed: 'retrieve +2' };
const drawCueFor = (tile) =>
  tile.kind === 'consumable' && tile.drawCost > 0
    ? (DRAW_CUE[tile.raw?.state] || `draw +${tile.drawCost}`)
    : null;

const ActionTile = ({ tile, onSelect, encounterMode = false, hasFocus = false, allyOutOfReach = false, layout = 'card' }) => {
  const glyphCost = tile.variableActionCount ? tile.variableActionCount.min : tile.cost;
  const rightTrait = tile.traits?.[0] ?? null;
  const awaitingFocus = encounterMode && tile.needsTarget && !hasFocus;
  // A support action (Battle Medicine, …) on a focused ally who is out of reach
  // can't be performed — hard-disable it with a "move closer" cue (#430).
  const outOfReach = encounterMode && tile.supports && allyOutOfReach;
  const drawCue = drawCueFor(tile);

  const className = [
    'cmd-tile',
    layout !== 'card' ? `cmd-tile--${layout}` : '',
    tile.heals ? 'cmd-tile--heals' : '',
    tile.inactive ? 'cmd-tile--inactive' : '',
    awaitingFocus ? 'cmd-tile--awaiting-focus' : '',
    outOfReach ? 'cmd-tile--out-of-reach' : '',
  ].filter(Boolean).join(' ');

  const glyph = (
    <span className="cmd-tile-cost">
      <ActionSymbol cost={glyphCost} />
      {tile.variableActionCount && <span className="cmd-tile-cost-var">+</span>}
    </span>
  );

  // The one sub-line that matters, in cue priority order. Rows keep their
  // informational line (chamber notes, reaction triggers) over the focus
  // hint — the awaiting-focus dim still signals — and fall back to the
  // action's trigger/description so reactions read as "name — trigger".
  const statLike = drawCue ? (
    <span className="cmd-tile-stat cmd-tile-stat--draw">{drawCue}</span>
  ) : tile.statLine ? (
    <span className="cmd-tile-stat">{tile.statLine}</span>
  ) : layout === 'row' && tile.raw?.description ? (
    <span className="cmd-tile-stat cmd-tile-stat--desc">{tile.raw.description}</span>
  ) : null;

  const sub = outOfReach ? (
    <span className="cmd-tile-hint">Move closer to target</span>
  ) : awaitingFocus && layout !== 'row' ? (
    <span className="cmd-tile-hint">Tap a foe to target</span>
  ) : statLike || (awaitingFocus ? (
    <span className="cmd-tile-hint">Tap a foe to target</span>
  ) : null);

  if (layout === 'compact') {
    // Compact tiles stay glyph + name only — the awaiting-focus dim still
    // applies, but the textual hint would drown a 3-col grid of maneuvers.
    return (
      <button type="button" className={className} onClick={() => onSelect(tile)} disabled={outOfReach} aria-label={tile.name}>
        {glyph}
        <span className="cmd-tile-name">{tile.name}</span>
      </button>
    );
  }

  if (layout === 'row') {
    return (
      <button type="button" className={className} onClick={() => onSelect(tile)} disabled={outOfReach} aria-label={tile.name}>
        {glyph}
        <span className="cmd-tile-row-main">
          <span className="cmd-tile-name">{tile.name}</span>
          {sub}
        </span>
      </button>
    );
  }

  return (
    <button type="button" className={className} onClick={() => onSelect(tile)} disabled={outOfReach} aria-label={tile.name}>
      <span className="cmd-tile-top">
        {glyph}
        {rightTrait && <span className="cmd-tile-trait">{rightTrait}</span>}
      </span>
      <span className="cmd-tile-name">{tile.name}</span>
      {sub}
    </button>
  );
};

export default ActionTile;
