// Roll resolution helper — determines how a given ability should be rolled and what the net bonus is.
//
// Two modes:
//   actor-roll  — the acting player enters a raw d20; UI adds the actor's bonus → total vs enemy defense DC
//   target-save — the acting player casts and the GM resolves each enemy's save vs caster's Spell DC
//   none        — no roll (move, buff, etc.)
//
// The returned bonus/dc is the *effective* value after applying any active conditions and effects on
// the actor — the same penalty+bonus pipeline that StatsBlock uses.

import { getSkillModifier, getClassDC, SKILL_ABILITY_MAP } from './CharacterUtils';
import { calculateSpellStats } from './SpellUtils';
import { computeConditionEffects } from './ConditionUtils';
import { computeEffectBonuses, combineModifiers } from './EffectUtils';
import { isAttackAbility, mapPenaltyFor } from './map';

// Maps the capitalized spell.defense field ("Reflex") to the lowercase defense
// key used everywhere else. A leading "basic " ("basic Reflex") denotes a basic
// save — strip it before mapping so those spells still resolve to target-save
// (isBasicDefense reports the basic-ness separately for the halving/doubling).
export function mapSpellDefense(d) {
  const norm = String(d ?? '').replace(/^\s*basic\s+/i, '').trim();
  return { Reflex: 'reflex', Will: 'will', Fortitude: 'fortitude' }[norm] ?? null;
}

// True when a defense string denotes a *basic* save ("basic Fortitude"): the
// target halves on success and doubles on a critical failure. Drives the `basic`
// flag on save requests (computeSaveDamage keys its multiplier off it).
export function isBasicDefense(d) {
  return /^\s*basic\s+/i.test(String(d ?? ''));
}

// Build the full net-modifier object from the actor's current conditions/effects for a given stat.
function netForStat(stat, conditionEffects, effectBonuses) {
  const penalty = conditionEffects[stat] ?? { total: 0, sources: [] };
  const bonus   = effectBonuses[stat]    ?? { total: 0, sources: [] };
  return combineModifiers(penalty, bonus);
}

/**
 * Determine how an ability should be rolled and what the net bonus/DC is.
 *
 * @param {Object} ability    - The action / spell / strike object
 * @param {Object} character  - The acting character
 * @param {Object} [opts]
 * @param {Array}  [opts.conditions=[]]      - Active conditions from cnmh_conditions_{id}
 * @param {Array}  [opts.effects=[]]         - Active effects from useEffects(id).effects
 * @param {Array}  [opts.effectCatalog]      - Optional override for PF2E_EFFECTS catalog
 * @param {number} [opts.mapStep=0]          - Multiple Attack Penalty step (0–2); applies only
 *                                             to actor-roll results for Attack-trait abilities
 *
 * @returns {{
 *   mode:      'actor-roll'|'target-save'|'none',
 *   bonus:     number|null,   // net bonus for actor-roll; null = resolver shows manual-total input
 *   dc:        number|null,   // net Spell DC for target-save
 *   defense:   string|null,   // 'ac'|'fortitude'|'reflex'|'will'
 *   skill:     string|null,   // skill id when sourced from a skill (for display)
 *   source:    string,
 *   breakdown: Object|null,   // { base, total, sources } for tooltip display
 * }}
 */
export function resolveActionRoll(ability, character, opts = {}) {
  const result = resolveBase(ability, character, opts);

  // Apply MAP post-hoc so every attack path (strike, spell attack, Attack-trait
  // maneuver) gets it without touching each branch. Target-save spells, non-attack
  // abilities and the manual-total (bonus: null) path are untouched.
  const penalty = mapPenaltyFor(ability, opts.mapStep ?? 0);
  if (penalty !== 0 && result.mode === 'actor-roll' && result.bonus != null && isAttackAbility(ability)) {
    return {
      ...result,
      bonus: result.bonus + penalty,
      breakdown: result.breakdown && {
        ...result.breakdown,
        total: result.breakdown.total + penalty,
        sources: [...result.breakdown.sources, { label: 'Multiple attack penalty', penalty, isBuff: false }],
      },
    };
  }
  return result;
}

