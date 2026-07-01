// src/utils/actionGlyph.js
// Maps a PF2e action cost to the character that renders the genuine action
// symbol in the "Pathfinder2eActions" font (@font-face in src/pf2e-tokens.css).
// The font draws the real pip / reaction-arrow art for these plain ASCII
// characters; the mapping mirrors Foundry's pf2e system (src/util/misc.ts
// getActionGlyph) so our glyphs match the rest of the PF2e ecosystem.
//
// 1/2/3 → action pips, R → reaction, F → free action. Variable costs use a
// connector the font draws between two pips (e.g. "1 – 3", "1/2").

const GLYPH_MAP = {
  0: 'F',
  free: 'F',
  'free-action': 'F',
  1: '1',
  2: '2',
  3: '3',
  '1 or 2': '1/2',
  '1 to 3': '1 – 3',
  '2 or 3': '2/3',
  reaction: 'R',
  passive: '',
};

/**
 * Resolve a single action cost to its font character.
 * @param {number|string|null|undefined} cost - 1/2/3, 'reaction', 'free',
 *   'passive', or a variable phrase ('1 to 3').
 * @returns {string} Font character, or '' when the cost has no glyph.
 */
export const getActionGlyph = (cost) => {
  if (cost === null || cost === undefined) return '';
  const key = String(cost).toLowerCase().trim();
  return GLYPH_MAP[key] ?? '';
};

/**
 * Build the font string for a variable action range, e.g. min 1 / max 3 →
 * "1 – 3", which the action font renders as [pip] connector [pips].
 * @param {number} min
 * @param {number} max
 * @returns {string}
 */
export const getVariableActionGlyph = (min, max) => {
  const lo = getActionGlyph(min);
  const hi = getActionGlyph(max);
  if (!lo || !hi) return '';
  return `${lo} – ${hi}`;
};

/** Costs that read as gold (reaction / free) rather than accent-colored pips. */
export const isGoldCost = (cost) => {
  const key = String(cost ?? '').toLowerCase().trim();
  return key === 'reaction' || key === 'free' || key === 'free-action' || key === '0';
};
