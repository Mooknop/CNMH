// Bootstrap seed for the armor property-rune catalog (#727, R2). The armor
// mirror of pf2eRunes.js: each entry is a property-rune doc with the mechanical
// schema the R1 resolver (utils/armorRunes.js) forwards when a rune is etched
// onto an armor via its `runes.property` array. R3 (#734) wires the GM editor,
// rune slots, and display against this catalog.
//
// Two rune shapes:
//   • modifier runes (Slick, Shadow) carry a flat `modifiers: [{stat,kind,amount}]`
//     block that flows onto the sheet through the #726 worn-gear spine. These are
//     SKILL bonuses, so they stay dormant until W2 (#731) teaches the effect
//     engine about skills — the seed is ready ahead of that.
//   • reminder runes carry `riders: [{id,text}]` passive descriptors with no
//     engine side-effect; they surface as on-sheet reminders. Runes whose active
//     ability (aura / reaction) is automated later point at the #728 slice.
//
// Fundamental runes (Armor Potency, Resilient) are NOT here — they live as fixed
// tables in utils/armorRunes.js (R1). The buyable shop-ware counterparts of
// these runes are separate `item` entries (armorRune:true) authored in content
// C2 (#742); this catalog is the etch-time mechanical source.
//
// Levels follow the canonical PF2e printings; prices match the C2 item entries.

const armorPropertyRunes = [
  {
    id: 'slick',
    type: 'property',
    armorRune: true,
    name: 'Slick',
    level: 5,
    price: 45,
    description:
      'The defenses provided by this rune make it harder for foes to grab you. ' +
      'While wearing the etched armor, you gain a +1 item bonus to Acrobatics ' +
      'checks to Escape and to Squeeze.',
    // Conditional to Escape/Squeeze; the worn-gear spine applies it as a skill
    // bonus once W2 lands, and the reminder notes the action limitation.
    modifiers: [{ stat: 'acrobatics', kind: 'item', amount: 1 }],
    riders: [{ id: 'slick-reminder', text: 'Bonus applies only to Acrobatics checks to Escape or Squeeze.' }],
  },
  {
    id: 'shadow',
    type: 'property',
    armorRune: true,
    name: 'Shadow',
    level: 5,
    price: 55,
    description:
      'Shadow runes make armor lighter and softer. While wearing the etched ' +
      'armor, you gain a +1 item bonus to Stealth checks.',
    modifiers: [{ stat: 'stealth', kind: 'item', amount: 1 }],
  },
  {
    id: 'ready',
    type: 'property',
    armorRune: true,
    name: 'Ready',
    level: 6,
    price: 200,
    description:
      'A ready rune lets you don or remove the etched armor in only a few ' +
      'seconds rather than minutes.',
    riders: [{ id: 'ready-reminder', text: 'Don or remove this armor as a single action (1 action) rather than minutes.' }],
  },
  {
    id: 'quenching',
    type: 'property',
    armorRune: true,
    name: 'Quenching',
    level: 6,
    price: 250,
    description:
      'This rune counters burning and corrosive agents. Armor with this rune ' +
      'reduces the DC of the flat check to end persistent acid or fire damage ' +
      'affecting you from 15 to 12 (7 with particularly effective assistance).',
    riders: [{ id: 'quenching-reminder', text: 'Persistent acid/fire flat check DC 15 → 12 (7 with effective assistance).' }],
  },
  {
    id: 'aim-aiding',
    type: 'property',
    armorRune: true,
    name: 'Aim-Aiding',
    level: 6,
    price: 225,
    description:
      'Armor etched with this rune aids in routing ranged attacks aimed at an ' +
      "enemy around you. You don't provide enemies cover against your allies' " +
      'ranged attacks.',
    riders: [{ id: 'aim-aiding-reminder', text: "You don't grant enemies cover against your allies' ranged attacks." }],
  },
  {
    id: 'dread',
    type: 'property',
    armorRune: true,
    name: 'Dread (Lesser)',
    level: 6,
    price: 225,
    description:
      'Eerie symbols cover your armor, inspiring terror in your foes. ' +
      'Frightened enemies within 30 feet that can see you must attempt a DC 20 ' +
      "Will save at the end of their turn; on a failure, the value of their " +
      "frightened condition doesn't decrease below 1 that turn.",
    riders: [{ id: 'dread-reminder', text: 'Frightened foes within 30 ft that can see you save DC 20 Will or stay frightened ≥1.' }],
    // End-of-turn aura save reminder (#728 E2).
    aura: {
      save: 'will',
      dc: 20,
      range: 30,
      requires: 'frightened',
      sight: true,
      effect: "the frightened value doesn't drop below 1 this turn",
    },
  },
  {
    id: 'swallow-spike',
    type: 'property',
    armorRune: true,
    name: 'Swallow-Spike',
    level: 6,
    price: 200,
    description:
      'Your armor responds to your desire to break free of a creature grabbing ' +
      'you by growing spikes. Attacks made by armor with the swallow-spike rune ' +
      'apply the multiple attack penalty as if you had made them with another weapon.',
    riders: [{ id: 'swallow-spike-reminder', text: 'When grabbed/restrained, react to attack the grabber with armor spikes.' }],
    // E1 (#735): the triggered Grow Spikes reaction + Renewed Assault action.
    // "Guided manual" — the description states the formula for the player/GM to
    // roll; the attack's item bonus is the armor's own AC item bonus (potency).
    reactions: [
      {
        name: 'Grow Spikes',
        triggerType: 'grabbed',
        traits: ['Attack', 'Concentrate'],
        trigger: "You become grabbed, restrained, or otherwise immobilized in a creature's grasp (including being engulfed or swallowed).",
        description:
          'The armor attacks the immobilizing creature with a melee Strike: +14 ' +
          '(greater +22), dealing 2d6 piercing (greater 3d6), plus 1d6 extra if ' +
          'the creature is swallowing or engulfing you. Add an item bonus to the ' +
          "attack equal to the armor's AC item bonus, and an item bonus to damage " +
          'equal to double that. This Strike applies (and increases) the multiple ' +
          'attack penalty as a separate weapon. If the damage equals or exceeds the ' +
          "immobilizing ability's Rupture value, you cut yourself free.",
      },
    ],
    actions: [
      {
        name: 'Renewed Assault',
        actions: 'One Action',
        traits: ['Attack', 'Concentrate'],
        trigger: "You're being held immobilized as described in the Grow Spikes reaction.",
        description: 'The armor attacks the immobilizing creature again, as the Grow Spikes reaction.',
      },
    ],
  },
];

export default armorPropertyRunes;

// id -> armor property-rune doc, for resolving an armor's runes.property refs
// against the seed (R3 wiring / GM editor).
export const armorRuneCatalogMap = () => {
  const map = new Map();
  armorPropertyRunes.forEach((r) => map.set(r.id, r));
  return map;
};
