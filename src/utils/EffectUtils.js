// PF2e bonus stacking rules (mirror of ConditionUtils penalty rules):
//   Status bonuses:       only the *highest* applies per stat
//   Circumstance bonuses: only the *highest* applies per stat
//   Item bonuses:         only the *highest* applies per stat
//   Different bonus types DO stack with each other
//
// computeEffectBonuses mirrors the shape returned by computeConditionEffects
// so StatsBlock can combine them at the same site.

import PF2E_EFFECTS from '../data/pf2eEffects';

const STAT_KEYS = [
  'ac', 'fort', 'reflex', 'will',
  'meleeAttack', 'rangedAttack', 'spellAttack',
  'spellDC', 'classDC', 'perception', 'speed',
];

// Skill check bonus keys (#447). The fixed PF2e skill list (perception stays a
// STAT_KEY — it has its own sheet line). A modifier with `stat: 'skills'` fans
// out to all of these; one with `stat: '<skillId>'` targets a single skill.
// resolveActionRoll already reads effectBonuses[skillId] for both the
// type:'skill' and highlightSkill paths. Kept as a local literal (rather than
// derived from CharacterUtils.SKILL_ABILITY_MAP) so this pure util has no
// module-load dependency that test mocks of CharacterUtils could break.
export const SKILL_KEYS = [
  'acrobatics', 'arcana', 'athletics', 'crafting', 'deception', 'diplomacy',
  'intimidation', 'medicine', 'nature', 'occultism', 'performance', 'religion',
  'society', 'stealth', 'survival', 'thievery',
];

const BONUS_KEYS = [...STAT_KEYS, ...SKILL_KEYS];

const EMPTY = { total: 0, sources: [] };

function bestOfKind(candidates) {
  // candidates: Array of { amount, label }
  // Returns { total: +N, sources: [{ label, bonus: N }] } for the best (highest)
  const active = candidates.filter((c) => c.amount > 0);
  if (!active.length) return EMPTY;
  const best = active.reduce((a, b) => (b.amount > a.amount ? b : a));
  return { total: best.amount, sources: [{ label: best.label, bonus: best.amount }] };
}

function combineBonus(...parts) {
  return {
    total: parts.reduce((sum, p) => sum + p.total, 0),
    sources: parts.flatMap((p) => p.sources),
  };
}

/**
 * Compute all effect-derived bonuses for the character sheet.
 *
 * @param {Array} activeEffects   - from useEffects(charId).effects
 * @param {Array} [catalog]       - defaults to PF2E_EFFECTS
 * @returns {object} bonus objects keyed by stat name
 */
export function computeEffectBonuses(activeEffects, catalog = PF2E_EFFECTS) {
  if (!activeEffects || activeEffects.length === 0) {
    return Object.fromEntries(BONUS_KEYS.map((k) => [k, EMPTY]));
  }

  // Build per-stat, per-kind candidate lists
  const buckets = {};
  for (const stat of BONUS_KEYS) {
    buckets[stat] = { status: [], circumstance: [], item: [] };
  }

  for (const entry of activeEffects) {
    const def = catalog.find((e) => e.id === entry.effectId);
    if (!def || !def.modifiers || def.modifiers.length === 0) continue;
    const label = def.name;
    for (const mod of def.modifiers) {
      const kind = mod.kind === 'status' || mod.kind === 'circumstance' ? mod.kind : 'item';
      // 'skills' fans out to every skill bucket; otherwise target one stat/skill.
      const targets = mod.stat === 'skills' ? SKILL_KEYS : [mod.stat];
      for (const stat of targets) {
        if (!buckets[stat]) continue;
        buckets[stat][kind].push({ amount: mod.amount, label });
      }
    }
  }

  const result = {};
  for (const stat of BONUS_KEYS) {
    const b = buckets[stat];
    result[stat] = combineBonus(
      bestOfKind(b.status),
      bestOfKind(b.circumstance),
      bestOfKind(b.item),
    );
  }
  return result;
}

/**
 * True when an active effect should be dropped at encounter end: either it's
 * turn/round-bound (carries an `expireAt`) or its catalog entry is flagged
 * `encounterScoped` (e.g. eld-charged, #275). Used by both encounter-end sweeps.
 *
 * @param {object} effect           - an active-effects entry ({ effectId, expireAt?, … })
 * @param {Array}  [catalog]        - defaults to PF2E_EFFECTS
 */
export function isEncounterScopedEffect(effect, catalog = PF2E_EFFECTS) {
  if (!effect) return false;
  if (effect.expireAt) return true;
  return !!catalog.find((d) => d.id === effect.effectId)?.encounterScoped;
}

/**
 * True when an active effect declares it should be cleared by the given incoming
 * damage type (catalog `clearOnDamageType`, e.g. eld-charged → 'electricity', #275).
 *
 * @param {object} effect           - an active-effects entry
 * @param {string} type             - the damage type being applied
 * @param {Array}  [catalog]        - defaults to PF2E_EFFECTS
 */
export function clearsOnDamageType(effect, type, catalog = PF2E_EFFECTS) {
  if (!effect || !type) return false;
  return catalog.find((d) => d.id === effect.effectId)?.clearOnDamageType === type;
}

/**
 * Combine a ConditionUtils penalty object with an EffectUtils bonus object
 * into a single net-modifier object suitable for PenaltyDisplay.
 */
export function combineModifiers(penalty, bonus) {
  const p = penalty || EMPTY;
  const b = bonus || EMPTY;
  if (p.total === 0 && b.total === 0) return EMPTY;
  return {
    total: p.total + b.total,
    sources: [
      ...p.sources.map((s) => ({ ...s, isBuff: false })),
      ...b.sources.map((s) => ({ ...s, isBuff: true })),
    ],
  };
}
