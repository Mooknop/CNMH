// Resident-expert derivation for downtime Follow-the-Expert pairing.
// Reuses the exploration proficiency reader; mirrors Follow the Expert's
// "Expert or higher" gate.
import { skillProficienciesFor } from './explorationUtils';

// The skill(s) whose proficiency makes a PC the party's expert for each
// accumulate activity. Research draws on the recall-knowledge skills; Crafting on
// Crafting. Retrain has no single keyed skill, so it has no resident expert.
export const EXPERT_SKILLS = {
  Research: ['arcana', 'occultism', 'religion', 'society'],
  Crafting: ['crafting'],
};

// The party's resident expert for an accumulate activity: the PC (excluding the
// viewer) who is also pursuing that activity this week and has the highest
// relevant proficiency, requiring Expert (rank 2)+. Ties keep the earlier PC.
//
// `party` entries are { char, plan } as returned by usePartyDowntime.
// Returns { char, skillId, rank } or null.
export function downtimeExpertFor(activityName, party, viewerId) {
  const skills = EXPERT_SKILLS[activityName];
  if (!skills) return null;

  let best = null;
  for (const entry of party || []) {
    const char = entry?.char;
    if (!char || char.id === viewerId) continue;
    if (!((entry.plan?.[activityName] || 0) > 0)) continue;

    const profs = skillProficienciesFor(char);
    let bestSkill = null;
    let bestRank = 0;
    for (const s of skills) {
      const rank = profs[s] || 0;
      if (rank > bestRank) { bestRank = rank; bestSkill = s; }
    }
    if (bestRank >= 2 && bestRank > (best?.rank || 0)) {
      best = { char, skillId: bestSkill, rank: bestRank };
    }
  }
  return best;
}
