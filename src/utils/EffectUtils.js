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

// The three attack-roll stats. A modifier with `stat: 'attacks'` fans out to all
// of them (mirrors the `'skills'` meta-stat, #274) so a bonus that applies to
// every attack roll — e.g. Limned's "+1 to attack rolls vs the limned target" —
// is authored once instead of three times.
export const ATTACK_KEYS = ['meleeAttack', 'rangedAttack', 'spellAttack'];

const BONUS_KEYS = [...STAT_KEYS, ...SKILL_KEYS];

const EMPTY = { total: 0, sources: [] };

function bestOfKind(candidates) {
  // candidates: Array of { amount, label }  (amount may be negative — #338)
  // PF2e: per bonus type only the highest *bonus* applies, and only the worst
  // *penalty* applies — but a bonus and a penalty of the same type both apply
  // and net. So pick the best positive and the worst negative and sum them.
  const bonuses   = candidates.filter((c) => c.amount > 0);
  const penalties = candidates.filter((c) => c.amount < 0);
  if (!bonuses.length && !penalties.length) return EMPTY;

  const sources = [];
  let total = 0;
  if (bonuses.length) {
    const best = bonuses.reduce((a, b) => (b.amount > a.amount ? b : a));
    total += best.amount;
    sources.push({ label: best.label, bonus: best.amount });
  }
  if (penalties.length) {
    const worst = penalties.reduce((a, b) => (b.amount < a.amount ? b : a));
    total += worst.amount;
    sources.push({ label: worst.label, penalty: worst.amount });
  }
  return { total, sources };
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
    const empties = Object.fromEntries(BONUS_KEYS.map((k) => [k, EMPTY]));
    return { ...empties, _conditional: {} };
  }

  // Build per-stat, per-kind candidate lists
  const buckets = {};
  for (const stat of BONUS_KEYS) {
    buckets[stat] = { status: [], circumstance: [], item: [] };
  }
  // Conditional ('vs X') modifiers are NOT netted into the always-on total —
  // the app can't know a roll's context (e.g. saving "vs poison"). They're
  // collected per stat so consumers can surface them as a hint or roll-time
  // toggle (#338). Shape: { [stat]: [{ amount, kind, label, vs }] }.
  const conditional = {};

  for (const entry of activeEffects) {
    const def = catalog.find((e) => e.id === entry.effectId);
    if (!def || !def.modifiers || def.modifiers.length === 0) continue;
    const label = def.name;
    for (const mod of def.modifiers) {
      const kind = mod.kind === 'status' || mod.kind === 'circumstance' ? mod.kind : 'item';
      // 'skills'/'attacks' fan out to every skill/attack bucket; otherwise target one stat.
      const targets = mod.stat === 'skills' ? SKILL_KEYS
        : mod.stat === 'attacks' ? ATTACK_KEYS
        : [mod.stat];
      for (const stat of targets) {
        if (!buckets[stat]) continue;
        if (mod.vs) {
          (conditional[stat] ||= []).push({ amount: mod.amount, kind, label, vs: mod.vs });
        } else {
          buckets[stat][kind].push({ amount: mod.amount, label });
        }
      }
    }
  }

  const result = { _conditional: conditional };
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
 * Conditional ('vs X') effect modifiers targeting a given stat/skill, for
 * consumers that surface them as a hint (saves) or a roll-time toggle (skills).
 * Returns [] when none. Safe to call with the raw effects array (#338).
 *
 * @param {Array}  activeEffects - from useEffects(charId).effects
 * @param {string} stat          - stat or skill id (e.g. 'fort', 'athletics')
 * @param {Array}  [catalog]     - defaults to PF2E_EFFECTS
 * @returns {Array<{ amount, kind, label, vs }>}
 */
export function conditionalModifiersFor(activeEffects, stat, catalog = PF2E_EFFECTS) {
  const { _conditional } = computeEffectBonuses(activeEffects, catalog);
  return _conditional[stat] || [];
}

/**
 * Conditional ('vs X') effect modifiers for a stat, shaped as opt-in roll-time
 * toggle line items `[{ id, label, bonus }]` for SkillActionModal (#338) and the
 * attack/spell resolvers (#274). Stable id from label+vs so toggle state survives
 * re-renders. Shared by both surfaces to keep one mapping.
 *
 * @param {Array}  activeEffects - active effects (cnmh_effects_<id>)
 * @param {string} stat          - stat/skill id (e.g. 'meleeAttack', 'athletics')
 * @param {Array}  [catalog]     - defaults to PF2E_EFFECTS
 * @returns {Array<{ id, label, bonus }>}
 */
export function conditionalTogglesFor(activeEffects, stat, catalog = PF2E_EFFECTS) {
  return conditionalModifiersFor(activeEffects, stat, catalog).map((m) => ({
    id: `effect-${m.label}-${m.vs}`,
    label: `${m.label} (vs ${m.vs})`,
    bonus: m.amount,
  }));
}

/**
 * Lowest Dexterity cap imposed by active effects (#507). A `dexCap` modifier
 * declares an *absolute* ceiling on the Dexterity modifier that contributes to a
 * derived stat — e.g. the Drakeheart Mutagen's "Dexterity cap of +2". It's a
 * ceiling, NOT an additive bonus, so it deliberately does not flow through
 * computeEffectBonuses / bestOfKind (`stat: 'dexCap'` isn't a bonus bucket and
 * is dropped there). Per PF2e ("use your lowest Dexterity cap if you have more
 * than one"), when several apply the LOWEST (most restrictive) wins, and it
 * composes with the worn armor's own cap the same way. `vs`-scoped caps are
 * ignored (a cap isn't a roll-time toggle). Returns `Infinity` when no effect
 * imposes a cap — a no-op for the AC `min()`.
 *
 * Currently consumed by AC only (the sole Dex-derived stat; Reflex needs the
 * save derivation tracked in #796).
 *
 * @param {Array}  activeEffects - active effects (cnmh_effects_<id>)
 * @param {Array}  [catalog]     - defaults to PF2E_EFFECTS
 * @returns {number} the lowest effect-imposed Dex cap, or Infinity if none
 */
export function dexCapFor(activeEffects, catalog = PF2E_EFFECTS) {
  if (!activeEffects || activeEffects.length === 0) return Infinity;
  let cap = Infinity;
  for (const entry of activeEffects) {
    const def = catalog.find((e) => e.id === entry.effectId);
    if (!def || !def.modifiers) continue;
    for (const mod of def.modifiers) {
      if (mod.stat !== 'dexCap' || mod.vs) continue;
      const amount = typeof mod.amount === 'number' ? mod.amount : Infinity;
      cap = Math.min(cap, amount);
    }
  }
  return cap;
}

/**
 * Highest amount of a special, non-bonus damage modifier (`resistance` /
 * `weakness`) matching a damage descriptor. These stats carry no bonus `kind`,
 * never net through computeEffectBonuses (`!buckets[stat]` drops them, like
 * `dexCap`), and per PF2e do NOT stack — the single highest matching amount
 * wins. A modifier's `vs` is a comma-separated descriptor list (e.g.
 * `'persistent-bleed,persistent-poison'`) matched exactly against `vsType`.
 *
 * Shared core of resistanceFor/weaknessFor (#900/#918), generic over the
 * descriptor so the persistent-tick path (`persistent-bleed`) and the general
 * incoming-damage path (`fire`) use one reader.
 */
// A stored effect entry's modifiers: the catalog def's static modifiers, plus
// any INLINE modifiers on the entry itself (#1001 S2). Inline modifiers let an
// effect carry a parametrized value/descriptor that a static catalog def can't —
// e.g. Energy Ablation's resistance = the cast spell's rank vs a chosen energy
// type. Backward-compatible: entries without inline modifiers behave as before.
function modifiersOf(entry, catalog) {
  const def = catalog.find((e) => e.id === entry.effectId);
  return [
    ...(def && Array.isArray(def.modifiers) ? def.modifiers : []),
    ...(Array.isArray(entry.modifiers) ? entry.modifiers : []),
  ];
}

function highestSpecialFor(activeEffects, stat, vsType, catalog) {
  if (!activeEffects || activeEffects.length === 0 || !vsType) return 0;
  let best = 0;
  for (const entry of activeEffects) {
    for (const mod of modifiersOf(entry, catalog)) {
      if (mod.stat !== stat || !mod.vs) continue;
      const types = String(mod.vs).split(',').map((t) => t.trim());
      if (!types.includes(vsType)) continue;
      const amount = typeof mod.amount === 'number' ? mod.amount : 0;
      if (amount > best) best = amount;
    }
  }
  return best;
}

/**
 * Highest damage resistance an active effect grants against `vsType` (#900) —
 * reduces matching incoming/persistent damage. Returns 0 when nothing matches.
 *
 * @param {Array}  activeEffects - active effects (cnmh_effects_<id>)
 * @param {string} vsType        - damage descriptor (e.g. 'persistent-bleed')
 * @param {Array}  [catalog]     - defaults to PF2E_EFFECTS
 * @returns {number} the highest matching resistance, or 0 if none
 */
export function resistanceFor(activeEffects, vsType, catalog = PF2E_EFFECTS) {
  return highestSpecialFor(activeEffects, 'resistance', vsType, catalog);
}

/**
 * Highest damage weakness an active effect imposes against `vsType` (#918) — the
 * inverse of resistanceFor: a `weakness` modifier ADDS its amount to matching
 * incoming/persistent damage. Like resistance it's a special non-bonus modifier
 * and does NOT stack (highest matching wins). When both apply, the apply site
 * sequences them (PF2e: weakness first, then resistance). Returns 0 if none.
 *
 * @param {Array}  activeEffects - active effects (cnmh_effects_<id>)
 * @param {string} vsType        - damage descriptor (e.g. 'fire')
 * @param {Array}  [catalog]     - defaults to PF2E_EFFECTS
 * @returns {number} the highest matching weakness, or 0 if none
 */
export function weaknessFor(activeEffects, vsType, catalog = PF2E_EFFECTS) {
  return highestSpecialFor(activeEffects, 'weakness', vsType, catalog);
}

/**
 * True when an active `resistance` effect against `vsType` carries the
 * `flatCheckEase` flag (#900) — Blood Booster lowers the recovery flat-check DC
 * for persistent bleed/poison "as if you received particularly appropriate aid"
 * (DC 10 instead of 15). Independent of `resistanceFor` so the apply site can
 * ease the DC even where the matching resistance amount is 0.
 *
 * @param {Array}  activeEffects - active effects (cnmh_effects_<id>)
 * @param {string} vsType        - damage descriptor (e.g. 'persistent-bleed')
 * @param {Array}  [catalog]     - defaults to PF2E_EFFECTS
 * @returns {boolean}
 */
export function flatCheckEasedFor(activeEffects, vsType, catalog = PF2E_EFFECTS) {
  if (!activeEffects || activeEffects.length === 0 || !vsType) return false;
  for (const entry of activeEffects) {
    for (const mod of modifiersOf(entry, catalog)) {
      if (mod.stat !== 'resistance' || !mod.flatCheckEase || !mod.vs) continue;
      const types = String(mod.vs).split(',').map((t) => t.trim());
      if (types.includes(vsType)) return true;
    }
  }
  return false;
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
