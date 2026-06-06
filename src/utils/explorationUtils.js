// Shared helpers for exploration activity highlight/eligibility logic.
// Used by ExplorationList (chip rendering) and FollowExpertModal (picker filter).

export function profLabel(rank) {
  if (rank >= 4) return 'Legendary';
  if (rank >= 3) return 'Master';
  if (rank >= 2) return 'Expert';
  return null;
}

// Returns the proficiency rank map for a raw character object.
// Handles both { proficiency: N } objects and bare numbers.
export function skillProficienciesFor(character) {
  const result = {};
  for (const [skill, data] of Object.entries(character?.skills || {})) {
    result[skill] = typeof data === 'object' ? (data.proficiency || 0) : (data || 0);
  }
  return result;
}

// Returns the Expert+ label for an activity given a proficiency map, or null.
export function activityHighlightLabel(activity, skillProficiencies) {
  if (!activity?.highlightSkills) return null;
  const bestRank = Math.max(...activity.highlightSkills.map((s) => skillProficiencies[s] || 0));
  return profLabel(bestRank);
}

// Returns the skill id that makes this activity Expert-highlighted for this character,
// or null if no skill is Expert or higher. When multiple qualify, highest rank wins.
export function getExpertHighlightSkill(activity, skillProficiencies) {
  if (!activity?.highlightSkills) return null;
  let bestSkill = null, bestRank = 0;
  for (const s of activity.highlightSkills) {
    const rank = skillProficiencies[s] || 0;
    if (rank > bestRank) { bestRank = rank; bestSkill = s; }
  }
  return bestRank >= 2 ? bestSkill : null;
}
