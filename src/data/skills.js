// Skill catalog — the PF2e core skills, each tagged with its governing
// ability and its skill actions. Extracted from EnhancedSkillsList so the
// Stats Ability Dial can group skills under their ability node from data
// rather than a hardcoded mapping.
//
// `id` matches the keys used by useCharacter's skillModifiers /
// skillProficiencies / itemBonuses maps; `ability` uses the full lowercase
// ability key ('dexterity'), matching abilityModifiers.

export const ABILITIES = [
  { key: 'strength', abbr: 'STR', name: 'Strength' },
  { key: 'dexterity', abbr: 'DEX', name: 'Dexterity' },
  { key: 'constitution', abbr: 'CON', name: 'Constitution' },
  { key: 'intelligence', abbr: 'INT', name: 'Intelligence' },
  { key: 'wisdom', abbr: 'WIS', name: 'Wisdom' },
  { key: 'charisma', abbr: 'CHA', name: 'Charisma' },
];

// Which saving throw an ability governs (abilities without a save omit it).
// `stat` is the modifier-channel key used by computeConditionEffects /
// computeEffectBonuses; `saveKey` indexes useCharacter's `saves` object.
export const SAVES_BY_ABILITY = {
  constitution: { saveKey: 'fortitude', stat: 'fort', label: 'Fortitude' },
  dexterity: { saveKey: 'reflex', stat: 'reflex', label: 'Reflex' },
  wisdom: { saveKey: 'will', stat: 'will', label: 'Will' },
};

