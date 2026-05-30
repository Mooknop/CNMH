import React from 'react';

const SYMBOLS = {
  1: '◆',
  2: '◆◆',
  3: '◆◆◆',
  reaction: '↺',
  free: '◇',
  passive: '—',
};

/**
 * Renders a PF2e action economy symbol in Cinzel Bold.
 *
 * @param {number|string} cost - 1, 2, 3, 'reaction', 'free', or 'passive'
 */
const ActionSymbol = ({ cost }) => {
  const sym = SYMBOLS[cost] ?? String(cost);
  const label = typeof cost === 'number'
    ? `${cost} action${cost === 1 ? '' : 's'}`
    : cost;
  return (
    <span
      className="action-sym"
      aria-label={label}
      style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
    >
      {sym}
    </span>
  );
};

export default ActionSymbol;