function resolveBase(ability, character, { conditions = [], effects = [], effectCatalog } = {}) {
  const none = { mode: 'none', bonus: null, dc: null, defense: null, skill: null, source: 'none', breakdown: null };

  if (!ability || !character) return none;

  // Pre-compute condition penalties and effect bonuses once.
  const conditionEffects = computeConditionEffects(conditions, character.keyAbility, character.level || 1);
  const effectBonuses    = computeEffectBonuses(effects, effectCatalog);

  // ─── Priority 1: explicit ability.roll config ─────────────────────────────
  const roll = ability.roll;
  if (roll && roll.type) {
    const type = roll.type;

    if (type === 'flat') {
      const base = typeof roll.bonus === 'number' ? roll.bonus : 0;
      return {
        mode: 'actor-roll',
        bonus: base, // flat override: not netted against conditions
        dc: null,
        defense: ability.targetDefense || 'ac',
        skill: null,
        source: 'roll-config-flat',
        breakdown: { base, total: base, sources: [] },
      };
    }

    if (type === 'strike') {
      const base = typeof ability.attackMod === 'number' ? ability.attackMod : 0;
      const overrideBonus = typeof roll.bonus === 'number' ? roll.bonus : null;
      const strikeType = ability.type === 'ranged' ? 'rangedAttack' : 'meleeAttack';
      const net = netForStat(strikeType, conditionEffects, effectBonuses);
      const finalBase = overrideBonus ?? base;
      const total = finalBase + net.total;
      return {
        mode: 'actor-roll',
        bonus: total,
        dc: null,
        defense: 'ac',
        skill: null,
        source: 'roll-config-strike',
        breakdown: { base: finalBase, total, sources: net.sources },
      };
    }

    if (type === 'skill' && roll.skill) {
      const skillId = roll.skill;
      const abilityKey = SKILL_ABILITY_MAP[skillId] ?? 'strength';
      const base = typeof roll.bonus === 'number' ? roll.bonus : getSkillModifier(character, skillId);
      const skillNet = conditionEffects.skillPenalty ? conditionEffects.skillPenalty(abilityKey) : { total: 0, sources: [] };
      const skillBonus = effectBonuses[skillId] ?? { total: 0, sources: [] };
      const net = combineModifiers(skillNet, skillBonus);
      const total = base + net.total;
      return {
        mode: 'actor-roll',
        bonus: total,
        dc: null,
        defense: ability.targetDefense || null,
        skill: skillId,
        source: 'roll-config-skill',
        breakdown: { base, total, sources: net.sources },
      };
    }

    if (type === 'spell-attack') {
      const { spellAttackMod } = calculateSpellStats(character);
      const base = typeof roll.bonus === 'number' ? roll.bonus : spellAttackMod;
      const net = netForStat('spellAttack', conditionEffects, effectBonuses);
      const total = base + net.total;
      return {
        mode: 'actor-roll',
        bonus: total,
        dc: null,
        defense: 'ac',
        skill: null,
        source: 'roll-config-spell-attack',
        breakdown: { base, total, sources: net.sources },
      };
    }

    if (type === 'spell-dc') {
      const { spellDC } = calculateSpellStats(character);
      const base = typeof roll.bonus === 'number' ? roll.bonus : spellDC;
      const net = netForStat('spellDC', conditionEffects, effectBonuses);
      const total = base + net.total;
      const defense = mapSpellDefense(ability.defense) ?? ability.targetDefense ?? null;
      return {
        mode: 'target-save',
        bonus: null,
        dc: total,
        defense,
        skill: null,
        source: 'roll-config-spell-dc',
        breakdown: { base, total, sources: net.sources },
      };
    }

    if (type === 'class-dc') {
      const base = typeof roll.bonus === 'number' ? roll.bonus : getClassDC(character);
      const net = netForStat('classDC', conditionEffects, effectBonuses);
      const total = base + net.total;
      const defense = mapSpellDefense(ability.defense) ?? ability.targetDefense ?? null;
      return {
        mode: 'target-save',
        bonus: null,
        dc: total,
        defense,
        skill: null,
        source: 'roll-config-class-dc',
        breakdown: { base, total, sources: net.sources },
      };
    }
  }

  // ─── Priority 2: strike with computed numeric attackMod ────────────────────
  if (typeof ability.attackMod === 'number') {
    const strikeType = ability.type === 'ranged' ? 'rangedAttack' : 'meleeAttack';
    const net = netForStat(strikeType, conditionEffects, effectBonuses);
    const base = ability.attackMod;
    const total = base + net.total;
    return {
      mode: 'actor-roll',
      bonus: total,
      dc: null,
      defense: 'ac',
      skill: null,
      source: 'strike',
      breakdown: { base, total, sources: net.sources },
    };
  }

  // ─── Priority 3: highlightSkill (Grapple, Trip, Shove, Feint, …) ──────────
  if (ability.highlightSkill) {
    const skillId = ability.highlightSkill;
    const abilityKey = SKILL_ABILITY_MAP[skillId] ?? 'strength';
    const base = getSkillModifier(character, skillId);
    const skillNet = conditionEffects.skillPenalty ? conditionEffects.skillPenalty(abilityKey) : { total: 0, sources: [] };
    const skillBonus = effectBonuses[skillId] ?? { total: 0, sources: [] };
    const net = combineModifiers(skillNet, skillBonus);
    const total = base + net.total;
    return {
      mode: 'actor-roll',
      bonus: total,
      dc: null,
      defense: ability.targetDefense || null,
      skill: skillId,
      source: 'highlight-skill',
      breakdown: { base, total, sources: net.sources },
    };
  }

  // ─── Priority 4: spell inference ──────────────────────────────────────────
  // An Action trait + spellcasting → spell attack roll (actor-roll).
  // A defense field ("Reflex") without Attack trait → save spell (target-save).
  const hasAttackTrait  = Array.isArray(ability.traits) && ability.traits.includes('Attack');
  const hasSpellcasting = character.spellcasting && character.spellcasting.ability;

  if (hasAttackTrait && hasSpellcasting && ability.defense) {
    // Spell attack cantrip that also has a defense — treat as actor-roll spell attack.
    const { spellAttackMod } = calculateSpellStats(character);
    const net = netForStat('spellAttack', conditionEffects, effectBonuses);
    const total = spellAttackMod + net.total;
    return {
      mode: 'actor-roll',
      bonus: total,
      dc: null,
      defense: 'ac',
      skill: null,
      source: 'spell-attack-inferred',
      breakdown: { base: spellAttackMod, total, sources: net.sources },
    };
  }

  if (ability.defense) {
    const defense = mapSpellDefense(ability.defense);
    if (defense) {
      const { spellDC } = calculateSpellStats(character);
      const net = netForStat('spellDC', conditionEffects, effectBonuses);
      const total = spellDC + net.total;
      return {
        mode: 'target-save',
        bonus: null,
        dc: total,
        defense,
        skill: null,
        source: 'spell-save-inferred',
        breakdown: { base: spellDC, total, sources: net.sources },
      };
    }
  }

  if (hasAttackTrait && hasSpellcasting) {
    const { spellAttackMod } = calculateSpellStats(character);
    const net = netForStat('spellAttack', conditionEffects, effectBonuses);
    const total = spellAttackMod + net.total;
    return {
      mode: 'actor-roll',
      bonus: total,
      dc: null,
      defense: 'ac',
      skill: null,
      source: 'spell-attack-inferred',
      breakdown: { base: spellAttackMod, total, sources: net.sources },
    };
  }

  if (ability.targetDefense === 'ac') {
    return {
      mode: 'actor-roll',
      bonus: null,
      dc: null,
      defense: 'ac',
      skill: null,
      source: 'ac-target-no-bonus',
      breakdown: null,
    };
  }

  return none;
}
