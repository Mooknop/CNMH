// Which skills a character may use to Earn Income (#231) — pure, React-free.
//
// PF2e Earn Income defaults to Crafting or a Lore skill; certain feats unlock
// another skill. The party's relevant ones:
//   • Bargain Hunter     → Diplomacy (Ashka)
//   • Celebrity Dedication → Performance (Izzy)
// Feat-granted skills are offered regardless of rank (the feat is what enables
// them); Crafting and Lores are only offered when trained. The chosen option's
// rank selects the payout column downstream (payoutCp); untrained never beats
// the Failed amount, so a rank-0 option is harmless but pointless to surface.

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// feat name → skill id it unlocks for Earn Income.
const FEAT_SKILLS = [
  { feat: 'Bargain Hunter', skill: 'diplomacy' },
  { feat: 'Celebrity Dedication', skill: 'performance' },
];

/**
 * @param {object} charData - shape from useCharacter:
 *   { skillProficiencies: {skillId: rank}, loreSkills: [{name, proficiency}], feats: [{name}] }
 * @returns {Array<{ key, label, rank, viaFeat? }>}
 *   key — 'crafting' | 'diplomacy' | … | 'lore:<Name>'
 */
export function earnIncomeSkillOptions(charData) {
  const skillProficiencies = charData?.skillProficiencies || {};
  const loreSkills = charData?.loreSkills || [];
  const feats = charData?.feats || [];

  const featNames = feats.map((f) => (f?.name || '').toLowerCase());
  const hasFeat = (name) => featNames.includes(name.toLowerCase());

  const options = [];

  // Crafting — the default Earn Income skill.
  const craftRank = skillProficiencies.crafting || 0;
  if (craftRank >= 1) {
    options.push({ key: 'crafting', label: 'Crafting', rank: craftRank });
  }

  // Lore skills (trained or better).
  for (const lore of loreSkills) {
    const rank = lore?.proficiency || 0;
    if (rank >= 1 && lore?.name) {
      options.push({ key: `lore:${lore.name}`, label: `${lore.name} Lore`, rank });
    }
  }

  // Feat-granted skills — offered to their owners even if untrained.
  for (const { feat, skill } of FEAT_SKILLS) {
    if (!hasFeat(feat)) continue;
    if (options.some((o) => o.key === skill)) continue;
    options.push({
      key: skill,
      label: cap(skill),
      rank: skillProficiencies[skill] || 0,
      viaFeat: feat,
    });
  }

  return options;
}
