/**
 * Victory Point skill challenge helpers (PF2e VP subsystem, GMC 188).
 * Degree-to-VP mapping used by ChallengePrompts (player side) and the GM
 * SkillChallengePanel aggregation.
 *
 * Wire shapes (#1470 — concurrent challenge tracks):
 *   cnmh_vpchallenge_global : null | { [challengeId]: challenge }
 *   cnmh_vpresult_<charId>  : null | { [challengeId]: [entry, ...] }
 *
 * A challenge carries { id, name, skills:[{skill,dc}], threshold, target,
 * targetIds, mode: 'once'|'perRound', actionCost: 0-3, createdAt }. A result
 * entry carries { round, skill, d20, total, degree, vp, at } and is appended
 * by the owning character's client only, so result keys never race.
 *
 * Meter semantics (#1471): a challenge may also carry { startValue, min,
 * max, failAt, drainPerRound, adjust, lastDrainRound }. The live pool is
 * startValue + check VP + adjust, clamped to [min, max]; `adjust`
 * accumulates GM nudges and per-round drains and is written by the GM
 * client only (again single-writer). `threshold` may be null for pure
 * survival meters — the track then has no success line, only failAt.
 *
 * Legacy single-object shapes (pre-#1470: one challenge / one locked result)
 * are normalized on read so a mid-session upgrade degrades gracefully.
 */

export const DEGREE_VP = {
  criticalSuccess: 2,
  success: 1,
  failure: 0,
  criticalFailure: -1,
};

export function vpForDegree(degree) {
  return DEGREE_VP[degree] ?? 0;
}

export const CHALLENGE_MODES = Object.freeze({
  ONCE: 'once',
  PER_ROUND: 'perRound',
});

/**
 * Normalize the synced challenge collection to a { [id]: challenge } map.
 * Accepts null and the legacy single-challenge object (top-level .id), and
 * fills mode/actionCost defaults so consumers never branch on absence.
 *
 * @param {object|null} raw - cnmh_vpchallenge_global value
 * @returns {Object<string, object>}
 */
export function normalizeChallenges(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const map = typeof raw.id === 'string' ? { [raw.id]: raw } : raw;
  const out = {};
  for (const [id, c] of Object.entries(map)) {
    if (!c || typeof c !== 'object') continue;
    out[id] = { mode: CHALLENGE_MODES.ONCE, actionCost: 0, adjust: 0, drainPerRound: 0, ...c };
  }
  return out;
}

/** Clamp a pool value to the challenge's [min, max] bounds (when set). */
export function clampPool(challenge, value) {
  let v = value;
  if (typeof challenge.max === 'number') v = Math.min(v, challenge.max);
  if (typeof challenge.min === 'number') v = Math.max(v, challenge.min);
  return v;
}

/**
 * Live pool for one challenge: startValue + party check VP + GM adjust,
 * clamped to the meter bounds.
 *
 * @param {object} challenge - normalized challenge doc
 * @param {Array<object|null>} resultValues - cnmh_vpresult_<charId> values
 * @returns {number}
 */
export function poolFor(challenge, resultValues) {
  const base =
    (challenge.startValue ?? 0) +
    aggregateVp(resultValues, challenge.id) +
    (challenge.adjust ?? 0);
  return clampPool(challenge, base);
}

/** A track is failing when it has a failAt floor and the pool has hit it. */
export function isFailing(challenge, pool) {
  return typeof challenge.failAt === 'number' && pool <= challenge.failAt;
}

/**
 * Compute the new GM `adjust` that moves the pool by `delta` (nudges and
 * per-round drains), respecting the clamp bounds. Pool-targeting: the
 * result lands the pool exactly on the clamped target, so drains can never
 * dig a hidden deficit below `min` that later recovery has to climb out of.
 *
 * @param {object} challenge - normalized challenge doc
 * @param {number} vpSum - party check VP for this challenge (aggregateVp)
 * @param {number} delta - requested pool change (negative = drain)
 * @returns {{ adjust: number, pool: number, applied: number }}
 *   applied is the actual pool movement after clamping (0 = no-op).
 */
export function applyPoolDelta(challenge, vpSum, delta) {
  const base = (challenge.startValue ?? 0) + vpSum;
  const current = clampPool(challenge, base + (challenge.adjust ?? 0));
  const target = clampPool(challenge, current + delta);
  return { adjust: target - base, pool: target, applied: target - current };
}

/**
 * Normalize one character's synced result value to a
 * { [challengeId]: [entry, ...] } map. Accepts null and the legacy
 * single-result object (top-level .challengeId).
 *
 * @param {object|null} raw - cnmh_vpresult_<charId> value
 * @returns {Object<string, Array<object>>}
 */
export function normalizeResults(raw) {
  if (!raw || typeof raw !== 'object') return {};
  if (typeof raw.challengeId === 'string') {
    const { challengeId, reqId: _reqId, ...entry } = raw;
    return { [challengeId]: [{ round: 0, ...entry }] };
  }
  const out = {};
  for (const [id, list] of Object.entries(raw)) {
    if (Array.isArray(list)) out[id] = list;
  }
  return out;
}

/**
 * One character's entries for one challenge, oldest first.
 *
 * @param {object|null} resultValue - cnmh_vpresult_<charId> value (raw)
 * @param {string} challengeId
 * @returns {Array<object>}
 */
export function entriesFor(resultValue, challengeId) {
  return normalizeResults(resultValue)[challengeId] ?? [];
}

/**
 * One character's cumulative VP contribution to one challenge.
 *
 * @param {object|null} resultValue - cnmh_vpresult_<charId> value (raw)
 * @param {string} challengeId
 * @returns {number}
 */
export function charVp(resultValue, challengeId) {
  return entriesFor(resultValue, challengeId).reduce((sum, e) => sum + (e.vp ?? 0), 0);
}

/**
 * Party VP pool for one challenge — sums every character's entries across
 * every round. Entries for other challenges contribute nothing.
 *
 * @param {Array<object|null>} resultValues - cnmh_vpresult_<charId> values
 * @param {string} challengeId
 * @returns {number}
 */
export function aggregateVp(resultValues, challengeId) {
  return (resultValues || []).reduce((sum, r) => sum + charVp(r, challengeId), 0);
}

/** Display label for a skill key — all PF2e skill keys are single words. */
export function skillLabel(skill) {
  return skill ? skill.charAt(0).toUpperCase() + skill.slice(1) : '';
}
