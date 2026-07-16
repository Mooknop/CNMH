/**
 * Encounter scripts (#1472): bundles of encounter-track definitions the GM
 * launches from one button instead of hand-authoring modals mid-session.
 * Each track is a challenge doc minus the launch-time fields (id, target,
 * targetIds, createdAt, sceneRound), which EncounterScriptsModal stamps.
 *
 * Content note: skills/DCs/thresholds are rules mechanics (fine to commit);
 * tier notes and reminders are short original-wording GM cues — verbatim
 * adventure prose stays out of the public repo.
 */

export const ENCOUNTER_SCRIPTS = [
  {
    id: 'call-spirit-ritual',
    name: 'Call Spirit Ritual',
    description:
      'The cathedral courtyard, all at once: keep the ritual stable against the shadows, ' +
      'talk the mob down at the doors, and reach Nualia across the veil — every check ' +
      'competes with the fight for actions.',
    tracks: [
      {
        name: 'Bolster the Ritual',
        skills: [
          { skill: 'arcana', dc: 19 },
          { skill: 'occultism', dc: 19 },
          { skill: 'intimidation', dc: 19 },
          { skill: 'performance', dc: 19 },
          { skill: 'religion', dc: 19 },
        ],
        threshold: null,
        startValue: 6,
        min: 0,
        failAt: 0,
        drainPerRound: 0, // set live each round to the number of unengaged shadows
        mode: 'perRound',
        actionCost: 1,
      },
      {
        name: 'Assuage the Locals',
        skills: [
          { skill: 'society', dc: 23 },
          { skill: 'diplomacy', dc: 19 },
          { skill: 'deception', dc: 20 },
          { skill: 'intimidation', dc: 18 },
        ],
        threshold: 3,
        mode: 'once',
        actionCost: 0, // resolved at the cathedral doors, away from the fight
      },
      {
        kind: 'influence',
        name: "Nualia's Spirit",
        skills: [
          { skill: 'society', dc: 18 },
          { skill: 'religion', dc: 19 },
          { skill: 'diplomacy', dc: 19 },
          { skill: 'deception', dc: 20 },
          { skill: 'intimidation', dc: 22 },
        ],
        discoveries: [
          { skill: 'occultism', dc: 18 }, // stands in for Demon Lore
          { skill: 'society', dc: 19 },
        ],
        tiers: [
          { at: 3, note: 'Still bitter — she and Chopper were only early dooms; seven more await Sandpoint.' },
          { at: 6, note: 'Sorrow displaces anger — she mourns the town; her tormentors doomed their own children.' },
          { at: 9, note: 'Sadness wins out — she asks the PCs to seek her beyond the grave, warns of the one on red wings, and fades.' },
        ],
        resistNote:
          'Failed check mentioning Sandpoint: +2 all DCs (+4 on a crit fail). ' +
          'Mentioning Ezakien Tobyn: +2 all DCs. ' +
          'Once enraged over Tobyn, a success censuring him: −4 all DCs.',
        roundsTotal: 10,
        threshold: null,
        mode: 'perRound',
        actionCost: 1,
      },
    ],
  },
];

export default ENCOUNTER_SCRIPTS;
