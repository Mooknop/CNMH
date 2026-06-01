export const BASIC_ACTIONS_OFFENSIVE = [
  {
    name: 'Strike',
    actionCount: 1,
    traits: ['Attack'],
    description: 'You attack with a weapon you\'re wielding or with an unarmed attack, targeting one creature within your reach (for melee attacks) or within range (for ranged attacks).',
  },
  {
    name: 'Escape',
    actionCount: 1,
    traits: ['Attack'],
    description: 'You attempt to escape from being grabbed, immobilized, or restrained. Choose one creature, object, or spell effect that is imposing one of those conditions on you, then attempt a check using your unarmed attack modifier against the DC of the effect.',
  },
  {
    name: 'Feint',
    actionCount: 1,
    traits: ['Mental'],
    highlightSkill: 'deception',
    description: '(Deception, trained) With a misleading flourish, you leave your foe unprepared for your real attack. Attempt a Deception check against your target\'s Perception DC. If you succeed, the target is flat-footed against melee attacks you make against it until the end of your next turn.',
  },
  {
    name: 'Grapple',
    actionCount: 1,
    traits: ['Attack'],
    highlightSkill: 'athletics',
    description: '(Athletics) You attempt to grab a creature or object with your free hand. Attempt an Athletics check against the target\'s Fortitude DC. If you succeed, the target gains the grabbed condition. If you critically succeed, the target is restrained instead.',
  },
  {
    name: 'Shove',
    actionCount: 1,
    traits: ['Attack'],
    highlightSkill: 'athletics',
    description: '(Athletics) You push an enemy away from you. Attempt an Athletics check against your target\'s Fortitude DC. If you succeed, you push the target 5 feet away from you. You can follow the target to stay adjacent to it if you choose.',
  },
  {
    name: 'Trip',
    actionCount: 1,
    traits: ['Attack'],
    highlightSkill: 'athletics',
    description: '(Athletics) You try to throw your opponent off balance. Attempt an Athletics check against the target\'s Reflex DC. If you succeed, the target falls and gains the prone condition.',
  },
  {
    name: 'Disarm',
    actionCount: 1,
    traits: ['Attack'],
    highlightSkill: 'athletics',
    description: '(Athletics, trained) You try to knock something out of an opponent\'s grasp. Attempt an Athletics check against the target\'s Reflex DC. If you succeed, the item becomes loosely held; if you critically succeed, you may take the item or move it to a free hand of your choice.',
  },
  {
    name: 'Reposition',
    actionCount: 1,
    traits: ['Attack'],
    highlightSkill: 'athletics',
    description: '(Athletics, trained) You try to move an opponent to a location beneficial to you. Attempt an Athletics check against the target\'s Reflex DC. If you succeed, you move the target up to 5 feet into a space within your reach; if you critically succeed, up to 10 feet.',
  },
];

export const BASIC_ACTIONS_DEFENSIVE = [
  {
    name: 'Raise a Shield',
    actionCount: 1,
    traits: [],
    description: 'You position your shield to protect yourself. When you have Raised a Shield, you gain its listed circumstance bonus to AC until the start of your next turn, as long as you continue to meet its requirements.',
  },
  {
    name: 'Take Cover',
    actionCount: 1,
    traits: [],
    description: 'You press yourself against a wall or duck behind an obstacle to take better advantage of cover. If you are in cover or greater cover, you gain a +4 circumstance bonus to Stealth checks until you move, take an attack, or otherwise end the cover.',
  },
  {
    name: 'Seek',
    actionCount: 1,
    traits: ['Concentrate', 'Secret'],
    description: 'You scan an area for signs of creatures or objects. Choose an area no larger than a 30-foot cone or a 15-foot burst within line of sight. You attempt a Perception check against the Stealth DC of each hidden creature in that area.',
  },
  {
    name: 'Aid',
    actionCount: 1,
    traits: ['Auditory', 'Concentrate'],
    description: 'When you use the Ready action to Aid, you prepare to help an ally. On their turn, if they attempt the triggering action, attempt a skill check against a DC of 20 (or higher). On a success you grant them a +2 circumstance bonus; on a critical success, a +3 bonus.',
  },
  {
    name: 'Point Out',
    actionCount: 1,
    traits: ['Auditory', 'Manipulate', 'Visual'],
    description: 'With a gesture or a shout, you indicate a hidden creature\'s location to your allies. Attempt a DC 10 flat check. On a success, the creature becomes observed to your allies until the end of your next turn.',
  },
  {
    name: 'Ready',
    actionCount: 2,
    traits: ['Concentrate'],
    description: 'You prepare to use an action that will occur outside your turn. Choose a single action or free action you can use, and designate a trigger. Your action is held until the trigger is met or your next turn begins (whichever comes first).',
  },
  {
    name: 'Interact',
    actionCount: 1,
    traits: ['Manipulate'],
    description: 'You use your hand or hands to manipulate an object or the terrain. You can grab an unattended or stored object, open or close a door or container, withdraw a stored item, or perform a similar action.',
  },
];

