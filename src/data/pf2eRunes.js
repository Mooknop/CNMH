// Bootstrap seed for the property-rune catalog (#548 Slice 3). The `rune`
// collection is brand-new, so — like pf2eEffects.js for effects — this file
// provides the first-seed content until the snapshot carries a `rune` array.
//
// Property runes are an open-ended catalog the GM extends. Each carries a rich
// `rider` schema (conditional-on-target via `vsTrait`, persistent damage,
// crit-triggered conditions) that weaponRunes.translatePropertyRider folds into
// the flat #222 damage-step riders. Potency/striking tiers are NOT catalog
// entries — they live as fixed tables in src/utils/weaponRunes.js.

const propertyRunes = [
  {
    id: 'vitalizing',
    type: 'property',
    name: 'Vitalizing',
    level: 5,
    price: 150,
    description:
      'A vitalizing rune draws on positive energy. Against undead, the weapon deals 1d6 ' +
      'persistent vitality damage, and a critical hit also leaves the target enfeebled 1 ' +
      'until the end of your next turn.',
    rider: {
      vsTrait: 'undead',
      persistent: '1d6',
      damageType: 'vitality',
      onCrit: {
        conditions: [{ name: 'enfeebled', value: 1, duration: 'end-of-next-turn' }],
      },
    },
  },
  {
    id: 'vitalizing-greater',
    type: 'property',
    name: 'Vitalizing (Greater)',
    level: 14,
    price: 4300,
    description:
      'A greater vitalizing rune deals 2d6 persistent vitality damage to undead, and a ' +
      'critical hit leaves the target enfeebled 1 and stupefied 1 while the persistent ' +
      'damage continues.',
    rider: {
      vsTrait: 'undead',
      persistent: '2d6',
      damageType: 'vitality',
      onCrit: {
        conditions: [
          { name: 'enfeebled', value: 1, duration: 'while-persistent' },
          { name: 'stupefied', value: 1, duration: 'while-persistent' },
        ],
      },
    },
  },
];

export default propertyRunes;
