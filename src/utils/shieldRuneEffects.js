// src/utils/shieldRuneEffects.js
// Held-shield passive-rune effect spine (#1196 G3 wiring) — the shield mirror of
// useWornGear's synthetic-effect model, but for a HELD shield (a shield is
// wielded, not worn, so useWornGear never covers it).
//
// Returns `{ entry, def }` pairs in the same shape useResolvedEffects merges, so
// the resistance/skill/senses readers see a wielded shield's property runes with
// no reader changes. Wave 1 wires the one passive that needs the engine now:
// Energy-Resistant → wielder resistance vs the crafter-chosen damage type. The
// chosen type rides on the socket entry as `choice` (#1196 G2); the amount is a
// code-owned per-grade table (like armorRunes' ARMOR_POTENCY / RESILIENT).
//
// The resistance rides as an INLINE modifier on the effect ENTRY (not the def) —
// the parametrized value+descriptor pattern EffectUtils.modifiersOf supports
// (the same one Energy Ablation uses), since the amount+type are per-shield.

import { isHeldState } from './itemState';

// Energy-Resistant grade → resistance amount (base / greater / major).
export const ENERGY_RESISTANT_AMOUNT = {
  'energy-resistant': 3,
  'greater-energy-resistant': 6,
  'major-energy-resistant': 10,
};

// Runes granting an always-on skill item bonus WHILE THE SHIELD IS WIELDED
// (held). Code-owned, like ENERGY_RESISTANT_AMOUNT. The bonus rides on the effect
// DEF (not the entry) so computeEffectBonuses nets it into the skill panel and
// roll resolution — the same path useWornGear's Slick-style skill runes use.
//
// Only "while wielding", whole-skill bonuses belong here: a bonus gated on the
// shield being RAISED, or scoped to one activity (Glamourous's Feint, Knowing's
// Recall Knowledge), is NOT always-on, so it can't net into the base skill
// number — those surface as opt-in roll toggles instead (ROLL_BONUS_RUNES).
export const SKILL_WIRE_RUNES = {
  darkness: { stat: 'stealth', amount: 1 }, // +1 item to Stealth while wielding
};

// Runes granting a CONDITIONAL ('vs X') defensive bonus while wielded — surfaced
// as a save hint on the sheet (the #338 conditional path, which reads the
// resolved-effects universe). Heavy: +2 item to your Fortitude DC against
// attempts to Grapple or Shove you. The modifier rides on the DEF with a `vs`
// tag, so computeEffectBonuses buckets it as conditional (never netted into the
// always-on save number — the app can't know a check's context). Code-owned.
export const SAVE_HINT_RUNES = {
  heavy: { stat: 'fort', amount: 2, vs: 'Grapple or Shove' },
  // Spellguarding (#1246): while the shield is RAISED, its circumstance bonus
  // applies to saves against spells that target you. Amount = the held shield's
  // AC bonus; fans to all three saves (there is no 'saves' meta-stat). Raised-gated.
  spellguarding: {
    requiresRaised: true, amountFromShieldBonus: true, kind: 'circumstance',
    saves: ['fort', 'reflex', 'will'], vs: 'spells that target you',
  },
};

// Specific magic SHIELDS whose descriptive conditional save bonuses (#1246) are
// wired as save hints, keyed by the held shield's catalog id. Each carries an
// explicit `modifiers` list (fixed amounts) and optional `requiresRaised` — the
// item counterpart of SAVE_HINT_RUNES. Code-owned.
export const ITEM_SAVE_HINTS = {
  'dragonslayers-shield': {
    requiresRaised: true,
    modifiers: [
      { stat: 'reflex', kind: 'circumstance', amount: 2, vs: 'area effects' },
      { stat: 'will', kind: 'circumstance', amount: 2, vs: "a dragon's frightful presence" },
    ],
  },
};

// Expand a SAVE_HINT_RUNES entry + the held shield into the conditional
// `vs`-tagged modifiers it contributes. `amountFromShieldBonus` reads the
// shield's AC bonus (Spellguarding); a `saves` list fans one modifier per save,
// else the single `stat`. Empty when the amount resolves to 0.
const saveHintModifiers = (hint, shieldEntry) => {
  const amount = hint.amountFromShieldBonus ? (shieldEntry?.shield?.bonus || 0) : hint.amount;
  if (!amount) return [];
  const kind = hint.kind || 'item';
  const stats = Array.isArray(hint.saves) ? hint.saves : [hint.stat];
  return stats.map((stat) => ({ stat, kind, amount, vs: hint.vs }));
};

