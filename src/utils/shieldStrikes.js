// src/utils/shieldStrikes.js
// A shield's OWN Strike (#1230, epic #1196) — every held shield is a weapon.
//
// Baseline: a held shield contributes a derived Shield Bash Strike (1d4
// bludgeoning, martial melee — finesse when the shield has it via base trait or
// the Feather rune, #1229). A bound attachment (#1184) REPLACES the bash with
// its own Strike (shieldAttach.attachmentStrikes), and a legacy shield that
// authors its own inline `strikes` block keeps those instead of a derived bash.
//
// Throwing rune (#1196 G3): the Thrown trait it grants becomes a real ranged
// Shield Throw Strike whose range increment comes from the shield's size
// category (Bulk-derived): light 25 ft / medium 20 ft / heavy 15 ft. The rune
// includes the effects of a returning rune, so the throw is tagged `returning`
// and the shield flies back to hand; a shield with a base Thrown trait and no
// returning-effect rune Drops on the throw like any thrown weapon (strikeUtils
// tags + the UseAbilityModal confirm).
//
// Like bladeStrikes / attachmentStrikes, the bash is a DERIVED weapon shape run
// through the normal strike resolver, so it behaves like any other weapon.

import { isHeldState } from './itemState';
import { itemUidOf } from './affix';
import { flattenInventory } from './InventoryUtils';
import { resolveItemStrikes, hasReturningRune } from './strikeUtils';
import { shieldEffectiveTraits, shieldHasFinesse } from './shieldRunes';
import { attachmentOnShield } from './shieldAttach';
import { shieldCategory } from './shieldCategory';

// Throwing-rune range increment by shield size category (rune text: 25 feet if
// it is light, 20 feet if it is medium, and 15 feet if it is heavy).
export const SHIELD_THROW_RANGE = { light: '25ft', medium: '20ft', heavy: '15ft' };

const hasThrownTrait = (traits) =>
  traits.some((t) => String(t).toLowerCase().startsWith('thrown'));

/**
 * The derived bash pseudo-weapon for one shield: a melee Shield Bash always,
 * plus a ranged Shield Throw when the shield's effective traits (base or
 * Throwing rune) include Thrown. Carries the shield's uid so a resolved throw
 * drops the shield itself.
 *
 * @param {Object} shield - inventory shield item
 * @returns {Object} a derived weapon item (resolveItemStrikes-ready)
 */
export const deriveShieldBash = (shield) => {
  const finesse = shieldHasFinesse(shield);
  const strikes = [
    {
      name: 'Shield Bash',
      proficiency: 'martial',
      type: 'melee',
      damage: '1d4',
      damageType: 'bludgeoning',
      actionCount: 1,
      traits: ['Attack', 'Melee', ...(finesse ? ['Finesse'] : [])],
      description: 'You slam your shield into the target.',
    },
  ];
  if (hasThrownTrait(shieldEffectiveTraits(shield))) {
    strikes.push({
      name: 'Shield Throw',
      proficiency: 'martial',
      type: 'ranged',
      damage: '1d4',
      damageType: 'bludgeoning',
      actionCount: 1,
      range: SHIELD_THROW_RANGE[shieldCategory(shield?.weight)] || SHIELD_THROW_RANGE.medium,
      traits: ['Attack', 'Thrown'],
      description: 'You hurl your shield at the target.',
    });
  }
  return {
    uid: itemUidOf(shield),
    name: shield?.name,
    // Derived only while the shield is held — the bash needs no hand of its own.
    noHandRequired: true,
    strikes,
  };
};

/**
 * The resolved derived Strike(s) for every HELD shield in a character's
 * inventory. A shield with a bound attachment keeps only the throw (the
 * attachment's Strike replaces the bash); a shield authoring its own inline
 * `strikes` block is skipped entirely (legacy spiked shields). Each strike is
 * tagged `shieldBash: true` and `hostUid`; a throw's `returning` tag comes from
 * the SHIELD's runes (Throwing / Returning), which the derived pseudo-weapon
 * doesn't carry.
 *
 * @param {Object} character - resolved character (inventory inlined)
 * @param {Object} overlay   - cnmh_attached_<charId> (attachment → shield uid)
 * @returns {Array} resolved strike objects
 */
export const shieldBashStrikes = (character, overlay) => {
  const flat = flattenInventory(character?.inventory || []);
  const out = [];
  for (const item of flat) {
    if (!item || !item.shield || !isHeldState(item.state)) continue;
    if (item.strikes) continue; // authors its own bash
    const uid = itemUidOf(item);
    const bashReplaced = !!attachmentOnShield(overlay, uid);
    const returning = hasReturningRune(item);
    const resolved = resolveItemStrikes(deriveShieldBash(item), character)
      .filter((s) => !(bashReplaced && s.type === 'melee'))
      .map((s) => ({
        ...s,
        ...(s.thrown ? { returning } : {}),
        shieldBash: true,
        hostUid: uid,
      }));
    out.push(...resolved);
  }
  return out;
};
