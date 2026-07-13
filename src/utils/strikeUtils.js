// src/utils/strikeUtils.js
// Utilities for computing and categorizing character strikes.

import { getAbilityModifier, getAttackBonusValue } from './CharacterUtils';
import { calculateSpellStats } from './SpellUtils';
import { convertWordToNumber } from './actionIconUtils';
import { itemAbilitiesActive } from './itemState';
import { resolveWeapon, scaleDamageDice, buildRuneBreakdown } from './weaponRunes';
import { dragonbreathRunes, dragonbreathDisplayName, dragonbreathStrikeDamageType } from './dragonbreath';
import { isCapacityWeapon, strikeAmmoCapacity, normalizeChamberState, loadedCount } from './ammunition';
import { applyWhetstoneStrikeAlterations } from './whetstone';
import { entryHpStatus } from './itemDurability';
import { hasRustBlessing, BROKEN_WEAPON_ATTACK_PENALTY } from './rustBlessing';

// ── Thrown Strikes (#1230) ─────────────────────────────────────────────────────
// A ranged Strike with the Thrown trait leaves the wielder's hand when it
// resolves: the encounter confirm marks the weapon Dropped in the live loadout —
// unless a rune with returning effects flies it back. The weapon `returning`
// rune, the shield `shield-returning` rune, and the shield `throwing` rune
// (which includes the effects of a returning rune) all count.
export const RETURNING_RUNE_IDS = ['returning', 'shield-returning', 'throwing'];

// Property-rune ids on an item's `runes` block, tolerant of both resolved docs
// ({ id, … }) and bare id strings.
const propertyRuneIds = (item) =>
  (item?.runes && Array.isArray(item.runes.property) ? item.runes.property : [])
    .map((p) => (p && typeof p === 'object' ? p.id : p))
    .filter(Boolean)
    .map((id) => String(id).toLowerCase());

/** Whether an item carries a rune with returning effects (weapon or shield). */
export const hasReturningRune = (item) =>
  propertyRuneIds(item).some((id) => RETURNING_RUNE_IDS.includes(id));

const isThrownTrait = (t) => String(t).toLowerCase().startsWith('thrown');

/**
 * Compute the ability modifier, proficiency value, attack bonus, and damage string
 * for a single strike given a character's stats. Extracted to eliminate the duplicated
 * block that previously appeared for character strikes, feat strikes, and inventory strikes.
 *
 * @param {Object} strike    - Strike data (type, traits, proficiency, damage, …)
 * @param {Object} character - Character data
 * @param {string} [defaultDamage='1d6'] - Fallback damage string when strike.damage is absent
 * @param {Object} [opts]    - { proficiencyFloor: 'highest-weapon' } — treat the
 *   weapon's proficiency as the character's best weapon rank (Blade Phantom's
 *   Guide, #1216)
 * @returns {{ strMod, attackBonus, damageString }}
 */
