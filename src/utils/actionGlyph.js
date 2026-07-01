// src/utils/actionGlyph.js
// Maps a PF2e action cost to the character that renders the genuine action
// symbol in the "Pathfinder2eActions" font (@font-face in src/pf2e-tokens.css).
// The font draws the real pip / reaction-arrow art for these plain ASCII
// characters; the mapping mirrors Foundry's pf2e system (src/util/misc.ts
// getActionGlyph) so our glyphs match the rest of the PF2e ecosystem.
//
// 1/2/3 → action pips, R → reaction, F → free action. Variable costs use a
// connector the font draws between two pips (e.g. "1 – 3", "1/2").
//
// Costs reach us in several encodings: numbers (1/2/3), keywords ('reaction',
// 'free', 'passive'), and — for catalog spells — free-text word strings
// ("Two Actions", "Reaction", "One to Three Actions"). getActionGlyph accepts
// all of them; anything with no glyph (durations like "1 Minute") returns '' so
// the caller can fall back to showing the original text.

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

const WORD_NUM = { one: 1, two: 2, three: 3, 1: 1, 2: 2, 3: 3 };

/**
 * Resolve an action cost to its font character.
 * @param {number|string|null|undefined} cost - 1/2/3, 'reaction', 'free',
 *   'passive', or a free-text phrase ('Two Actions', 'One to Three Actions').
 * @returns {string} Font character(s), or '' when the cost has no glyph.
 */
export const getActionGlyph = (cost) => {
  if (cost === null || cost === undefined) return '';
  const key = String(cost).toLowerCase().trim();
  if (!key) return '';
  if (key in GLYPH_MAP) return GLYPH_MAP[key];

  // Free-text encodings from catalog data.
  if (key.includes('reaction')) return 'R';
  if (key === 'free' || key.includes('free action')) return 'F';

  const range = key.match(/(\w+)\s+to\s+(\w+)\s+action/);
  if (range) {
    const lo = WORD_NUM[range[1]];
    const hi = WORD_NUM[range[2]];
    if (lo && hi) return `${lo} – ${hi}`;
  }

  const single = key.match(/(\w+)\s+action/);
  if (single && WORD_NUM[single[1]]) return String(WORD_NUM[single[1]]);

  return '';
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
  return key.includes('reaction') || key.includes('free') || key === '0';
};
