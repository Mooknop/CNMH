/**
 * Victory Point skill challenge helpers (PF2e VP subsystem, GMC 188).
 * Degree-to-VP mapping used by SkillPrompt (player side) and the GM
 * SkillChallengePanel aggregation.
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

/**
 * Sum VP contributions for one challenge. Results carrying a different
 * challengeId (stale entries from a previous challenge) contribute nothing.
 *
 * @param {Array<object|null>} results - cnmh_vpresult_<charId> values
 * @param {string} challengeId
 * @returns {number}
 */
export function aggregateVp(results, challengeId) {
  return (results || []).reduce(
    (sum, r) => (r && r.challengeId === challengeId ? sum + (r.vp ?? 0) : sum),
    0
  );
}

/** Display label for a skill key — all PF2e skill keys are single words. */
export function skillLabel(skill) {
  return skill ? skill.charAt(0).toUpperCase() + skill.slice(1) : '';
}