const resolveStrikeMods = (strike, character, defaultDamage = '1d6', opts = {}) => {
  const isMelee = strike.type === 'melee';
  const isFinesse = strike.traits?.includes('Finesse');
  const isThrown = strike.traits?.includes('Thrown');
  const isKineticist = strike.traits?.includes('Kineticist');

  const strMod = getAbilityModifier(character.abilities?.strength || 10);
  const dexMod = getAbilityModifier(character.abilities?.dexterity || 10);
  const conMod = getAbilityModifier(character.abilities?.constitution || 10);

  let abilityMod;
  if (isKineticist) {
    abilityMod = conMod;
  } else if (isFinesse) {
    abilityMod = Math.max(strMod, dexMod);
  } else if (isMelee) {
    abilityMod = strMod;
  } else {
    abilityMod = dexMod;
  }

  let proficiencyValue = 0;
  if (strike.proficiency && character.proficiencies?.weapons?.[strike.proficiency]) {
    proficiencyValue = character.proficiencies.weapons[strike.proficiency].proficiency || 0;
  } else if (strike.traits?.includes('Unarmed')) {
    proficiencyValue = character.proficiencies?.weapons?.unarmed?.proficiency || 0;
  } else {
    proficiencyValue = character.proficiencies?.weapons?.simple?.proficiency || 0;
  }

  // Proficiency floor (#1216 — Blade Phantom's Guide): treat this weapon's
  // proficiency as the character's highest weapon rank for the duration.
  if (opts.proficiencyFloor === 'highest-weapon') {
    const ranks = Object.values(character.proficiencies?.weapons || {})
      .map((w) => w?.proficiency || 0);
    proficiencyValue = Math.max(proficiencyValue, ...(ranks.length ? ranks : [0]));
  }

  let attackBonus = getAttackBonusValue(abilityMod, proficiencyValue, character.level || 0);

  // Spell-attack weapons: a special weapon (e.g. Xanderghul's Flawless Hammer)
  // attacks with the wielder's spell attack modifier, OR its normal
  // martial-proficiency + Str attack — whichever is higher. Driven by the
  // catalog strike flag `attackStat: 'spellAttackOrMartial'`.
  if (strike.attackStat === 'spellAttackOrMartial') {
    const { spellAttackMod } = calculateSpellStats(character);
    const martialBonus = getAttackBonusValue(
      strMod,
      character.proficiencies?.weapons?.martial?.proficiency || 0,
      character.level || 0,
    );
    attackBonus = Math.max(spellAttackMod, martialBonus);
  }

  let damageString = strike.damage || defaultDamage;
  if ((isMelee || isThrown) && strMod !== 0 && !damageString.includes('+') && !damageString.includes('-')) {
    damageString += strMod > 0 ? '+' + strMod : strMod;
  }

  return { strMod, attackBonus, damageString };
};

/**
 * Resolve the fully-computed strike(s) for a single inventory weapon — the same
 * shape getStrikes produces for inventory items. Extracted so per-item consumers
 * (e.g. the item detail modal) can compute a weapon's real attack bonus/damage
 * without re-deriving the rune/potency/ability logic or relying on the strike
 * appearing in the whole-character list (which skips containers).
 *
 * @param {Object} item      - Inventory item carrying a `strikes` block
 * @param {Object} character - Character data
 * @param {Object} [chamberState=null] - This weapon's chamber state from the
 *   cnmh_chambers_<id> overlay (epic #672), used to gate chambered ranged Strikes.
 * @param {Object} [whetstoneEntry=null] - The active whetstone effect entry bound
 *   to this weapon (cnmh_effects_ overlay, #1214) — its payload alters the
 *   resolved strikes (damage type, traits, riders, material tags, range).
 * @param {Object} [liveItemHp=null] - This weapon's record from the
 *   cnmh_itemhp_ overlay ({ hp }, #541). Drives the Broken/Destroyed gate:
 *   a destroyed weapon's Strikes are inactive for everyone; a broken one is
 *   RAW-unusable — unless the wielder has Rust Blessing, in which case the
 *   Strike stays active at a −2 item penalty to attack.
 * @returns {Array} - Resolved strike objects ({ name, attackMod, damage, … })
 */
