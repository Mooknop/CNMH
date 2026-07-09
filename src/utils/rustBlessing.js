// Rust Blessing (campaign boon, #539 follow-on) + the RAW broken-gear
// consequences it excepts from. React-free.
//
// PF2e RAW (Player Core, Broken): a broken object "can't be used for its
// normal function, nor does it grant bonuses — with the exception of armor".
// Broken armor keeps its item bonus but imposes a status penalty to AC:
// −1 light, −2 medium, −3 heavy. A destroyed item (0 HP) is gone for everyone.
//
// Pellias's deity blesses implements of rust and ruin (GM ruling 2026-07-09):
// while he has the Rust Blessing feat he keeps USING broken items —
//   weapons: usable at a −2 item penalty to attack rolls
//   shields: fully usable (Raise + Shield Block, full AC bonus)
//   armor:   status penalty one step kinder (−0 light / −1 medium / −2 heavy)
// Destruction at 0 HP still applies to him.
import { findWornArmor } from './armorClass';
import { normalizeArmor } from './InventoryUtils';
import { entryHpStatus } from './itemDurability';

export const RUST_BLESSING_FEAT_NAME = 'Rust Blessing';

/** −2 item penalty a Rust-Blessed wielder takes attacking with a broken weapon. */
export const BROKEN_WEAPON_ATTACK_PENALTY = -2;

/** Does this character carry the Rust Blessing boon? */
export const hasRustBlessing = (character) =>
  !!character &&
  Array.isArray(character.feats) &&
  character.feats.some((f) => f && f.name === RUST_BLESSING_FEAT_NAME);

// Status penalty to AC from wearing broken armor, by armor category. Unarmored
// defense (explorer's clothing) is treated as light. RAW row first, the
// blessed row one step kinder.
const BROKEN_ARMOR_AC_PENALTY = Object.freeze({
  raw:     { unarmored: -1, light: -1, medium: -2, heavy: -3 },
  blessed: { unarmored: 0,  light: 0,  medium: -1, heavy: -2 },
});

/**
 * The status penalty to AC for broken armor of the given category (0 = none).
 * @param {string} category - unarmored | light | medium | heavy
 * @param {boolean} [blessed] - wearer has Rust Blessing
 * @returns {number} a non-positive status modifier amount
 */
export const brokenArmorAcPenalty = (category, blessed = false) => {
  const row = blessed ? BROKEN_ARMOR_AC_PENALTY.blessed : BROKEN_ARMOR_AC_PENALTY.raw;
  return row[String(category || '').toLowerCase()] ?? row.light;
};

export const BROKEN_ARMOR_EFFECT_ID = 'broken-armor';

/**
 * Synthetic effect for wearing broken armor — an { entry, def } pair in the
 * useResolvedEffects shape, carrying the status penalty to AC so it nets
 * against other status modifiers in the normal effect engine. Null when no
 * worn armor, the armor isn't tracked/broken, or the penalty lands at 0
 * (blessed light armor).
 *
 * @param {Array}  inventory   - effective (state-stamped) inventory
 * @param {Object} itemHpState - the cnmh_itemhp_ overlay ({ [uid]: { hp } })
 * @param {Object} character   - resolved character doc (feats drive the boon)
 * @returns {{ entry:Object, def:Object }|null}
 */
export const brokenArmorEffect = (inventory, itemHpState, character) => {
  const worn = findWornArmor(inventory || []);
  if (!worn) return null;
  const status = entryHpStatus(worn, (itemHpState || {})[worn.uid]);
  if (!status || !status.broken) return null;
  const category = normalizeArmor(worn.armor)?.category || 'unarmored';
  const amount = brokenArmorAcPenalty(category, hasRustBlessing(character));
  if (!amount) return null;
  return {
    entry: { id: BROKEN_ARMOR_EFFECT_ID, effectId: BROKEN_ARMOR_EFFECT_ID },
    def: {
      id: BROKEN_ARMOR_EFFECT_ID,
      name: `Broken Armor (${worn.name || category})`,
      modifiers: [{ stat: 'ac', kind: 'status', amount }],
    },
  };
};
