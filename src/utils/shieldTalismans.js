// Shield-talisman self-side buffs (#1246 — adamantine flake, heartstone,
// prismatic crystal, tree sap). Pure helpers, no React — the shield mirror of
// whetstone.js's weapon-bound effect model.
//
// A shield talisman with a structured `talisman.activation.effect` of one of
// the SHIELD_BUFF kinds is activated from the item modal (either card: the
// talisman's own, or its host shield's). Activation consumes the talisman as
// usual (affix.deactivateTalisman) and — instead of being log-only — leaves a
// timed entry in cnmh_effects_<charId> carrying a `shieldBuff` binding, the
// same NO-new-synced-key pattern the whetstone rail uses:
//
//   { id, name, appliedBy, source,
//     shieldBuff: { itemId, itemName, shieldUid, shieldName,
//                   hardnessBonus? | grantTraits? | energyBlock? },
//     expireAt? | expireAtSecs?, ts }
//
// Effect kinds (authored on the seed doc; graded talismans override the block
// per variant via the #907 `overrides` rail):
//   { kind: 'shield-hardness',     bonus: 2, durationMinutes: 1 }
//       — Adamantine Flake: item bonus to the shield's Hardness. Read by
//         useShield (folded into the held shield's Hardness, so Shield Block
//         math and every display agree).
//   { kind: 'shield-temp-hp',      roll: '5d6+10', wielderHalf: true }
//       — Heartstone: instantaneous, no effect entry. The player rolls and
//         enters the total; the shield's temp HP goes through the durability
//         rail (cnmh_itemhp_ record gains `tempHp`, spent before HP by
//         applyItemDamage) and the wielder gains half through the normal
//         temp-HP path (cnmh_hp_ `temp`, take-higher).
//   { kind: 'shield-energy-block', choose: ['acid', …], durationMinutes: 1 }
//       — Prismatic Crystal: the player picks the triggering damage type at
//         activation; while active the wielder may Shield Block that damage
//         type and the shield is IMMUNE to it (ShieldBlockBar's opt-in
//         checkbox → applyShieldBlock's `shieldImmune`).
//   { kind: 'shield-trait',        traits: ['Grapple'], durationRounds: 1 }
//       — Tree Sap: the shield gains the trait(s) while active
//         (shieldEffectiveTraits' extraTraits parameter).
//
// Durations mirror whetstone.js: minutes tick on the encounter round sweep
// when a combat is running (1 min = 10 rounds), else on the game clock;
// round-scoped effects (Tree Sap's 1 round) expire on the round sweep in
// combat, else after 6s of game-clock time per round.

import { newEntryUid } from './uid';
import { itemUidOf } from './affix';
import { resolveExpireAt } from './expiry';
import { MINUTE_ROUNDS } from './whetstone';
import { activationOf } from './talismanActivation';

/** Seconds per combat round (PF2e). */
const ROUND_SECS = 6;

export const SHIELD_BUFF_KINDS = Object.freeze([
  'shield-hardness',
  'shield-temp-hp',
  'shield-energy-block',
  'shield-trait',
]);

/** The structured shield-buff effect of a talisman's activation, or null. */
export const shieldTalismanEffect = (item) => {
  const eff = activationOf(item)?.effect;
  return eff && SHIELD_BUFF_KINDS.includes(eff.kind) ? eff : null;
};

/**
 * Build the cnmh_effects_ entry for an activated shield talisman (the timed
 * kinds — shield-temp-hp is instantaneous and never builds an entry).
 *
 * @param {Object} item            - the talisman (variant-resolved)
 * @param {Object} shield          - the host shield inventory entry
 * @param {string} charId          - the wielder
 * @param {string} [choice]        - activation-time pick (energy-block's type)
 * @param {Object} [encounter]     - current encounter state (for round expiry)
 * @param {string} [casterEntryId] - the wielder's encounter entryId
 * @param {number} [nowSecs]       - absolute game seconds (for clock expiry)
 */
