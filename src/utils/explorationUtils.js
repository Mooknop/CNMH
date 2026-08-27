// Shared helpers for exploration activity highlight/eligibility logic.
// Used by ExplorationList (the player's picker), FollowExpertModal (picker
// filter) and DockExplorationRoster (the GM's act-as picker, #1810) — the two
// pickers MUST offer the same activities for the same PC, so the gating rules
// live here rather than being restated per surface.

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

// Whether an activity is offered to a character at all.
//   requiresFlag         — the named useCharacter() flag must be true
//   requiresAnyFlag      — at least one of the named flags must be true
//   requiresTrainedInAny — Trained (rank ≥ 1) in at least one of the named skills
// An activity with none of these is always available.
export function activityAvailableFor(activity, { flags = {}, skillProficiencies = {} } = {}) {
  if (!activity) return false;
  if (activity.requiresFlag && !flags[activity.requiresFlag]) return false;
  if (activity.requiresAnyFlag && !activity.requiresAnyFlag.some((f) => !!flags[f])) return false;
  if (activity.requiresTrainedInAny
    && !activity.requiresTrainedInAny.some((s) => (skillProficiencies[s] || 0) >= 1)) return false;
  return true;
}

// The gated activity list for one character, in catalog order.
export function availableActivitiesFor(activities, character) {
  return (activities || []).filter((a) => activityAvailableFor(a, character || {}));
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
