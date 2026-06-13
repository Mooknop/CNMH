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
//   traits      PF2e traits; the 'Attack' trait makes the action participate in
//               the Multiple Attack Penalty (read + advance) like a strike
//   defense     target defense the degree is computed against ('will' = Will DC)
//   outcomes    degree → outcome applied; absent degrees do nothing. An outcome is
//               one or more of:
//                 condition + value   enemy condition (value null = unvalued)
//                 selfCondition       condition applied to the acting PC (e.g. a
//                                     maneuver crit-fail leaving you prone)
//                 note                free text logged for GM-resolved effects
//                                     (Shove push, Disarm) with no condition
//   immunity    declarative immunity config (see utils/immunity.js); stamped on
//               the target on any non-error outcome (maneuvers omit this)
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
  // Athletics maneuvers (#260 slice 2). Attack-trait → MAP applies and advances.
  {
    id: 'trip',
    name: 'Trip',
    skill: 'athletics',
    actionCost: 1,
    traits: ['Attack'],
    defense: 'reflex',
    outcomes: {
      criticalSuccess: { condition: 'prone' },
      success:         { condition: 'prone' },
      criticalFailure: { selfCondition: 'prone' },
    },
    availableTo: 'all',
  },
  {
    id: 'grapple',
    name: 'Grapple',
    skill: 'athletics',
    actionCost: 1,
    traits: ['Attack'],
    defense: 'fortitude',
    outcomes: {
      criticalSuccess: { condition: 'restrained' },
      success:         { condition: 'grabbed' },
      criticalFailure: { selfCondition: 'prone' },
    },
    availableTo: 'all',
  },
  {
    id: 'shove',
    name: 'Shove',
    skill: 'athletics',
    actionCost: 1,
    traits: ['Attack'],
    defense: 'fortitude',
    outcomes: {
      criticalSuccess: { note: 'Pushed back 10 ft' },
      success:         { note: 'Pushed back 5 ft' },
    },
    availableTo: 'all',
  },
  {
    id: 'disarm',
    name: 'Disarm',
    skill: 'athletics',
    actionCost: 1,
    traits: ['Attack'],
    defense: 'reflex',
    outcomes: {
      criticalSuccess: { note: 'Item knocked to the ground' },
      success:         { note: 'Disarmed (−2 to attacks with that weapon until its turn ends)' },
    },
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