export const buildShieldBuffEntry = ({
  item, shield, charId, choice, encounter, casterEntryId, nowSecs,
}) => {
  const eff = shieldTalismanEffect(item) || {};
  const inEncounter = !!encounter?.active;
  const rounds =
    eff.durationRounds != null
      ? eff.durationRounds
      : eff.durationMinutes
        ? eff.durationMinutes * MINUTE_ROUNDS
        : null;
  const expireAt =
    rounds != null && inEncounter
      ? resolveExpireAt({ until: 'rounds', rounds }, encounter, casterEntryId)
      : null;
  const secs =
    eff.durationRounds != null
      ? eff.durationRounds * ROUND_SECS
      : eff.durationMinutes
        ? eff.durationMinutes * 60
        : null;
  const expireAtSecs =
    !expireAt && typeof nowSecs === 'number' && secs != null ? nowSecs + secs : undefined;
  return {
    id:        newEntryUid(),
    name:      `${item.name} (${shield.name})`,
    appliedBy: charId,
    source:    item.name,
    shieldBuff: {
      itemId:     item.id ?? null,
      itemName:   item.name,
      shieldUid:  itemUidOf(shield),
      shieldName: shield.name,
      ...(eff.kind === 'shield-hardness' ? { hardnessBonus: eff.bonus || 0 } : {}),
      ...(eff.kind === 'shield-trait' ? { grantTraits: eff.traits || [] } : {}),
      ...(eff.kind === 'shield-energy-block' && choice ? { energyBlock: String(choice) } : {}),
    },
    ...(expireAt ? { expireAt } : {}),
    ...(expireAtSecs != null ? { expireAtSecs } : {}),
    ts: Date.now(),
  };
};

/**
 * The effects list after applying a shield-buff entry: re-activating the same
 * talisman kind on the same shield replaces the old entry in the same write
 * (a fresh flake restarts the minute); buffs from different talismans coexist.
 */
export const withShieldBuffApplied = (effects, entry) => [
  ...(Array.isArray(effects) ? effects : []).filter(
    (e) =>
      !(
        e?.shieldBuff &&
        e.shieldBuff.itemId === entry.shieldBuff.itemId &&
        e.shieldBuff.shieldUid === entry.shieldBuff.shieldUid
      )
  ),
  entry,
];

/** Active shield-buff entries bound to a shield uid. */
export const shieldBuffsFor = (effects, shieldUid) =>
  (Array.isArray(effects) ? effects : []).filter(
    (e) => e?.shieldBuff?.shieldUid === shieldUid
  );

/**
 * The item bonus to Hardness the shield's active buffs grant (Adamantine
 * Flake). Item bonuses don't stack — the highest wins.
 */
export const shieldBuffHardnessBonus = (effects, shieldUid) =>
  shieldBuffsFor(effects, shieldUid).reduce(
    (best, e) => Math.max(best, e.shieldBuff.hardnessBonus || 0),
    0
  );

/** Traits the shield's active buffs grant (Tree Sap → Grapple), deduped. */
export const shieldBuffGrantedTraits = (effects, shieldUid) => {
  const out = [];
  const seen = new Set();
  for (const e of shieldBuffsFor(effects, shieldUid)) {
    for (const t of e.shieldBuff.grantTraits || []) {
      const k = String(t).toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        out.push(t);
      }
    }
  }
  return out;
};

/**
 * The energy type the shield can currently Shield Block (and is immune to)
 * from an active Prismatic Crystal buff, or null.
 */
export const shieldBuffEnergyBlock = (effects, shieldUid) =>
  shieldBuffsFor(effects, shieldUid).find((e) => e.shieldBuff.energyBlock)
    ?.shieldBuff.energyBlock || null;

/**
 * Heartstone's split: the shield gains the rolled total as temporary HP, the
 * wielder half that amount (rounded down, PF2e default).
 */
export const heartstoneSplit = (total) => {
  const t = Math.max(0, Math.floor(Number(total) || 0));
  return { shield: t, wielder: Math.floor(t / 2) };
};