export const resolveItemStrikes = (item, character, chamberState = null, whetstoneEntry = null, liveItemHp = null) => {
  if (!item || !item.strikes || !character) return [];

  // Durability gate (#539/#541): null for untracked items (consumable throwers,
  // artifacts) — those never break.
  const hpStatus = entryHpStatus(item, liveItemHp || undefined);
  const broken = !!hpStatus?.broken;
  const destroyed = !!hpStatus?.destroyed;
  const blessed = broken && !destroyed && hasRustBlessing(character);
  const brokenPenalty = blessed ? BROKEN_WEAPON_ATTACK_PENALTY : 0;

  // Weapon-rune resolution (#548): when an item carries a declarative `runes`
  // block, fold it into attack bonus, scaled damage dice, derived display name,
  // and forwarded property-rune riders. Items with a legacy flat `potency` (and
  // no `runes`) keep the original back-compat path.
  //
  // Dragonbreath template (#1210 M4b): a templated weapon is TREATED AS carrying
  // the tier's fundamental runes, so resolve off the injected runes block
  // (dragonbreathRunes) — potency/striking/property all flow through the same
  // resolver. Its display name + Strike damage type come from the template.
  const dbRunes = dragonbreathRunes(item); // null when not a dragonbreath entry
  const effectiveRunes = dbRunes || item.runes;
  const resolved = effectiveRunes
    ? resolveWeapon(
      { name: item.name, price: item.price, material: item.material, traits: item.traits },
      effectiveRunes,
    )
    : null;
  const potencyBonus = resolved ? resolved.potencyBonus : (item.potency || 0);
  const sourceName = dbRunes
    ? dragonbreathDisplayName(item, item.name)
    : (resolved ? resolved.name : item.name);
  const dbDamageType = dragonbreathStrikeDamageType(item);
  // Rune source breakdown (#608) — where the bonus/dice/riders come from. For a
  // dragonbreath weapon it reads the injected fundamentals + property runes.
  const runeBreakdown = buildRuneBreakdown(dbRunes ? { ...item, runes: effectiveRunes } : item);

  const strikesArray = Array.isArray(item.strikes) ? item.strikes : [item.strikes];
  const whetstoneOpts = whetstoneEntry?.whetstone?.effect?.proficiencyFloor
    ? { proficiencyFloor: whetstoneEntry.whetstone.effect.proficiencyFloor }
    : {};
  return strikesArray.map(weaponStrike => {
    const { attackBonus: baseBonus, damageString } = resolveStrikeMods(weaponStrike, character, undefined, whetstoneOpts);

    const attackBonus = baseBonus + potencyBonus + brokenPenalty;
    const damage = resolved ? scaleDamageDice(damageString, resolved.extraDice) : damageString;

    const strikeName = weaponStrike.name ||
      (weaponStrike.type === 'melee' ? `${sourceName} Melee Strike` : `${sourceName} Ranged Strike`);

    // Merge strike-level riders (#222) with property-rune riders (#548).
    const riders = [
      ...(Array.isArray(weaponStrike.riders) ? weaponStrike.riders : []),
      ...(resolved ? resolved.riders : []),
    ];

    const strikeObj = {
      name: strikeName,
      type: weaponStrike.type || 'melee',
      actionCount: parseInt(weaponStrike.actionCount || weaponStrike.action) || 1,
      traits: weaponStrike.traits || [],
      attackMod: attackBonus,
      damage,
      // Damage type (#1018) — feeds the damage panel hint and the typed relay
      // to Foundry (#1016), where PF2e's applyDamage nets the target's IWR. A
      // dragonbreath weapon's Strike follows the dragon's breath damage type
      // (#1210 M4b), overriding the base weapon's native type.
      ...((dbDamageType || weaponStrike.damageType) ? { damageType: dbDamageType || weaponStrike.damageType } : {}),
      description: weaponStrike.description || item.description || '',
      source: sourceName,
      range: weaponStrike.range,
      ...(weaponStrike.variants ? { variants: weaponStrike.variants } : {}),
      // Damage riders (#222 + #548 property runes) — carried through so the damage step sees them.
      ...(riders.length ? { riders } : {}),
      // Counts-as IWR tags from property runes (#1436 — Ghost Touch). Surfaced
      // on the strike so buildDamageProfile forwards them into weakness matching
      // and the typed relay; the whetstone step below unions any it also adds.
      ...(resolved?.iwrTags?.length ? { iwrTags: resolved.iwrTags } : {}),
      // Intrinsic on-crit save (#1439 — Serpent Dagger): a condition inflicted on
      // a critical hit, gated by a fixed-DC save. Carried onto the strike so the
      // post-roll applier (applyStrikeOnCritSave) pushes it to the GM save rail.
      ...(weaponStrike.onCritSave ? { onCritSave: weaponStrike.onCritSave } : {}),
      // Rune source breakdown (#608) — present only for runed weapons.
      ...(runeBreakdown ? { runeBreakdown } : {}),
      // Gated: a weapon's Strike is only usable while it is wielded
      // (held), unless the catalog flags it noHandRequired. A destroyed
      // weapon is unusable outright; a broken one is RAW-unusable except
      // for a Rust-Blessed wielder (already attacking at −2 above).
      active: itemAbilitiesActive(item) && !destroyed && (!broken || blessed),
      // Durability flags (#539) — the action tiles/detail modal read these to
      // explain WHY a strike is disabled (or penalized, for Rust Blessing).
      ...(broken ? { broken: true } : {}),
      ...(destroyed ? { destroyed: true } : {}),
      ...(brokenPenalty ? { brokenPenalty } : {}),
    };

    // Thrown Strike (#1230): tag the ranged throw with its inventory uid so the
    // encounter confirm can mark the weapon Dropped when it resolves — or skip
    // the drop when a returning-effect rune brings it back. The melee Strike on
    // the same weapon keeps the Thrown trait for display but never drops.
    if (strikeObj.type === 'ranged' && strikeObj.traits.some(isThrownTrait)) {
      strikeObj.thrown = true;
      strikeObj.weaponUid = item.uid || null;
      strikeObj.returning = hasReturningRune(item);
    }

    // Chambered ranged weapons (#672, S2): the ranged Strike additionally
    // requires ≥1 loaded chamber. Surface the load state (capacity + loaded
    // count) so the action tile can render e.g. "0/3 loaded" and gate firing.
    // The melee Blade strike on the same weapon is a non-capacity strike and is
    // untouched.
    //
    // Nock weapons (#1270, AA1) — bows/crossbows with a typed ammoType — reuse
    // the same rail with a single slot, but the Strike stays active when empty:
    // plain arrows are untracked/infinite, and only a nocked special is
    // consumed/applied by the fire path.
    const ammoCapacity = strikeAmmoCapacity(weaponStrike);
    if (ammoCapacity != null) {
      const loaded = loadedCount(normalizeChamberState(chamberState, ammoCapacity));
      strikeObj.capacity = ammoCapacity;
      strikeObj.chambersLoaded = loaded;
      strikeObj.loaded = loaded > 0;
      if (isCapacityWeapon(weaponStrike)) {
        strikeObj.active = strikeObj.active && loaded > 0;
      } else {
        strikeObj.nock = true;
      }
      // Carry the inventory uid so the fire resolver (#676, S4) can read the live
      // chamber overlay (refs + pointer) and write the discharge back.
      strikeObj.weaponUid = item.uid || null;
    }

    // Whetstone alterations (#1214) — the active whetstone effect bound to this
    // weapon alters the resolved strike last, after runes/chambers, so its
    // overrides (damage type, traits, riders, range) win over the base layers.
    return whetstoneEntry
      ? applyWhetstoneStrikeAlterations(strikeObj, whetstoneEntry)
      : strikeObj;
  });
};

