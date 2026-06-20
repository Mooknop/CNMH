// Catalog of 10-minute+ activities a player can allocate during a "Take 10"
// (#561, epic #536). Each entry declares its time cost in `minutes`; the block
// length is the live party-max of everyone's total allocation, so a longer
// activity (e.g. Learn a Spell) widens the budget for the whole table.
//
// Eligibility filters mirror the exploration-activity pattern:
//   requiresFlag        — a single flag on the character model's flags object
//   requiresAnyFlag     — any one of these flags is true
//   requiresTrainedInAny— Trained (rank >= 1) in any one of these skill ids
//
// Item-derived activities (apply a 10-minute oil, affix a talisman) are NOT
// here — those surface from inventory in Slice 3 (#562), which also resolves
// every activity's effect. Slice 2 only records the allocation.

export const TAKE10_ACTIVITIES = [
  {
    id: 'refocus',
    name: 'Refocus',
    minutes: 10,
    requiresAnyFlag: ['hasFocusSpells'],
    note: 'Restore 1 Focus Point (up to your pool).',
  },
  {
    id: 'treat-wounds',
    name: 'Treat Wounds',
    minutes: 10,
    requiresTrainedInAny: ['medicine'],
    note: 'Medicine check to heal a creature; 1-hour immunity per target.',
  },
  {
    id: 'repair',
    name: 'Repair',
    minutes: 10,
    requiresTrainedInAny: ['crafting'],
    note: 'Crafting check to restore Hit Points to a damaged item.',
  },
  {
    id: 'identify-magic',
    name: 'Identify Magic',
    minutes: 10,
    requiresTrainedInAny: ['arcana', 'nature', 'occultism', 'religion'],
    note: 'Identify a magic item, location, or ongoing effect.',
  },
  {
    id: 'learn-a-spell',
    name: 'Learn a Spell',
    minutes: 60,
    requiresFlag: 'hasSpellcasting',
    requiresTrainedInAny: ['arcana', 'nature', 'occultism', 'religion'],
    note: '1 hour per spell rank to add a spell to your repertoire/spellbook.',
  },
  {
    id: 'other',
    name: 'Other activity',
    minutes: 10,
    note: 'A 10-minute activity adjudicated by the GM.',
  },
];

/**
 * The Take 10 activities a character is eligible to allocate, filtered by the
 * same flag/skill gates the exploration picker uses.
 * @param {Object} model - character model from useCharacter (flags + skillProficiencies)
 * @returns {Array} eligible activity definitions
 */
export function availableTake10Activities(model) {
  if (!model) return [];
  const { flags = {}, skillProficiencies = {} } = model;
  const isTrained = (id) => (skillProficiencies[id] || 0) >= 1;
  return TAKE10_ACTIVITIES.filter((a) => {
    if (a.requiresFlag && !flags[a.requiresFlag]) return false;
    if (a.requiresAnyFlag && !a.requiresAnyFlag.some((f) => !!flags[f])) return false;
    if (a.requiresTrainedInAny && !a.requiresTrainedInAny.some(isTrained)) return false;
    return true;
  });
}

export default TAKE10_ACTIVITIES;
