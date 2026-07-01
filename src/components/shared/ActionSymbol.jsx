import React from 'react';
import { getActionGlyph, isGoldCost } from '../../utils/actionGlyph';

const LABELS = { reaction: 'reaction', free: 'free action', passive: 'passive' };

/**
 * Renders a PF2e action-economy symbol using the genuine Pathfinder2eActions
 * font (@font-face in pf2e-tokens.css). Falls back to an em dash for costs the
 * font has no glyph for (e.g. passive).
 *
 * @param {number|string} cost - 1, 2, 3, 'reaction', 'free', or 'passive'
 */
const ActionSymbol = ({ cost }) => {
  const glyph = getActionGlyph(cost);
  const label = typeof cost === 'number'
    ? `${cost} action${cost === 1 ? '' : 's'}`
    : (LABELS[cost] ?? String(cost));

  if (!glyph) {
    return <span className="action-sym" aria-label={label}>—</span>;
  }

  const className = `action-sym pf2e-action-glyph${isGoldCost(cost) ? ' pf2e-action-glyph--gold' : ''}`;
  return (
    <span className={className} aria-label={label}>
      {glyph}
    </span>
  );
};

export default ActionSymbol;
