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
  // ── Shadow Hound Support (Zevira, #223) ────────────────────────────
  // No auto stat change: the concealment is conditional (you must damage a
  // creature within the hound's reach) and positional, so it's GM-adjudicated.
  // This entry exists so the "until your next turn" marker chip renders a label.
  {
    id: 'shadow-hound-support',
    name: 'Shadow Hound Support',
    description:
      'Until the start of your next turn, when you damage a creature with a Strike and it is within reach of your Shadow Hound, you and your hound are Concealed to it until the end of your next turn.',
    modifiers: [],
  },
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

  // ── Upstage (Celebrity Dedication reaction, #226-C) ────────────────
  // +1 status bonus until the end of your next turn (caster-turn-end, authored
  // on the content effect block). Covers attacks, Perception, saves the way
  // Heroism's are, plus skill checks via the 'skills' fan-out (#447).
  {
    id: 'upstage',
    name: 'Upstage',
    description: '+1 status bonus to attack rolls, Perception, saving throws, and skill checks until the end of your next turn.',
    modifiers: [
      { stat: 'meleeAttack',  kind: 'status', amount: 1 },
      { stat: 'rangedAttack', kind: 'status', amount: 1 },
      { stat: 'spellAttack',  kind: 'status', amount: 1 },
      { stat: 'perception',   kind: 'status', amount: 1 },
      { stat: 'fort',         kind: 'status', amount: 1 },
      { stat: 'reflex',       kind: 'status', amount: 1 },
      { stat: 'will',         kind: 'status', amount: 1 },
      { stat: 'skills',       kind: 'status', amount: 1 },
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

  // ── Avoid Notice (exploration activity) ────────────────────────────
  {
    id: 'avoid-notice-hidden',
    name: 'Avoiding Notice',
    description: 'Successful Stealth check at start of exploration — Hidden from creatures that haven\'t noticed you.',
    modifiers: [],
  },

  // ── Treat Poison (exploration activity) ────────────────────────────
  {
    id: 'treat-poison-resist',
    name: 'Treat Poison',
    description: '+2 circumstance bonus to saving throws against the poison being treated.',
    modifiers: [
      { stat: 'fort', kind: 'circumstance', amount: 2 },
    ],
  },

  // ── Treat Wounds immunity (scoped to the healer who applied it) ──────
  {
    id: 'treat-wounds-immunity',
    name: 'Treat Wounds Immunity',
    description: 'Cannot be healed by Treat Wounds or Battle Medicine from the specific healer who applied this effect. Applied automatically on a successful Treat Wounds or Battle Medicine check. Remove to allow re-treatment.',
    modifiers: [],
  },

  // ── Generic ability immunity (clock-expiring; carries source ability name) ──
  {
    id: 'ability-immunity',
    name: 'Immune',
    description: 'Temporarily immune to a specific ability (e.g. Guidance, Battle Medicine, Tell Fortune). Applied automatically on use and cleared when the game clock passes its expiry.',
    modifiers: [],
  },

  // ── Eld Power states (Izzy homebrew, #225) ──────────────────────────
  // Conditional penalties (off-guard vs electricity, −2 saves vs electric)
  // can't be netted by the modifier engine — they stay descriptive (#274).
  {
    id: 'eld-charged',
    name: 'Charged (Eld)',
    description: 'Off-guard against attacks that deal electricity damage and −2 to saves against electric effects. Ends when the encounter ends, on taking electricity damage, or by Discharging to empower another electric Eld power.',
    modifiers: [],
    // Rules triggers automated via catalog flags (#275): the encounter-end
    // sweeps drop it, and applying electricity damage in the GM HP flow clears it.
    encounterScoped: true,
    clearOnDamageType: 'electricity',
  },
  {
    id: 'eld-shrouded',
    name: 'Shrouded',
    description: 'All light within 20 feet is lowered one step in intensity (bright → dim, dim → darkness). Lasts until the end of your turn.',
    modifiers: [],
  },
  {
    id: 'eld-rust-cloud',
    name: 'Rust Cloud',
    description: 'A 20-foot emanation of billowing rust: creatures inside are concealed, and creatures outside are concealed to those inside. Lasts 10 minutes, until Dismissed (2 actions), or until you fall unconscious.',
    modifiers: [],
  },

  // ── Devoted Guardian (champion ward, #228) ─────────────────────────
  // Stamped on the warded ally; lasts while the warder's shield stays
  // raised — WardSync removes it when their `raised` goes false.
  {
    id: 'devoted-guardian',
    name: 'Devoted Guardian',
    description: '+1 circumstance bonus to AC while your guardian stays adjacent with their shield raised.',
    modifiers: [{ stat: 'ac', kind: 'circumstance', amount: 1 }],
  },
  {
    id: 'devoted-guardian-tower',
    name: 'Devoted Guardian (Tower Shield)',
    description: '+2 circumstance bonus to AC while your guardian stays adjacent with their tower shield raised.',
    modifiers: [{ stat: 'ac', kind: 'circumstance', amount: 2 }],
  },
];

export default PF2E_EFFECTS;

export const getEffect = (id) => PF2E_EFFECTS.find((e) => e.id === id) || null;
