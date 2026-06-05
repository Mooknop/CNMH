// Active-buff catalog for PF2e (Remaster-compatible).
// Each entry has modifiers: [{ stat, kind, amount }].
//   stat:   matches the keys returned by EffectUtils / ConditionUtils
//           (ac, fort, reflex, will, meleeAttack, rangedAttack, spellAttack,
//            spellDC, classDC, perception, speed)
//   kind:   'status' | 'circumstance' | 'item'
//           Only the highest bonus of each kind applies per stat (same stacking
//           rule as penalties). Different kinds always stack.
//   amount: the flat bonus (positive integer)

const PF2E_EFFECTS = [
  // ── Heroism (occult spell, heightened) ─────────────────────────────
  {
    id: 'heroism-1',
    name: 'Heroism (Rank 1–3)',
    description: '+1 status bonus to attack rolls, Perception, and saving throws for 10 minutes.',
    modifiers: [
      { stat: 'meleeAttack',  kind: 'status', amount: 1 },
      { stat: 'rangedAttack', kind: 'status', amount: 1 },
      { stat: 'spellAttack',  kind: 'status', amount: 1 },
      { stat: 'perception',   kind: 'status', amount: 1 },
      { stat: 'fort',         kind: 'status', amount: 1 },
      { stat: 'reflex',       kind: 'status', amount: 1 },
      { stat: 'will',         kind: 'status', amount: 1 },
    ],
  },
  {
    id: 'heroism-2',
    name: 'Heroism (Rank 4–6)',
    description: '+2 status bonus to attack rolls, Perception, and saving throws for 10 minutes.',
    modifiers: [
      { stat: 'meleeAttack',  kind: 'status', amount: 2 },
      { stat: 'rangedAttack', kind: 'status', amount: 2 },
      { stat: 'spellAttack',  kind: 'status', amount: 2 },
      { stat: 'perception',   kind: 'status', amount: 2 },
      { stat: 'fort',         kind: 'status', amount: 2 },
      { stat: 'reflex',       kind: 'status', amount: 2 },
      { stat: 'will',         kind: 'status', amount: 2 },
    ],
  },
  {
    id: 'heroism-3',
    name: 'Heroism (Rank 7+)',
    description: '+3 status bonus to attack rolls, Perception, and saving throws for 10 minutes.',
    modifiers: [
      { stat: 'meleeAttack',  kind: 'status', amount: 3 },
      { stat: 'rangedAttack', kind: 'status', amount: 3 },
      { stat: 'spellAttack',  kind: 'status', amount: 3 },
      { stat: 'perception',   kind: 'status', amount: 3 },
      { stat: 'fort',         kind: 'status', amount: 3 },
      { stat: 'reflex',       kind: 'status', amount: 3 },
      { stat: 'will',         kind: 'status', amount: 3 },
    ],
  },

  // ── Inspire Courage (bard composition) ─────────────────────────────
  {
    id: 'inspire-courage',
    name: 'Inspire Courage',
    description: '+1 status bonus to attack rolls and damage rolls while the composition lasts.',
    modifiers: [
      { stat: 'meleeAttack',  kind: 'status', amount: 1 },
      { stat: 'rangedAttack', kind: 'status', amount: 1 },
      { stat: 'spellAttack',  kind: 'status', amount: 1 },
    ],
  },
  {
    id: 'inspire-courage-2',
    name: 'Inspire Courage (+2)',
    description: '+2 status bonus to attack rolls (Maestro dedication or Lingering Composition).',
    modifiers: [
      { stat: 'meleeAttack',  kind: 'status', amount: 2 },
      { stat: 'rangedAttack', kind: 'status', amount: 2 },
      { stat: 'spellAttack',  kind: 'status', amount: 2 },
    ],
  },

  // ── Bless (divine/primal area spell) ───────────────────────────────
  {
    id: 'bless',
    name: 'Bless',
    description: '+1 status bonus to attack rolls while within the emanation.',
    modifiers: [
      { stat: 'meleeAttack',  kind: 'status', amount: 1 },
      { stat: 'rangedAttack', kind: 'status', amount: 1 },
      { stat: 'spellAttack',  kind: 'status', amount: 1 },
    ],
  },

  // ── Aid (reaction) ─────────────────────────────────────────────────
  {
    id: 'aid',
    name: 'Aid',
    description: '+2 circumstance bonus to the next attack roll or save (Aid critical success: +3).',
    modifiers: [
      { stat: 'meleeAttack',  kind: 'circumstance', amount: 2 },
      { stat: 'rangedAttack', kind: 'circumstance', amount: 2 },
      { stat: 'spellAttack',  kind: 'circumstance', amount: 2 },
      { stat: 'fort',         kind: 'circumstance', amount: 2 },
      { stat: 'reflex',       kind: 'circumstance', amount: 2 },
      { stat: 'will',         kind: 'circumstance', amount: 2 },
    ],
  },
  {
    id: 'aid-crit',
    name: 'Aid (Critical Success)',
    description: '+3 circumstance bonus to the next attack roll or save.',
    modifiers: [
      { stat: 'meleeAttack',  kind: 'circumstance', amount: 3 },
      { stat: 'rangedAttack', kind: 'circumstance', amount: 3 },
      { stat: 'spellAttack',  kind: 'circumstance', amount: 3 },
      { stat: 'fort',         kind: 'circumstance', amount: 3 },
      { stat: 'reflex',       kind: 'circumstance', amount: 3 },
      { stat: 'will',         kind: 'circumstance', amount: 3 },
    ],
  },

  // ── Shield (spell / Shield Block reaction) ──────────────────────────
  {
    id: 'shield-spell',
    name: 'Shield (spell)',
    description: '+1 circumstance bonus to AC until the start of your next turn.',
    modifiers: [
      { stat: 'ac', kind: 'circumstance', amount: 1 },
    ],
  },

  // ── Mage Armor ──────────────────────────────────────────────────────
  {
    id: 'mage-armor',
    name: 'Mage Armor',
    description: '+1 item bonus to AC (unarmored only in practice). Lasts until next daily prep.',
    modifiers: [
      { stat: 'ac', kind: 'item', amount: 1 },
    ],
  },

  // ── Runic Body (level 8 feat) ───────────────────────────────────────
  {
    id: 'runic-body',
    name: 'Runic Body',
    description: '+1 status bonus to attack rolls (from fundamental rune bonus on unarmed attacks).',
    modifiers: [
      { stat: 'meleeAttack', kind: 'status', amount: 1 },
    ],
  },

  // ── Bardical Inspiration / Lingering Composition ────────────────────
  {
    id: 'dirge-of-doom',
    name: 'Dirge of Doom',
    description: 'Enemies in range are Frightened 1 (no save). Manual — apply Frightened via conditions.',
    modifiers: [],
  },

  // ── Fly (spell) ─────────────────────────────────────────────────────
  {
    id: 'fly-spell',
    name: 'Fly (spell)',
    description: 'Character gains a fly Speed equal to their land Speed. Track manually.',
    modifiers: [],
  },

  // ── Defend (exploration activity) ───────────────────────────────────
  {
    id: 'defend',
    name: 'Defend',
    description: 'Moving at half Speed with your shield raised: +2 circumstance bonus to Perception checks to detect hazards. You cannot be surprised, and can use Shield Block while traveling.',
    modifiers: [
      { stat: 'perception', kind: 'circumstance', amount: 2 },
    ],
  },

  // ── Treat Wounds immunity (scoped to the healer who applied it) ──────
  {
    id: 'treat-wounds-immunity',
    name: 'Treat Wounds Immunity',
    description: 'Cannot be healed by Treat Wounds or Battle Medicine from the specific healer who applied this effect. Applied automatically on a successful Treat Wounds or Battle Medicine check. Remove to allow re-treatment.',
    modifiers: [],
  },
];

export default PF2E_EFFECTS;

export const getEffect = (id) => PF2E_EFFECTS.find((e) => e.id === id) || null;