// Runes that grant an OPT-IN item bonus to a specific roll, surfaced as a toggle
// at that roll's resolver (not netted into the sheet): the player opts in on the
// exact check it applies to. Knowing → Recall Knowledge (while wielding);
// Glamourous → Feint (only while the shield is RAISED). Code-owned.
export const ROLL_BONUS_RUNES = {
  knowing:    { amount: 1, requiresRaised: false, label: 'Knowing' },
  glamourous: { amount: 1, requiresRaised: true,  label: 'Glamourous' },
};

// The shield currently in a hand (first held entry wins), matching useShield.
const heldShieldEntry = (inventory) =>
  (Array.isArray(inventory) ? inventory : []).find((e) => e && e.shield && isHeldState(e.state)) || null;

/**
 * The opt-in roll bonus a character's HELD shield grants for a given rune, or
 * null. A rune gated on the shield being RAISED (Glamourous) yields null unless
 * the live `raised` flag is passed. Consumed by the roll resolvers (Feint /
 * Recall Knowledge) to offer a toggle.
 *
 * @param {Array}  inventory - effective (state-stamped) inventory
 * @param {string} runeId    - property-rune id (e.g. 'knowing', 'glamourous')
 * @param {{ raised?: boolean }} [opts]
 * @returns {{ amount: number, label: string } | null}
 */
export const heldShieldRollBonus = (inventory, runeId, { raised = false } = {}) => {
  const def = ROLL_BONUS_RUNES[runeId];
  if (!def) return null;
  if (def.requiresRaised && !raised) return null;
  const shield = heldShieldEntry(inventory);
  const property = shield && shield.runes && Array.isArray(shield.runes.property) ? shield.runes.property : [];
  const has = property.some((p) => p && typeof p === 'object' && p.id === runeId);
  return has ? { amount: def.amount, label: `${def.label} (shield)` } : null;
};

/**
 * Passive rune effects contributed by the character's held shield, as
 * `{ entry, def }` pairs for useResolvedEffects. Property runes are resolved docs
 * (contentUtils inlines ids → rune docs, carrying any `choice`). Returns [] when
 * no shield is held or none of its runes contribute a wired passive effect.
 *
 * @param {Array} inventory - effective (state-stamped) inventory
 * @param {{ raised?: boolean }} [opts] - live shield-raise state; gates the
 *   raised-only hints (Spellguarding, Dragonslayer's Shield).
 * @returns {Array<{ entry: object, def: object }>}
 */
export const heldShieldRuneEffects = (inventory = [], { raised = false } = {}) => {
  const shield = heldShieldEntry(inventory);
  const property = shield && shield.runes && Array.isArray(shield.runes.property) ? shield.runes.property : [];
  const out = [];
  property.forEach((rune, i) => {
    if (!rune || typeof rune !== 'object') return;
    const id = `shieldrune-${shield.uid}-${i}`;
    // Energy-Resistant: resistance vs the chosen type while the shield is wielded.
    // The parametrized value rides on the ENTRY (the modifiersOf/resistanceFor
    // reader), so the def carries no modifiers.
    const amount = ENERGY_RESISTANT_AMOUNT[rune.id];
    if (amount && rune.choice) {
      out.push({
        entry: { id, effectId: id, modifiers: [{ stat: 'resistance', vs: String(rune.choice), amount }] },
        def: { id, name: `${rune.name} (${rune.choice})`, modifiers: [] },
      });
      return;
    }
    // Skill-wire runes (Darkness → Stealth): a fixed item bonus rides on the DEF
    // so computeEffectBonuses nets it into the skill sheet + roll resolution.
    const skill = SKILL_WIRE_RUNES[rune.id];
    if (skill) {
      out.push({
        entry: { id, effectId: id },
        def: { id, name: rune.name, modifiers: [{ stat: skill.stat, kind: 'item', amount: skill.amount }] },
      });
      return;
    }
    // Save-hint runes (Heavy → Fortitude vs Grapple/Shove; Spellguarding → all
    // saves vs spells while raised): a conditional bonus rides on the DEF with a
    // `vs` tag, surfacing as a save note on the sheet.
    const saveHint = SAVE_HINT_RUNES[rune.id];
    if (saveHint && !(saveHint.requiresRaised && !raised)) {
      const modifiers = saveHintModifiers(saveHint, shield);
      if (modifiers.length) {
        out.push({ entry: { id, effectId: id }, def: { id, name: rune.name, modifiers } });
      }
    }
  });
  // Specific magic shields with descriptive conditional save bonuses (#1246 —
  // Dragonslayer's Shield), keyed by the held shield's catalog id; raised-gated.
  const itemHint = shield && ITEM_SAVE_HINTS[shield.id];
  if (itemHint && !(itemHint.requiresRaised && !raised)) {
    const id = `shielditem-${shield.uid}`;
    out.push({ entry: { id, effectId: id }, def: { id, name: shield.name, modifiers: itemHint.modifiers } });
  }
  return out;
};

export default heldShieldRuneEffects;
