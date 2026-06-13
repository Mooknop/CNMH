// Player-initiated skill actions (#260).
//
// Today the only player skill-check path is the GM-pushed SkillPrompt
// (cnmh_skillprompt_<charId>); the sheet's skill list is read-only and never
// spends actions or computes degrees. This registry is the data-driven source
// of truth for skill actions the player can launch themselves during an
// encounter — slice 1 ships Demoralize; maneuvers, Seek, and feat-granted
// entries slot in here later without touching the launch surface or resolver.
//
// Entry shape:
//   id          stable key, also the immunity abilityKey
//   name        display label
//   skill       skill id whose modifier the roll uses
//   actionCost  actions spent on use
//   traits      PF2e traits (display only for now)
//   defense     target defense the degree is computed against ('will' = Will DC)
//   outcomes    degree → { condition, value } applied to the target; absent
//               degrees apply nothing
//   immunity    declarative immunity config (see utils/immunity.js); stamped on
//               the target on any non-error outcome
//   availableTo 'all' for basic actions everyone has; future entries gate per
//               character (feat-granted)

export const SKILL_ACTIONS = [
  {
    id: 'demoralize',
    name: 'Demoralize',
    skill: 'intimidation',
    actionCost: 1,
    traits: ['Auditory', 'Concentrate', 'Emotion', 'Mental'],
    defense: 'will',
    outcomes: {
      criticalSuccess: { condition: 'frightened', value: 2 },
      success:         { condition: 'frightened', value: 1 },
    },
    immunity: { duration: { value: 10, unit: 'minute' }, scope: 'per-caster' },
    availableTo: 'all',
  },
];

/**
 * Skill actions available to a character in the current context.
 * Slice 1: every PC gets the 'all' basic actions (Demoralize is usable untrained,
 * so no proficiency gate). Feat-granted entries will filter on character data here.
 *
 * @param {object} character        the acting PC (unused for 'all' entries today)
 * @param {{ encounterMode?: boolean }} [opts]
 * @returns {Array} matching skill-action entries
 */
export function skillActionsFor(character, { encounterMode = false } = {}) {
  if (!character || !encounterMode) return [];
  return SKILL_ACTIONS.filter((a) => a.availableTo === 'all');
}

export const getSkillAction = (id) => SKILL_ACTIONS.find((a) => a.id === id) || null;
