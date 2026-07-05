// Which skills a character may use to Earn Income (#231, extended #1152 S2) —
// pure, React-free.
//
// PF2e Earn Income defaults to Crafting or a Lore skill; certain feats unlock
// another skill. The party's relevant ones:
//   • Bargain Hunter     → Diplomacy (Ashka)
//   • Celebrity Dedication → Performance (Izzy)
// Feat-granted skills are offered regardless of rank (the feat is what enables
// them); Crafting and Lores are only offered when trained. The chosen option's
// rank selects the payout column downstream (payoutCp); untrained never beats
// the Failed amount, so a rank-0 option is harmless but pointless to surface.
//
// #1152 adds a `job` context (a Sandpoint employer or FREELANCE from
// data/earnIncomeEmployers). When present, the job widens the skill list to the
// skills/lores that location unlocks for Earn Income (the Employer trait always
// includes Crafting). Without a job the function keeps its original behavior.

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// feat name → skill id it unlocks for Earn Income.
const FEAT_SKILLS = [
  { feat: 'Bargain Hunter', skill: 'diplomacy' },
  { feat: 'Celebrity Dedication', skill: 'performance' },
];

/**
 * @param {object} charData - shape from useCharacter:
 *   { skillProficiencies: {skillId: rank}, loreSkills: [{name, proficiency}], feats: [{name}] }
 * @param {object|null} job - an employer/FREELANCE from earnIncomeEmployers, or
 *   null for the original (Crafting + trained Lores + feat skills) behavior.
 * @returns {Array<{ key, label, rank, viaFeat? }>}
 *   key — 'crafting' | 'diplomacy' | … | 'lore:<Name>'
 */
export function earnIncomeSkillOptions(charData, job = null) {
  const skillProficiencies = charData?.skillProficiencies || {};
  const loreSkills = charData?.loreSkills || [];
  const feats = charData?.feats || [];

  const featNames = feats.map((f) => (f?.name || '').toLowerCase());
  const hasFeat = (name) => featNames.includes(name.toLowerCase());

  const options = [];
  const add = (opt) => {
    if (!options.some((o) => o.key === opt.key)) options.push(opt);
  };

  // Crafting — the default Earn Income skill, available freelance and at every
  // employer (the Employer trait always allows Crafting), when trained.
  const craftRank = skillProficiencies.crafting || 0;
  if (craftRank >= 1) add({ key: 'crafting', label: 'Crafting', rank: craftRank });

  if (job) {
    // Core skills this location unlocks, offered when trained (an untrained
    // option only ever earns the Failed amount).
    for (const skill of job.skills || []) {
      if (skill === 'crafting') continue; // already added
      const rank = skillProficiencies[skill] || 0;
      if (rank >= 1) add({ key: skill, label: cap(skill), rank });
    }

    // Lores: any trained Lore when the job takes anyLore (a school, freelance),
    // else only the named ones the character actually has trained.
    if (job.anyLore) {
      for (const lore of loreSkills) {
        const rank = lore?.proficiency || 0;
        if (rank >= 1 && lore?.name) {
          add({ key: `lore:${lore.name}`, label: `${lore.name} Lore`, rank });
        }
      }
    } else {
      for (const name of job.lores || []) {
        const lore = loreSkills.find(
          (l) => (l?.name || '').toLowerCase() === name.toLowerCase(),
        );
        const rank = lore?.proficiency || 0;
        if (rank >= 1) add({ key: `lore:${lore.name}`, label: `${lore.name} Lore`, rank });
      }
    }
  } else {
    // Legacy path: all trained Lores.
    for (const lore of loreSkills) {
      const rank = lore?.proficiency || 0;
      if (rank >= 1 && lore?.name) {
        add({ key: `lore:${lore.name}`, label: `${lore.name} Lore`, rank });
      }
    }
  }

  // Feat-granted skills are character capabilities, usable anywhere — offered to
  // their owners even if untrained, tagged so the picker can show why.
  for (const { feat, skill } of FEAT_SKILLS) {
    if (!hasFeat(feat)) continue;
    if (options.some((o) => o.key === skill)) continue;
    add({
      key: skill,
      label: cap(skill),
      rank: skillProficiencies[skill] || 0,
      viaFeat: feat,
    });
  }

  return options;
}
