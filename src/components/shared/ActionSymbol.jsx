import React from 'react';
import { getActionGlyph, isGoldCost } from '../../utils/actionGlyph';

const LABELS = { reaction: 'reaction', free: 'free action', passive: 'passive' };

/**
 * Renders a PF2e action-economy symbol using the genuine Pathfinder2eActions
 * font (@font-face in pf2e-tokens.css). Accepts numbers, keywords, or catalog
 * word-strings ('Two Actions'). Costs the font has no glyph for — durations
 * like '1 Minute', or 'passive' — fall back to their text.
 *
 * @param {number|string} cost - 1, 2, 3, 'reaction', 'free', 'passive', or a
 *   free-text action phrase.
 */
const ActionSymbol = ({ cost }) => {
  const glyph = getActionGlyph(cost);
  const label = typeof cost === 'number'
    ? `${cost} action${cost === 1 ? '' : 's'}`
    : (LABELS[cost] ?? String(cost ?? ''));

  if (!glyph) {
    const text = cost === null || cost === undefined || cost === '' ? '—' : String(cost);
    return <span className="action-sym action-sym--text" aria-label={label}>{text}</span>;
  }

  const className = `action-sym pf2e-action-glyph${isGoldCost(cost) ? ' pf2e-action-glyph--gold' : ''}`;
  return (
    <span className={className} aria-label={label}>
      {glyph}
    </span>
  );
};

export default ActionSymbol;
