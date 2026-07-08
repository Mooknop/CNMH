// PF2e Core Rulebook conditions (2nd printing / Remaster compatible)
// valued: condition has a numeric value (Frightened 1, Clumsy 2, etc.)
// maxValue: highest allowed value for valued conditions
// decrements: value reduces by 1 at end of each turn
// summary: one-line mechanical description shown in the browser grid
// effect: function(value) -> string shown on active condition cards

const PF2E_CONDITIONS = [
  // ── Valued conditions ──────────────────────────────────────────────
  {
    id: 'clumsy',
    name: 'Clumsy',
    valued: true,
    maxValue: 4,
    decrements: false,
    summary: 'Status penalty to Dex-based checks and DCs',
    effect: (v) => `-${v} status penalty to Dexterity-based checks, AC, Reflex saves, and ranged attacks`,
  },
  {
    id: 'drained',
    name: 'Drained',
    valued: true,
    maxValue: 4,
    decrements: false,
    summary: 'Status penalty to Con checks; reduced max HP',
    effect: (v) => `-${v} status penalty to Constitution-based checks and saves; max HP reduced by ${v} × level`,
  },
  {
    id: 'enfeebled',
    name: 'Enfeebled',
    valued: true,
    maxValue: 4,
    decrements: false,
    summary: 'Status penalty to Str-based checks and DCs',
    effect: (v) => `-${v} status penalty to Strength-based checks, attack rolls, and damage rolls`,
  },
  {
    id: 'frightened',
    name: 'Frightened',
    valued: true,
    maxValue: 4,
    decrements: true,
    summary: 'Status penalty to all checks and DCs',
    effect: (v) => `-${v} status penalty to all checks and DCs; decrements by 1 at end of each turn`,
  },
  {
    id: 'sickened',
    name: 'Sickened',
    valued: true,
    maxValue: 4,
    decrements: false,
    summary: 'Status penalty to all checks and DCs',
    effect: (v) => `-${v} status penalty to all checks and DCs; can Retch (Fortitude DC 15 + ${v}) to reduce`,
  },
  {
    id: 'slowed',
    name: 'Slowed',
    valued: true,
    maxValue: 3,
    decrements: false,
    summary: 'Lose actions each turn',
    effect: (v) => `Lose ${v} action${v > 1 ? 's' : ''} at the start of each turn`,
  },
  {
    id: 'stunned',
    name: 'Stunned',
    valued: true,
    maxValue: 4,
    decrements: true,
    summary: 'Lose actions; value decrements each turn',
    effect: (v) => `Lose actions equal to value (${v}) at start of turn; value decrements until 0`,
  },
  {
    id: 'stupefied',
    name: 'Stupefied',
    valued: true,
    maxValue: 4,
    decrements: false,
    summary: 'Status penalty to Int/Wis/Cha checks and spell DCs',
    effect: (v) => `-${v} status penalty to Int, Wis, and Cha-based checks, saves, spell attack rolls, and spell DCs`,
  },
  {
    id: 'wounded',
    name: 'Wounded',
    valued: true,
    maxValue: 3,
    decrements: false,
    summary: 'Higher dying threshold when you fall unconscious',
    effect: (v) => `If you gain the dying condition, its value increases by ${v}; removed when healed to full HP`,
  },

  // ── Toggle (non-valued) conditions ─────────────────────────────────
  {
    id: 'blinded',
    name: 'Blinded',
    valued: false,
    summary: 'Cannot see; flat-footed; concealed to sighted creatures',
    effect: () => 'Cannot see; flat-footed to all creatures; all sighted creatures are concealed to you',
  },
  {
    id: 'broken',
    name: 'Broken',
    valued: false,
    summary: 'Item non-functional until repaired',
    effect: () => 'Item is non-functional; repair requires Crafting check against the item\'s Repair DC',
  },
  {
    id: 'concealed',
    name: 'Concealed',
    valued: false,
    summary: 'Attackers must succeed DC 5 flat check to target you',
    effect: () => 'Attackers targeting you must succeed at a DC 5 flat check or the attack is lost',
  },
  {
    id: 'confused',
    name: 'Confused',
    valued: false,
    summary: 'Attacks random targets; can\'t use reactions',
    effect: () => 'Cannot use reactions; must use Strike each turn against a random target (GM determines); flat-footed',
  },
  {
    id: 'dazzled',
    name: 'Dazzled',
    valued: false,
    summary: 'All creatures are concealed to you',
    effect: () => 'All creatures and objects are concealed to you (DC 5 flat check to target them)',
  },
  {
    id: 'deafened',
    name: 'Deafened',
    valued: false,
    summary: '-2 Perception for hearing; flat-footed vs auditory',
    effect: () => 'Flat-footed against creatures you can only detect by hearing; -2 status penalty to Perception for hearing-only checks; auditory spells require a DC 5 flat check',
  },
  {
    id: 'dying',
    name: 'Dying',
    valued: false,
    summary: 'Unconscious; making recovery checks each round',
    effect: () => 'Unconscious; must attempt a recovery check (Fortitude DC 10 + dying value) each round or die',
  },
  {
    id: 'encumbered',
    name: 'Encumbered',
    valued: false,
    summary: '-10 ft. Speed; -1 status to Str/Dex checks',
    effect: () => '-10 ft. to all Speeds; -1 status penalty to Strength and Dexterity-based checks',
  },
  {
    id: 'fascinated',
    name: 'Fascinated',
    valued: false,
    summary: '-2 Perception; cannot use concentrate actions',
    effect: () => '-2 status penalty to Perception and skill checks; cannot use actions with the concentrate trait',
  },
  {
    id: 'fatigued',
    name: 'Fatigued',
    valued: false,
    summary: '-1 status penalty to AC and saves',
    effect: () => '-1 status penalty to AC and saving throws; cannot choose to Daily Prep activities',
  },
  {
    id: 'fleeing',
    name: 'Fleeing',
    valued: false,
    summary: 'Must spend actions moving away from source',
    effect: () => 'Must spend each of your actions moving away from the source of the fleeing condition as expediently as possible',
  },
  {
    id: 'grabbed',
    name: 'Grabbed',
    valued: false,
    summary: 'Immobilized and flat-footed',
    effect: () => 'Cannot move (immobilized); flat-footed; can attempt to Escape (Acrobatics/Athletics vs. Athletics of the grabber)',
  },
  {
    id: 'hidden',
    name: 'Hidden',
    valued: false,
    summary: 'Attackers must succeed DC 11 flat check to target you',
    effect: () => 'Your location is known but you cannot be seen; attackers must succeed at a DC 11 flat check or the attack is lost',
  },
  {
    id: 'immobilized',
    name: 'Immobilized',
    valued: false,
    summary: 'Cannot use move actions',
    effect: () => 'Cannot use any action with the move trait',
  },
  {
    id: 'invisible',
    name: 'Invisible',
    valued: false,
    summary: 'Undetected to creatures without special senses',
    effect: () => 'Cannot be seen; automatically undetected to any creature relying on sight (unless they use Seek); attackers who know your location must succeed DC 11 flat check',
  },
  {
    id: 'off-guard',
    name: 'Off-Guard',
    valued: false,
    summary: '-2 circumstance penalty to AC',
    effect: () => '-2 circumstance penalty to AC (formerly Flat-Footed in pre-Remaster rules)',
  },
  {
    id: 'paralyzed',
    name: 'Paralyzed',
    valued: false,
    summary: 'Flat-footed; cannot use actions',
    effect: () => 'Flat-footed; cannot use any actions; still conscious',
  },
  {
    id: 'petrified',
    name: 'Petrified',
    valued: false,
    summary: 'Turned to stone; cannot act',
    effect: () => 'Transformed into stone; cannot use any actions; no longer alive; object Hardness 8 and Hit Points ×4',
  },
  {
    id: 'prone',
    name: 'Prone',
    valued: false,
    summary: '-2 circumstance to attacks; flat-footed',
    effect: () => '-2 circumstance penalty to attack rolls; flat-footed; cannot fly; can Stand (1 action) to remove',
  },
  {
    id: 'quickened',
    name: 'Quickened',
    valued: false,
    summary: 'Gain 1 extra action per turn (restricted type)',
    effect: () => 'Gain 1 additional action at the start of each turn; the source specifies what this action can be used for',
  },
  {
    id: 'restrained',
    name: 'Restrained',
    valued: false,
    summary: 'Immobilized and flat-footed; cannot attack',
    effect: () => 'Cannot use move actions; flat-footed; cannot use attack actions; can attempt Escape',
  },
  {
    id: 'unconscious',
    name: 'Unconscious',
    valued: false,
    summary: 'Sleeping or knocked out; flat-footed; blinded',
    effect: () => 'Flat-footed; blinded; -4 status penalty to Perception; cannot act; falls prone if standing',
  },
  {
    id: 'undetected',
    name: 'Undetected',
    valued: false,
    summary: 'Creatures don\'t know your location',
    effect: () => 'Creatures cannot observe you or know your location; they must Seek (Perception) to detect you; attackers must guess your square (DC 11 flat check, then regular attack roll)',
  },
  // Display-only (#272): the Foundry bridge pushes this slug when persistent
  // damage is applied to a PC in Foundry — without a definition here,
  // hydrateConditions silently dropped it. App-side tracking lives in
  // cnmh_persistent_global (see utils/persistentDamage.js), not in this
  // condition, so it is excluded from the Add Condition browser.
  {
    id: 'persistent-damage',
    name: 'Persistent Damage',
    valued: false,
    summary: 'Takes the listed damage at end of turn; DC 15 flat check to end',
    effect: () => 'At the end of each of your turns, take the persistent damage, then attempt a DC 15 flat check to end it',
  },
];

// ── Hydration helpers ────────────────────────────────────────────────
// Synced/persisted state stores only the dynamic shape `{ id, value }`
// (functions don't survive JSON). Re-derive the static definition —
// including the `effect` function — from this canonical list at point of use.

export const getCondition = (id) => PF2E_CONDITIONS.find((c) => c.id === id);

export const hydrateCondition = (stored) => {
  const def = getCondition(stored?.id);
  if (!def) return null;
  // `derived` marks Bulk-derived encumbrance entries (SP3, #1222) so the
  // tracker renders them as auto rows without remove/adjust controls.
  return stored.derived
    ? { ...def, value: stored.value, derived: true }
    : { ...def, value: stored.value };
};

// Unknown ids (older/newer clients) are dropped defensively.
export const hydrateConditions = (stored = []) =>
  stored.map(hydrateCondition).filter(Boolean);

export default PF2E_CONDITIONS;
