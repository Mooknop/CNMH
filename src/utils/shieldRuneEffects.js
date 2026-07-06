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

// The shield currently in a hand (first held entry wins), matching useShield.
const heldShieldEntry = (inventory) =>
  (Array.isArray(inventory) ? inventory : []).find((e) => e && e.shield && isHeldState(e.state)) || null;

/**
 * Passive rune effects contributed by the character's held shield, as
 * `{ entry, def }` pairs for useResolvedEffects. Property runes are resolved docs
 * (contentUtils inlines ids → rune docs, carrying any `choice`). Returns [] when
 * no shield is held or none of its runes contribute a wired passive effect.
 *
 * @param {Array} inventory - effective (state-stamped) inventory
 * @returns {Array<{ entry: object, def: object }>}
 */
export const heldShieldRuneEffects = (inventory = []) => {
  const shield = heldShieldEntry(inventory);
  const property = shield && shield.runes && Array.isArray(shield.runes.property) ? shield.runes.property : [];
  const out = [];
  property.forEach((rune, i) => {
    if (!rune || typeof rune !== 'object') return;
    // Energy-Resistant: resistance vs the chosen type while the shield is wielded.
    const amount = ENERGY_RESISTANT_AMOUNT[rune.id];
    if (amount && rune.choice) {
      const id = `shieldrune-${shield.uid}-${i}`;
      out.push({
        entry: { id, effectId: id, modifiers: [{ stat: 'resistance', vs: String(rune.choice), amount }] },
        def: { id, name: `${rune.name} (${rune.choice})`, modifiers: [] },
      });
    }
  });
  return out;
};

export default heldShieldRuneEffects;
