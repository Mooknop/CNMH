// requiresFlag: key on the flags object from useCharacter() that must be true
// requiresAnyFlag: array of flag keys — activity shows if any one is true
// requiresTrainedInAny: array of skill IDs — activity shows if character is Trained (rank ≥ 1) in any one
// highlightSkills: array of skill IDs — highlight card if character is Expert+ in any one (best rank wins)
// category: grouping label shown as a section divider in the UI

export const CATEGORY_ORDER = ['Scouting', 'Social', 'Knowledge', 'Magic', 'Healing'];

export const EXPLORATION_ACTIVITIES = [
  // ── Scouting ────────────────────────────────────────────────────────────────
  {
    name: 'Avoid Notice',
    category: 'Scouting',
    traits: ['Exploration'],
    skill: 'Stealth',
    highlightSkills: ['stealth'],
    description: 'You attempt a Stealth check at the start of exploration to try to avoid notice. If you succeed, you gain the benefits of the Avoiding Notice exploration activity (hidden from creatures that haven\'t noticed you). You move at half speed while Avoiding Notice.',
  },
  {
    name: 'Defend',
    category: 'Scouting',
    traits: ['Exploration'],
    skill: 'Perception',
    highlightSkills: ['perception'],
    description: 'You move at half your travel speed with your shield raised. If you have the Shield Block reaction, you can use it while traveling. You also watch for danger, giving you a +2 circumstance bonus to Perception checks to detect hazards and preventing you from being surprised.',
  },
  {
    name: 'Hustle',
    category: 'Scouting',
    traits: ['Exploration'],
    description: 'You move at double your travel speed. You can Hustle only for a number of minutes equal to your Constitution modifier × 10 (minimum 10 minutes) before becoming Fatigued.',
  },
  {
    name: 'Scout',
    category: 'Scouting',
    traits: ['Exploration'],
    skill: 'Perception',
    highlightSkills: ['perception'],
    description: 'You move ahead of the rest of the group at half speed and report back on potential threats. When your group encounters a hazard or enemy, the entire group gains a +1 circumstance bonus to initiative rolls, as long as you aren\'t surprised.',
  },
  {
    name: 'Search',
    category: 'Scouting',
    traits: ['Concentrate', 'Exploration', 'Secret'],
    skill: 'Perception',
    highlightSkills: ['perception'],
    description: 'You move at half speed and Seek everything within 30 feet of you, detecting any hidden creatures or objects as you go. While Searching, you can detect secret doors and other concealed features.',
  },
  {
    name: 'Sense Direction',
    category: 'Scouting',
    traits: ['Concentrate', 'Exploration', 'Secret'],
    skill: 'Survival',
    highlightSkills: ['survival'],
    description: 'Using your innate sense of direction, you can determine which way is north and roughly where you are. You can also attempt to find your way to a specific location. You move at full speed while using this activity.',
  },

  // ── Social ───────────────────────────────────────────────────────────────────
  {
    name: 'Coerce',
    category: 'Social',
    traits: ['Auditory', 'Concentrate', 'Emotion', 'Exploration', 'Linguistic', 'Mental'],
    skill: 'Intimidation',
    highlightSkills: ['intimidation'],
    description: 'With threats, you attempt to convince a creature to do what you want. Attempt an Intimidation check with a +4 circumstance bonus against the target\'s Will DC, modified by their attitude toward you. On a success they comply until end of scene; on a critical success until end of next encounter.',
  },
  {
    name: 'Follow the Expert',
    category: 'Social',
    traits: ['Auditory', 'Concentrate', 'Exploration', 'Visual'],
    skill: 'Perception',
    description: 'You follow another party member who is performing a different exploration activity. You must be able to see and hear the expert. You gain a +2 circumstance bonus to any skill checks the expert makes that you also need to attempt (such as Stealth or Recall Knowledge), as long as the expert succeeds.',
  },
  {
    name: 'Gather Information',
    category: 'Social',
    traits: ['Exploration', 'Secret'],
    skill: 'Diplomacy',
    highlightSkills: ['diplomacy'],
    description: 'You canvass local sources for information about a specific topic. Attempt a Diplomacy check against a DC determined by the local rumor mill and how obscure the information is. After 2 hours of gathering information you get the GM\'s report.',
  },
  {
    name: 'Impersonate',
    category: 'Social',
    traits: ['Concentrate', 'Exploration', 'Manipulate', 'Secret'],
    skill: 'Deception',
    highlightSkills: ['deception'],
    description: 'You create a disguise to pass as a different type of person, a specific individual, or a different ancestry. Attempt a Deception check. Onlookers make Perception checks to see through your disguise; you use your Deception check result against their Perception DCs.',
  },
  {
    name: 'Make an Impression',
    category: 'Social',
    traits: ['Auditory', 'Concentrate', 'Emotion', 'Exploration', 'Linguistic', 'Mental'],
    skill: 'Diplomacy',
    highlightSkills: ['diplomacy'],
    description: 'With at least 1 minute of conversation, you can attempt to change a creature\'s attitude toward you. Attempt a Diplomacy check against the creature\'s Will DC to improve their attitude one step (two steps on a critical success).',
  },
  {
    name: 'Request',
    category: 'Social',
    traits: ['Auditory', 'Concentrate', 'Emotion', 'Exploration', 'Linguistic', 'Mental'],
    skill: 'Diplomacy',
    highlightSkills: ['diplomacy'],
    description: 'You ask a creature to do something. Attempt a Diplomacy check against the creature\'s Will DC. The DC is adjusted based on how reasonable the request is. On a success the creature agrees; on a failure they refuse.',
  },

  // ── Knowledge ────────────────────────────────────────────────────────────────
  {
    name: 'Investigate',
    category: 'Knowledge',
    traits: ['Concentrate', 'Exploration'],
    skill: 'Recall Knowledge (varies)',
    description: 'You attempt to learn more about your surroundings as you travel. You move at half speed and spend time studying your environment, attempting Recall Knowledge checks on creatures, hazards, and events you encounter.',
  },
  {
    name: 'Decipher Writing',
    category: 'Knowledge',
    traits: ['Concentrate', 'Exploration', 'Linguistic', 'Secret'],
    skill: 'Arcana / Occultism / Religion / Society (trained)',
    highlightSkills: ['arcana', 'occultism', 'religion', 'society'],
    requiresTrainedInAny: ['arcana', 'occultism', 'religion', 'society'],
    description: 'You study a piece of writing to decode it. Attempt the appropriate skill check (Arcana, Occultism, Religion, or Society) against the DC determined by the complexity of the writing. You must be trained in the skill to attempt this.',
  },

  // ── Magic ────────────────────────────────────────────────────────────────────
  {
    name: 'Detect Magic',
    category: 'Magic',
    traits: ['Concentrate', 'Exploration', 'Secret'],
    skill: 'Arcana / Nature / Occultism / Religion',
    highlightSkills: ['arcana', 'nature', 'occultism', 'religion'],
    requiresAnyFlag: ['hasSpellcasting', 'hasFocusSpells'],
    description: 'You cast detect magic at regular intervals, scanning for magical auras while you travel. You move at half speed. Any magical auras you pass within 30 feet are automatically detected, as well as most magical items.',
  },
  {
    name: 'Repeat a Spell',
    category: 'Magic',
    traits: ['Concentrate', 'Exploration'],
    requiresAnyFlag: ['hasSpellcasting', 'hasFocusSpells'],
    description: 'You repeatedly cast the same spell while exploring. You move at half speed. The spell must be one you can cast, and you must cast it at regular intervals. This is useful for spells like detect magic or light that have ongoing effects.',
  },
  {
    name: 'Identify Magic',
    category: 'Magic',
    traits: ['Concentrate', 'Exploration', 'Secret'],
    skill: 'Arcana / Nature / Occultism / Religion (trained)',
    highlightSkills: ['arcana', 'nature', 'occultism', 'religion'],
    requiresFlag: 'hasSpellcasting',
    requiresTrainedInAny: ['arcana', 'nature', 'occultism', 'religion'],
    description: 'Using the appropriate skill, you can attempt to identify a magic item or ongoing magical effect. The DC is set by the GM based on the rarity of the magic. You must be trained in the skill to attempt this.',
  },
  {
    name: 'Learn a Spell',
    category: 'Magic',
    traits: ['Concentrate', 'Exploration'],
    skill: 'Arcana / Nature / Occultism / Religion (trained)',
    highlightSkills: ['arcana', 'nature', 'occultism', 'religion'],
    requiresFlag: 'hasSpellcasting',
    requiresTrainedInAny: ['arcana', 'nature', 'occultism', 'religion'],
    description: 'You spend time learning a new spell from a spellbook or another caster. Attempt a skill check against the spell\'s DC. On a success you add the spell to your spell list or spellbook. The process takes 1 hour per spell level.',
  },
  {
    name: 'Refocus',
    category: 'Magic',
    traits: ['Concentrate', 'Exploration'],
    requiresFlag: 'hasFocusSpells',
    description: 'You spend 10 minutes performing deeds that restore your magical connection, regaining 1 Focus Point. Your class or ability may specify how you Refocus (meditation, prayer, practicing a skill, etc.).',
  },

  // ── Healing ──────────────────────────────────────────────────────────────────
  {
    name: 'Treat Wounds',
    category: 'Healing',
    traits: ['Exploration', 'Healing', 'Manipulate'],
    skill: 'Medicine (trained)',
    highlightSkills: ['medicine'],
    requiresTrainedInAny: ['medicine'],
    description: 'You spend 10 minutes treating a creature\'s wounds (including yourself), attempting a Medicine check against DC 15. On a success the target regains 2d8 HP; on a critical success 4d8 HP. The target can\'t benefit from this again for 1 hour.',
  },
  {
    name: 'Treat Poison',
    category: 'Healing',
    traits: ['Exploration', 'Manipulate'],
    skill: 'Medicine (trained)',
    highlightSkills: ['medicine'],
    requiresTrainedInAny: ['medicine'],
    description: 'You treat a poisoned creature during exploration. Attempt a Medicine check with the DC depending on the poison. On a success you grant the target a +2 circumstance bonus to saving throws against the poison.',
  },
];
