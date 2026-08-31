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
