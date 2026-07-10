import React from 'react';

// Floating-number symbols for the HP juice layer (#1343 follow-up): one tiny
// SVG glyph per canonical PF2e damage type (utils/damage.js DAMAGE_TYPES),
// plus 'untyped' (unlabeled hits — e.g. Foundry-bridge HP writes carry no
// type) and 'heal'. All glyphs are 16×16, single-color via currentColor so
// they inherit the floater's damage/heal tint, and aria-hidden — the ±N text
// beside them carries the information.
//
// Keyed by lowercase type; use symbolTypeFor() to normalize a raw hp.damageType.

const S = { stroke: 'currentColor', fill: 'none', strokeWidth: 1.6, strokeLinecap: 'round' };

const GLYPHS = {
  // Physical
  bludgeoning: (
    <>
      <circle cx="10" cy="5.8" r="3.4" fill="currentColor" />
      <path d="M7.6 8.2 2.8 13.4" {...S} />
    </>
  ),
  piercing: (
    <>
      <path d="M3.2 12.8 11 5" {...S} />
      <path d="M13.2 2.8l-1 4.4-3.4-3.4 4.4-1z" fill="currentColor" />
    </>
  ),
  slashing: (
    <>
      <path d="M4.4 2.6c1.3 3.4 1.3 7.4.3 10.8" {...S} />
      <path d="M8 2.2c1.4 3.6 1.4 8 .4 11.6" {...S} />
      <path d="M11.6 2.6c1.3 3.4 1.3 7.4.3 10.8" {...S} />
    </>
  ),
  // Energy
  acid: (
    <path
      d="M8 2.2C9.7 4.8 11.3 7 11.3 9a3.3 3.3 0 0 1-6.6 0c0-2 1.6-4.2 3.3-6.8z"
      {...S}
    />
  ),
  cold: (
    <>
      <path d="M8 1.6v12.8" {...S} />
      <path d="M2.5 4.8l11 6.4" {...S} />
      <path d="M2.5 11.2l11-6.4" {...S} />
    </>
  ),
  electricity: (
    <path d="M9.2 1 3.6 8.8h3.2L6 15l6.4-8.6H9l.2-5.4z" fill="currentColor" />
  ),
  fire: (
    <path
      d="M8 1.5c.3 2.2 2.7 3.3 3.3 5.7.7 2.7-1 5.3-3.3 5.3S4 9.9 4.7 7.2c.4-1.4 1.5-2.2 2-3.6.4.9 1.6 1.1 1.3-.6-.1-.8 0-1.1 0-1.5z"
      fill="currentColor"
    />
  ),
  sonic: (
    <>
      <path d="M3.6 6.6v2.8" {...S} />
      <path d="M6.6 4.8a4.6 4.6 0 0 1 0 6.4" {...S} />
      <path d="M9.6 3a8.2 8.2 0 0 1 0 10" {...S} />
    </>
  ),
  // Vitality / void / esoteric
  vitality: (
    <>
      <circle cx="8" cy="8" r="2.4" fill="currentColor" />
      <path d="M8 1.4v2.2M8 12.4v2.2M1.4 8h2.2M12.4 8h2.2M3.3 3.3l1.6 1.6M11.1 11.1l1.6 1.6M12.7 3.3l-1.6 1.6M4.9 11.1l-1.6 1.6" {...S} />
    </>
  ),
  void: (
    <path d="M9.2 2a6.2 6.2 0 1 0 4.9 9.4A7 7 0 0 1 9.2 2z" fill="currentColor" />
  ),
  force: (
    <path d="M8 1.4 9.8 6.2 14.6 8 9.8 9.8 8 14.6 6.2 9.8 1.4 8 6.2 6.2z" fill="currentColor" />
  ),
  mental: (
    <path
      d="M8.9 8.9a1.3 1.3 0 1 1-1.8-1.8 2.7 2.7 0 1 1 3.8 3.8 4.6 4.6 0 1 1-6.5-6.5A6 6 0 0 1 13.9 8"
      {...S}
    />
  ),
  poison: (
    <path
      d="M8 1.8a4.8 4.8 0 0 0-4.8 4.8c0 1.7.9 3 2.1 3.8v2.1a1 1 0 0 0 1 1h3.4a1 1 0 0 0 1-1v-2.1a4.7 4.7 0 0 0 2.1-3.8A4.8 4.8 0 0 0 8 1.8zM6.3 6.1a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2zm3.4 0a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2z"
      fill="currentColor"
      fillRule="evenodd"
    />
  ),
  bleed: (
    <path
      d="M8 1.8C9.7 4.4 11.4 6.7 11.4 9a3.4 3.4 0 0 1-6.8 0c0-2.3 1.7-4.6 3.4-7.2z"
      fill="currentColor"
    />
  ),
  precision: (
    <>
      <circle cx="8" cy="8" r="4.4" {...S} />
      <circle cx="8" cy="8" r="1.1" fill="currentColor" />
      <path d="M8 1.4v2.4M8 12.2v2.4M1.4 8h2.4M12.2 8h2.4" {...S} />
    </>
  ),
  // Fallbacks
  untyped: (
    <path
      d="M8 1.4 9.2 5.5l4.1-1.2-2.6 3.4 3.7 2.1-4.2.4.7 4.2L8 11.3l-2.9 3.1.7-4.2-4.2-.4 3.7-2.1-2.6-3.4 4.1 1.2z"
      fill="currentColor"
    />
  ),
  heal: (
    <path
      d="M8 13.6C4 10.6 2.4 8 2.4 5.8 2.4 4 3.9 2.7 5.6 2.7c1 0 2 .6 2.4 1.5.4-.9 1.4-1.5 2.4-1.5 1.7 0 3.2 1.3 3.2 3.1 0 2.2-1.6 4.8-5.6 7.8z"
      fill="currentColor"
    />
  ),
};

// Normalize a raw hp.damageType to a glyph key: known type (case-insensitive)
// or the untyped burst. Healing callers pass 'heal' directly.
export const symbolTypeFor = (damageType) => {
  const t = String(damageType || '').toLowerCase();
  return t !== 'heal' && GLYPHS[t] ? t : 'untyped';
};

export const HpFxSymbol = ({ type }) => (
  <svg
    className="hp-fx-sym"
    viewBox="0 0 16 16"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    data-fx-sym={type}
  >
    {GLYPHS[type] || GLYPHS.untyped}
  </svg>
);

export default HpFxSymbol;
