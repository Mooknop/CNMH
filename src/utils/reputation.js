// src/utils/reputation.js
// Party Reputation rail (#1850, successor to the dock-research train #1841).
// Pure helpers for the `faction` collection (ContentContext `reputation.Factions`,
// GM-authored via GmReputation.jsx). React-free, same split as utils/research.js.
//
// Faction doc shape:
//   { id, name, reputation: number, ranks: [{ name, min, max, effect? }] }
//
// UNLIKE research (progress lives in a synced key), the score lives directly on
// the faction doc — reads and writes go straight through ContentContext/gmApi
// (see DockDowntimePane's commit handler), so there is no progress-map shape
// here, just rank lookup / ladder-bounds / log-phrasing math.

/**
 * The rank tier a reputation score currently sits in, or null when the score
 * falls outside every authored rank's [min, max] (a gap in the ladder, or a
 * score pushed past its outer bounds by GM fiat). Never throws on a faction
 * with no/malformed `ranks`.
 *
 * @param {Object} faction
 * @param {number} rep
 * @returns {Object|null} the matching rank, or null
 */
export function rankFor(faction, rep) {
  const ranks = Array.isArray(faction?.ranks) ? faction.ranks : [];
  return (
    ranks.find(
      (r) => r && typeof r.min === 'number' && typeof r.max === 'number' && rep >= r.min && rep <= r.max
    ) || null
  );
}

/**
 * The outer bounds of a faction's rank ladder — the lowest `min` and highest
 * `max` across every authored rank. Falls back to [-50, 50] (the GMG default
 * ladder span) when the faction has no ranks at all, so a freshly-authored
 * faction still gets usable steppers.
 *
 * @param {Object} faction
 * @returns {{min: number, max: number}}
 */
export function ladderBounds(faction) {
  const ranks = Array.isArray(faction?.ranks) ? faction.ranks : [];
  const mins = ranks.map((r) => r?.min).filter((n) => typeof n === 'number');
  const maxs = ranks.map((r) => r?.max).filter((n) => typeof n === 'number');
  if (!mins.length || !maxs.length) return { min: -50, max: 50 };
  return { min: Math.min(...mins), max: Math.max(...maxs) };
}

/**
 * Clamp a candidate reputation score to the faction's ladder bounds.
 *
 * @param {Object} faction
 * @param {number} value
 * @returns {number}
 */
export function clampToLadder(faction, value) {
  const { min, max } = ladderBounds(faction);
  return Math.min(Math.max(value, min), max);
}

/**
 * Apply a stepper delta to a faction's current (possibly-optimistic)
 * reputation score, clamped to the ladder's outer bounds.
 *
 * @param {Object} faction
 * @param {number} current
 * @param {number} delta
 * @returns {number}
 */
export function stepReputation(faction, current, delta) {
  const base = typeof current === 'number' ? current : 0;
  return clampToLadder(faction, base + (delta || 0));
}

// The GMG default rank ladder (Gamemastery Guide, "Reputation"), worst to
// best. This is the fallback segment set for the #1855 ladder visual when a
// faction doc has no authored `ranks` — it is also, not coincidentally, the
// same span `ladderBounds` falls back to above. Kept here (not hard-coded in
// the component) so the one GMG table lives in one place.
export const GMG_LADDER = [
  { name: 'Hunted', min: -50, max: -30 },
  { name: 'Hated', min: -29, max: -15 },
  { name: 'Disliked', min: -14, max: -5 },
  { name: 'Ignored', min: -4, max: 4 },
  { name: 'Liked', min: 5, max: 14 },
  { name: 'Admired', min: 15, max: 29 },
  { name: 'Revered', min: 30, max: 50 },
];

/**
 * The ladder segments to render for a faction's reputation strip, worst →
 * best (sorted by `min`). Uses the faction's own authored `ranks` when it has
 * at least one valid one; falls back to `GMG_LADDER` otherwise — so a
 * freshly-authored faction with no ranks yet still gets a full seven-band
 * ladder rather than an empty strip. Each segment carries a 3-letter
 * abbreviation (the rank name's first 3 letters — matches every GMG rank
 * name, e.g. "Hunted" → "Hun") and `span` (`max − min + 1`), which the
 * ladder component uses as a flex-grow weight so band widths mirror the
 * ladder's real numeric spans.
 *
 * @param {Object} faction
 * @returns {Array<{name: string, abbr: string, min: number, max: number, span: number}>}
 */
export function ladderSegments(faction) {
  const ranks = Array.isArray(faction?.ranks) ? faction.ranks : [];
  const valid = ranks.filter(
    (r) => r && typeof r.min === 'number' && typeof r.max === 'number'
  );
  const source = valid.length ? valid : GMG_LADDER;
  return source
    .slice()
    .sort((a, b) => a.min - b.min)
    .map((r) => ({
      name: r.name || '',
      abbr: (r.name || '???').slice(0, 3),
      min: r.min,
      max: r.max,
      span: r.max - r.min + 1,
    }));
}

/**
 * Sign bucket for a reputation score — drives badge/score/segment coloring
 * independently of whichever named rank (if any) the score falls in.
 * `min`/`max` cross the same +5/-5 breakpoints the GMG bands themselves land
 * on (Liked starts at 5, Disliked ends at -5), so this doubles as "friendly
 * band" / "hostile band" / "neutral band" for a rank's own bounds too — see
 * `segmentTone`.
 *
 * @param {number} rep
 * @returns {'positive'|'negative'|'neutral'}
 */
export function repTone(rep) {
  const n = typeof rep === 'number' ? rep : 0;
  if (n > 4) return 'positive';
  if (n < -4) return 'negative';
  return 'neutral';
}

/**
 * Tone for a single ladder segment, from its own bounds rather than the
 * current score — used to color the ACTIVE segment (a friendly band lights
 * up verdant, a hostile one peril, Ignored neutral) regardless of the exact
 * score inside it.
 *
 * @param {{min: number, max: number}} seg
 * @returns {'positive'|'negative'|'neutral'}
 */
export function segmentTone(seg) {
  if (seg && seg.min >= 5) return 'positive';
  if (seg && seg.max <= -5) return 'negative';
  return 'neutral';
}

/**
 * Explicit-sign score label — "+12", "-12", "0" — never a bare positive
 * number, matching the GMG convention of always showing reputation's sign.
 *
 * @param {number} rep
 * @returns {string}
 */
export function formatSignedRep(rep) {
  const n = typeof rep === 'number' ? rep : 0;
  return n > 0 ? `+${n}` : `${n}`;
}

/**
 * Session-log text for a committed reputation change, or null when nothing
 * loggable happened. Fires ONLY when the committed value crosses into a
 * DIFFERENT named rank than before (#1850 ruling) — silent for drift that
 * stays within the same rank, and silent when the new score doesn't land in
 * any named rank (nothing sensible to announce).
 *
 * @param {Object} faction
 * @param {number} prevRep - the last COMMITTED score, before this change
 * @param {number} nextRep - the score just committed
 * @returns {string|null}
 */
export function rankChangeLogText(faction, prevRep, nextRep) {
  const prevRank = rankFor(faction, prevRep);
  const nextRank = rankFor(faction, nextRep);
  if (!nextRank || prevRank?.name === nextRank.name) return null;
  const verb = nextRep >= prevRep ? 'rose to' : 'fell to';
  const name = faction?.name || 'Unknown faction';
  return `Reputation: ${name} ${verb} ${nextRank.name} (${nextRep})`;
}