export const SKILLS = [
  {
    id: 'acrobatics',
    name: 'Acrobatics',
    ability: 'dexterity',
    actions: [
      { name: 'Balance', description: 'Move across a narrow surface or uneven ground.' },
      { name: 'Tumble Through', description: "Move through an enemy's space." },
      { name: 'Squeeze', description: 'Contort your body to move through tight spaces.' }
    ]
  },
  {
    id: 'arcana',
    name: 'Arcana',
    ability: 'intelligence',
    actions: [
      { name: 'Recall Knowledge', description: 'About arcane theories, magical traditions, creatures of arcane significance, and planes of arcane significance.' },
      { name: 'Decipher Writing', description: 'Of an arcane nature.' },
      { name: 'Identify Magic', description: 'Specifically of the arcane tradition.' }
    ]
  },
  {
    id: 'athletics',
    name: 'Athletics',
    ability: 'strength',
    actions: [
      { name: 'Climb', description: 'Move up, down, or across an incline.' },
      { name: 'Force Open', description: 'Break open a door, window, container or similar.' },
      { name: 'Grapple', description: 'Grab a creature using a free hand.' },
      { name: 'High Jump', description: 'Jump vertically to reach a higher elevation.' },
      { name: 'Long Jump', description: 'Jump horizontally to clear a gap.' },
      { name: 'Shove', description: 'Push a creature away from you.' },
      { name: 'Swim', description: 'Move through water.' },
      { name: 'Trip', description: 'Try to knock a creature to the ground.' },
      { name: 'Disarm', description: "Try to knock an item out of a creature's grasp." }
    ]
  },
  {
    id: 'crafting',
    name: 'Crafting',
    ability: 'intelligence',
    actions: [
      { name: 'Craft', description: 'Create or repair an item from raw materials.' },
      { name: 'Recall Knowledge', description: 'About alchemical reactions, the value of items, engineering, unusual materials, and alchemical or mechanical creatures.' },
      { name: 'Repair', description: 'Fix a damaged item.' },
      { name: 'Identify Alchemy', description: "Determine an alchemical item's precise effect." }
    ]
  },
  {
    id: 'deception',
    name: 'Deception',
    ability: 'charisma',
    actions: [
      { name: 'Create a Diversion', description: 'Throw off enemies from noticing your tactics.' },
      { name: 'Impersonate', description: 'Pretend to be someone else.' },
      { name: 'Lie', description: 'Convince someone of something false.' },
      { name: 'Feint', description: 'Trick an opponent in melee combat.' }
    ]
  },
  {
    id: 'diplomacy',
    name: 'Diplomacy',
    ability: 'charisma',
    actions: [
      { name: 'Gather Information', description: 'Collect information about a specific topic.' },
      { name: 'Make an Impression', description: "Improve a creature's attitude toward you." },
      { name: 'Request', description: 'Get a creature to do what you want.' }
    ]
  },
  {
    id: 'intimidation',
    name: 'Intimidation',
    ability: 'charisma',
    actions: [
      { name: 'Coerce', description: 'Force someone to do what you want under threat.' },
      { name: 'Demoralize', description: 'Frighten an enemy to become off-guard.' }
    ]
  },
  {
    id: 'medicine',
    name: 'Medicine',
    ability: 'wisdom',
    actions: [
      { name: 'Administer First Aid', description: 'Stabilize a dying creature or stop bleeding.' },
      { name: 'Recall Knowledge', description: 'About diseases, injuries, poisons, and other ailments.' },
      { name: 'Treat Disease', description: 'Provide care to a diseased creature.' },
      { name: 'Treat Poison', description: 'Treat a poisoned creature.' },
      { name: 'Treat Wounds', description: 'Restore Hit Points to a living creature.' }
    ]
  },
  {
    id: 'nature',
    name: 'Nature',
    ability: 'wisdom',
    actions: [
      { name: 'Command an Animal', description: 'Get an animal to perform a task.' },
      { name: 'Recall Knowledge', description: 'About fauna, flora, geography, weather, creatures of natural origin, and natural planes.' },
      { name: 'Identify Magic', description: 'Specifically of the primal tradition.' }
    ]
  },
  {
    id: 'occultism',
    name: 'Occultism',
    ability: 'intelligence',
    actions: [
      { name: 'Recall Knowledge', description: 'About ancient mysteries, obscure philosophies, creatures of occult significance, and esoteric planes.' },
      { name: 'Decipher Writing', description: 'Of an occult nature.' },
      { name: 'Identify Magic', description: 'Specifically of the occult tradition.' }
    ]
  },
  {
    id: 'perception',
    name: 'Perception',
    ability: 'wisdom',
    actions: [
      { name: 'Seek', description: 'Try to find something hidden, or a hiding creature you expect is around.' },
      { name: 'Sense Motive', description: `You try to tell whether a creature's behavior is abnormal or indicative of something.` },
    ]
  },
  {
    id: 'performance',
    name: 'Performance',
    ability: 'charisma',
    actions: [
      { name: 'Perform', description: 'Put on a performance for an audience.' }
    ]
  },
  {
    id: 'religion',
    name: 'Religion',
    ability: 'wisdom',
    actions: [
      { name: 'Recall Knowledge', description: 'About divine agents, the finer points of theology, obscure myths, creatures of religious significance, and divine planes.' },
      { name: 'Decipher Writing', description: 'Of a religious nature.' },
      { name: 'Identify Magic', description: 'Specifically of the divine tradition.' }
    ]
  },
  {
    id: 'society',
    name: 'Society',
    ability: 'intelligence',
    actions: [
      { name: 'Recall Knowledge', description: 'About local history, important personalities, legal institutions, societal structure, and humanoid cultures.' },
      { name: 'Create Forgery', description: 'Create fake documents.' },
      { name: 'Decipher Writing', description: 'In a language you know or a cypher.' },
      { name: 'Subsist', description: 'Find food and shelter in a settlement.' }
    ]
  },
  {
    id: 'stealth',
    name: 'Stealth',
    ability: 'dexterity',
    actions: [
      { name: 'Conceal an Object', description: 'Hide an object from detection.' },
      { name: 'Hide', description: 'Make yourself hidden from observation.' },
      { name: 'Sneak', description: 'Move without being detected.' }
    ]
  },
  {
    id: 'survival',
    name: 'Survival',
    ability: 'wisdom',
    actions: [
      { name: 'Sense Direction', description: 'Find your way in the wild.' },
      { name: 'Track', description: "Follow a creature's trail." },
      { name: 'Cover Tracks', description: 'Hide a trail you leave behind.' },
      { name: 'Subsist', description: 'Live off the land in the wilderness.' }
    ]
  },
  {
    id: 'thievery',
    name: 'Thievery',
    ability: 'dexterity',
    actions: [
      { name: 'Disable Device', description: 'Disarm a trap or similar device.' },
      { name: 'Pick a Lock', description: 'Open a lock without a key.' },
      { name: 'Palm an Object', description: 'Take an object without being noticed.' },
      { name: 'Steal', description: 'Take an object from another creature.' }
    ]
  }
];

export const skillsForAbility = (abilityKey) =>
  SKILLS.filter((skill) => skill.ability === abilityKey);