export const BASIC_ACTIONS_MOVEMENT = [
  {
    name: 'Stride',
    actionCount: 1,
    traits: ['Move'],
    requiresTarget: false,
    description: 'You move up to your Speed.',
  },
  {
    name: 'Step',
    actionCount: 1,
    traits: ['Move'],
    requiresTarget: false,
    description: "You carefully move 5 feet. Unlike Stride, this movement doesn't trigger reactions that are triggered by movement.",
  },
  {
    name: 'Stand',
    actionCount: 1,
    traits: ['Move'],
    requiresTarget: false,
    description: 'You stand up from prone. Standing up ends the prone condition.',
  },
  {
    name: 'Drop Prone',
    actionCount: 1,
    traits: ['Move'],
    requiresTarget: false,
    description: 'You fall prone. You can drop prone only if you\'re standing on a surface.',
  },
  {
    name: 'Crawl',
    actionCount: 1,
    traits: ['Move'],
    requiresTarget: false,
    description: 'You move 5 feet by crawling while prone. Crawling ends if you stop being prone.',
  },
  {
    name: 'Leap',
    actionCount: 1,
    traits: ['Move'],
    requiresTarget: false,
    description: 'You take a careful, short jump. You can Leap up to 10 feet horizontally if your Speed is at least 15 feet, or up to 15 feet if your Speed is at least 30 feet. You land in the first unoccupied space within that distance.',
  },
  {
    name: 'Balance',
    actionCount: 1,
    traits: ['Move'],
    requiresTarget: false,
    description: '(Acrobatics) You move across a narrow surface or uneven ground, attempting an Acrobatics check against the DC of the surface. If you fail, you stop moving and must succeed at a Reflex save against the same DC or fall.',
  },
  {
    name: 'Tumble Through',
    actionCount: 1,
    traits: ['Move'],
    description: '(Acrobatics) You Stride up to your Speed. During this movement you can move through the space of one enemy. Attempt an Acrobatics check against the enemy\'s Reflex DC as you try to move through their space.',
  },
  {
    name: 'Hide',
    actionCount: 1,
    traits: ['Secret'],
    requiresTarget: false,
    highlightSkill: 'stealth',
    description: '(Stealth) You huddle behind cover or concealment to become hidden. Attempt a Stealth check. If you succeed against the Perception DC of each creature you were observed by, you become hidden to those creatures.',
  },
  {
    name: 'Sneak',
    actionCount: 1,
    traits: ['Move', 'Secret'],
    requiresTarget: false,
    highlightSkill: 'stealth',
    description: '(Stealth) You move up to half your Speed and attempt a Stealth check. If you succeed against the Perception DC of each creature you were hidden from, you remain hidden. If you\'re undetected, you remain undetected.',
  },
];

export const BASIC_ENCOUNTER_FREE_ACTIONS = [
  {
    name: 'Delay',
    trigger: 'Your turn begins.',
    traits: ['Concentrate'],
    description: 'You wait for the right moment to act. The rest of your turn does nothing. You can return to the initiative order at any point before your next turn, taking your full turn at that point.',
  },
  {
    name: 'Release',
    trigger: 'Your turn begins, or as a reaction.',
    traits: ['Manipulate'],
    description: 'You release something you\'re holding in your hand or hands. Unlike the Interact action, Release does not trigger reactions that are triggered by manipulating items.',
  },
];