/**
 * Get all strikes for the character, combining character-defined strikes,
 * feat strikes, and inventory weapon strikes.
 * @param {Object} character - Character data
 * @param {Object} [chambersByUid={}] - Per-weapon chamber state keyed by the
 *   inventory entry's uid (cnmh_chambers_<id> overlay, epic #672). Drives the
 *   loaded-chamber gate on capacity/chambered ranged Strikes.
 * @param {Object} [whetstonesByUid={}] - Active whetstone effect entries keyed
 *   by weapon uid (whetstonesByWeaponUid over cnmh_effects_, #1214).
 * @param {Object} [itemHpByUid={}] - Live item-HP overlay keyed by entry uid
 *   (cnmh_itemhp_<id>, #541) — drives the Broken/Destroyed strike gate.
 * @returns {Array} - Array of strike objects with computed attack modifiers
 */
export const getStrikes = (character, chambersByUid = {}, whetstonesByUid = {}, itemHpByUid = {}) => {
  let allStrikes = [];

  // Character-defined strikes
  if (character.strikes && Array.isArray(character.strikes) && character.strikes.length > 0) {
    const processedStrikes = character.strikes.map(strike => {
      const { attackBonus, damageString } = resolveStrikeMods(strike, character, '??');
      return { ...strike, attackMod: attackBonus, damage: damageString };
    });
    allStrikes = [...processedStrikes];
  }

  // Feat strikes
  if (character.feats) {
    const featStrikes = character.feats
      .filter(feat => feat.strikes && Array.isArray(feat.strikes) && feat.strikes.length > 0)
      .flatMap(feat => {
        // Stance-gated strikes (#224): when a feat carries a Stance-trait action
        // (e.g. Dragon Stance), its strikes (Dragon Tail) are only usable while
        // that stance is active. Co-location heuristic — the stance action and
        // its strikes share a feat block — so we tag each strike with the stance
        // action's name and let the strike list gate on the live stance state.
        const stanceName = feat.actions
          ?.find(a => a.traits?.includes('Stance'))?.name || null;

        return feat.strikes.map(strike => {
          const { attackBonus, damageString } = resolveStrikeMods(strike, character);

          // Variable action count parsing (e.g. "One to Two Actions")
          let variableActionCount = null;
          if (strike.actionCount && typeof strike.actionCount === 'string') {
            const actionText = strike.actionCount.toLowerCase();
            if (actionText.includes('to')) {
              const rangeMatch = actionText.match(/(\w+)\s+to\s+(\w+)/i);
              if (rangeMatch) {
                const min = convertWordToNumber(rangeMatch[1]);
                const max = convertWordToNumber(rangeMatch[2]);
                if (min > 0 && max > 0) variableActionCount = { min, max };
              }
            }
          } else if (strike.name?.includes('Metal Blast')) {
            if (typeof strike.action === 'string' && strike.action.toLowerCase().includes('to')) {
              const rangeMatch = strike.action.toLowerCase().match(/(\w+)\s+to\s+(\w+)/i);
              if (rangeMatch) {
                const min = convertWordToNumber(rangeMatch[1]);
                const max = convertWordToNumber(rangeMatch[2]);
                if (min > 0 && max > 0) variableActionCount = { min, max };
              }
            } else {
              variableActionCount = { min: 1, max: 2 };
            }
          }

          return {
            name: strike.name,
            type: strike.type || 'melee',
            actionCount: parseInt(strike.actionCount || strike.action) || 1,
            variableActionCount,
            actions: strike.action && typeof strike.action === 'string' ? strike.action : null,
            traits: strike.traits || [],
            attackMod: attackBonus,
            damage: damageString,
            // Damage type (#1018) — carried through for the hint + typed relay.
            ...(strike.damageType ? { damageType: strike.damageType } : {}),
            description: strike.description || '',
            source: feat.name,
            range: strike.range,
            ...(strike.variants ? { variants: strike.variants } : {}),
            // Damage riders (#222) — carried through so the damage step sees them.
            ...(strike.riders ? { riders: strike.riders } : {}),
            // Stance gate (#224) — present only for strikes from a stance feat.
            ...(stanceName ? { stance: stanceName } : {}),
          };
        });
      });
    allStrikes = [...allStrikes, ...featStrikes];
  }

  // Inventory weapon strikes
  if (character.inventory) {
    const weaponStrikes = character.inventory
      .filter(item => item.strikes)
      .flatMap(item => resolveItemStrikes(
        item,
        character,
        (chambersByUid || {})[item.uid],
        (whetstonesByUid || {})[item.uid],
        (itemHpByUid || {})[item.uid],
      ));
    allStrikes = [...allStrikes, ...weaponStrikes];
  }

  // Fallback: unarmed strike
  if (allStrikes.length === 0) {
    const unarmedProficiency = character.proficiencies?.weapons?.unarmed?.proficiency || 0;
    const strMod = getAbilityModifier(character.abilities?.strength || 10);
    const attackBonus = getAttackBonusValue(strMod, unarmedProficiency, character.level || 0);

    allStrikes.push({
      name: 'Unarmed Strike',
      type: 'melee',
      actionCount: 1,
      traits: ['Attack', 'Melee', 'Unarmed'],
      attackMod: attackBonus,
      damage: `1d4${strMod !== 0 ? (strMod > 0 ? '+' + strMod : strMod) : ''}`,
      damageType: 'bludgeoning',
      description: 'A strike with your fist or another body part.',
    });
  }

  // Post-process: normalise Metal Blast variable actions, fill in missing type, tag defense
  return allStrikes
    .map(strike => {
      if (strike.name?.includes('Metal Blast')) {
        return { ...strike, actions: 'One to Two Actions', variableActionCount: { min: 1, max: 2 } };
      }
      return strike;
    })
    .map(strike => ({
      ...strike,
      type: strike.type || (strike.traits?.includes('Ranged') ? 'ranged' : 'melee'),
      targetDefense: 'ac',
    }));
};

/**
 * Categorize strikes by type (melee/ranged)
 * @param {Array} strikes - Array of strike objects
 * @returns {{ melee: Array, ranged: Array }}
 */
export const categorizeStrikesByType = (strikes) => ({
  melee: strikes.filter(s => s.type === 'melee'),
  ranged: strikes.filter(s => s.type === 'ranged'),
});
