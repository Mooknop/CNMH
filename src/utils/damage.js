// Canonical PF2e damage types — the shared source for type pickers (e.g. the GM
// Adjust HP flow, #275). Persistent-damage riders elsewhere use free-form `type`
// strings; this list is for UI selection, not validation.
export const DAMAGE_TYPES = [
  'bludgeoning', 'piercing', 'slashing',
  'acid', 'cold', 'electricity', 'fire', 'sonic',
  'vitality', 'void', 'force', 'mental', 'poison', 'bleed', 'precision',
];

// Pure helpers for the damage step (#222). After a hit/crit the resolver shows
// a damage entry: the player rolls the dice physically and enters the total;
// the app adds toggled riders, doubles on a crit, and applies weakness last
// (weakness is per-target and never doubled — PF2e damage order).
//
// Rider sources, all sharing one shape (see buildDamageProfile):
//   - ability/strike data:  ability.damageData.riders ?? ability.riders
//   - character data:       character.damageRiders (e.g. Implement's Empowerment)
//   - runtime:              the actor's active Exploit Vulnerability weakness
// Kept side-effect-free so the modal, resolver, and tests share the same algebra.
//
// Rider `on` degrees are mode-relative: attack riders default to
// ['success','criticalSuccess'] (the attacker's roll), save riders to
// ['failure','criticalFailure'] (the target's save). Author accordingly —
// no ability is resolved through both modes.

import { getAbilityModifier } from './CharacterUtils';
import { heightenedEntriesFor } from './spellHeighten';
import { scaleDamageText } from './eldScaling';

// '2d6+3' → { dice: [{count: 2, size: 6}], flat: 3 }; null on anything that
// isn't plain dice notation (damage strings are hand-curated; skip, don't throw).
export const parseDamageExpression = (str) => {
  if (typeof str !== 'string' || !str.trim()) return null;
  const terms = str.replace(/\s+/g, '').replace(/-/g, '+-').split('+').filter(Boolean);
  const dice = [];
  let flat = 0;
  for (const term of terms) {
    const die = /^(\d+)d(\d+)$/i.exec(term);
    if (die) {
      dice.push({ count: Number(die[1]), size: Number(die[2]) });
      continue;
    }
    const num = /^-?\d+$/.exec(term);
    if (num) {
      flat += Number(term);
      continue;
    }
    return null;
  }
  return dice.length || terms.length ? { dice, flat } : null;
};

// Total dice in an expression — drives perWeaponDie riders ('2d8+4' → 2).
export const weaponDiceCount = (expression) => {
  const parsed = parseDamageExpression(expression);
  if (!parsed) return 0;
  return parsed.dice.reduce((sum, d) => sum + d.count, 0);
};

// Sum two expressions, the second applied `times` over (heightening repeats
// relative steps): '2d12' + '1d12'×2 → '4d12'; '1d4' + '1'×2 → '1d4+2'.
// Unparseable input on either side returns the base unchanged.
export const addExpressions = (base, add, times = 1) => {
  const a = parseDamageExpression(base);
  const b = parseDamageExpression(typeof add === 'number' ? String(add) : add);
  if (!a || !b || times < 1) return base;
  const dice = a.dice.map((d) => ({ ...d }));
  for (const bd of b.dice) {
    const existing = dice.find((d) => d.size === bd.size);
    if (existing) existing.count += bd.count * times;
    else dice.push({ count: bd.count * times, size: bd.size });
  }
  const flat = a.flat + b.flat * times;
  const diceStr = dice.map((d) => `${d.count}d${d.size}`).join('+');
  if (!diceStr) return String(flat);
  return flat ? `${diceStr}${flat > 0 ? '+' : ''}${flat}` : diceStr;
};

// '1d4' → '2d4' — crit-doubled persistent dice are rolled doubled, not ×2'd.
export const doubleDice = (expression) => {
  const parsed = parseDamageExpression(expression);
  if (!parsed) return expression;
  const dice = parsed.dice.map((d) => `${d.count * 2}d${d.size}`).join('+');
  const flat = parsed.flat * 2;
  if (!dice) return String(flat);
  return flat ? `${dice}${flat > 0 ? '+' : ''}${flat}` : dice;
};

// Numeric add for a bonus rider. Forms: { flat: n } | { perWeaponDie: n }
// (n × dice in the base expression) | { ability: 'constitution' } (actor's mod).
export const riderAmount = (rider, { expression, character } = {}) => {
  const bonus = rider?.bonus;
  if (!bonus) return 0;
  if (typeof bonus.flat === 'number') return bonus.flat;
  if (typeof bonus.perWeaponDie === 'number') {
    return bonus.perWeaponDie * weaponDiceCount(expression);
  }
  if (typeof bonus.ability === 'string') {
    return getAbilityModifier(character?.abilities?.[bonus.ability]);
  }
  return 0;
};

const HIT_DEGREES = ['success', 'criticalSuccess'];

// Entry ids whose creature traits include `trait` (case-insensitive). Targets
// with NO trait data — manually-added enemies that never came from Foundry/the
// bestiary — can't be disproven, so they stay in (GM keeps the call). Drives
// `appliesVsTrait` riders such as Vitalizing's "vs undead" (#548).
export const traitGatedEntryIds = (trait, enemyEntries) => {
  const want = String(trait || '').toLowerCase();
  return (enemyEntries || [])
    .filter((e) => {
      const traits = e?.bestiary?.traits;
      if (!Array.isArray(traits) || !traits.length) return true;
      return traits.some((t) => String(t).toLowerCase() === want);
    })
    .map((e) => e.entryId);
};

// A non-bonus rider with an `appliesToEntryIds` allow-list fires only for those
// targets; without one it fires for every target (default-on). Distinct from
// weakness riders, which are opt-in and require the list.
const riderMatchesEntry = (rider, entryId) =>
  !Array.isArray(rider.appliesToEntryIds) || rider.appliesToEntryIds.includes(entryId);

// A rider is on unless the player unticked it (or it was authored defaultOn:false).
export const riderEnabled = (rider, riderState) =>
  riderState?.[rider.id] ?? rider.defaultOn !== false;

const riderAppliesOnDegree = (rider, degree) =>
  (rider.on ?? HIT_DEGREES).includes(degree);

/**
 * Final damage for one target. `entered` is the player's rolled total
 * (un-doubled); numeric riders add before crit doubling, weakness after.
 *
 * Multi-instance entry (#1019 — flaming runes): when the profile deals more
 * than one damage type, pass `instances: [{ amount, type }]` (one per
 * damageEntryParts part, base first) instead of `entered`. Numeric riders and
 * weakness attach to the base instance; a crit doubles every instance. The
 * result then carries `instances: [{ amount, type }]` for the typed Foundry
 * relay, and `final` is their sum — the single-total algebra unchanged.
 *
 * @returns {null|{ entered, final, parts, persistent, riderIds, instances? }}
 *   parts:      { base, riders: [{label, amount}], crit, weaknesses: [{label, amount}] }
 *   persistent: [{ dice, type, label }] — display/log only in this slice (#222 slice 3 tracks)
 */
export const computeTargetDamage = ({
  entered,
  instances = null,
  degree,
  riders = [],
  riderState = {},
  entryId,
  critDouble = true,
}) => {
  const multi = Array.isArray(instances) && instances.length > 0;
  if (multi) {
    if (instances.some((i) => typeof i?.amount !== 'number' || Number.isNaN(i.amount))) {
      return null;
    }
    entered = instances.reduce((sum, i) => sum + i.amount, 0);
  }
  if (typeof entered !== 'number' || Number.isNaN(entered)) return null;
  if (!HIT_DEGREES.includes(degree)) return null;

  const enabled = riders.filter(
    (r) => riderEnabled(r, riderState) && riderAppliesOnDegree(r, degree)
  );
  const isCrit = degree === 'criticalSuccess' && critDouble;

  const bonusParts = enabled
    .filter((r) => r.bonus)
    .map((r) => ({ label: r.label, amount: riderAmount(r, r.ctx) }))
    .filter((p) => p.amount !== 0);
  const bonusSum = bonusParts.reduce((sum, p) => sum + p.amount, 0);

  let total = entered + bonusSum;
  if (isCrit) total *= 2;

  const weaknessParts = enabled
    .filter((r) => typeof r.weakness === 'number'
      && (r.appliesToEntryIds ?? []).includes(entryId))
    .map((r) => ({ label: r.label, amount: r.weakness }));
  const weaknessSum = weaknessParts.reduce((sum, p) => sum + p.amount, 0);
  total += weaknessSum;

  const outInstances = multi
    ? instances.map((inst, idx) => {
        let amount = inst.amount + (idx === 0 ? bonusSum : 0);
        if (isCrit) amount *= 2;
        if (idx === 0) amount += weaknessSum;
        return { amount, type: inst.type || '' };
      })
    : null;

  // Crit-exclusive persistent riders (flaming's "on a critical hit, 1d10
  // persistent fire") already state their crit amount — only riders that also
  // fire on a plain hit get their dice doubled (same carve-out as
  // computeSaveDamage's crit-fail-exclusive riders).
  const persistent = enabled
    .filter((r) => r.persistent?.dice && riderMatchesEntry(r, entryId))
    .map((r) => {
      const doubled = isCrit && (r.on ?? HIT_DEGREES).includes('success');
      return {
        dice: doubled ? doubleDice(r.persistent.dice) : r.persistent.dice,
        type: r.persistent.type || '',
        label: r.label,
      };
    });

  // Condition riders (#228 — Spines' clumsy 1) carry a rules note, not a
  // number. They ride the same degree gating and surface in the breakdown/log
  // for the GM to apply — never doubled.
  const conditions = enabled
    .filter((r) => r.condition && riderMatchesEntry(r, entryId))
    .map((r) => ({ label: r.label, condition: r.condition }));

  return {
    entered,
    final: total,
    parts: { base: entered, riders: bonusParts, crit: isCrit, weaknesses: weaknessParts },
    persistent,
    conditions,
    riderIds: enabled.map((r) => r.id),
    ...(outInstances ? { instances: outInstances } : {}),
  };
};

const SAVE_DAMAGE_DEGREES     = ['success', 'failure', 'criticalFailure'];
const SAVE_PERSISTENT_DEFAULT = ['failure', 'criticalFailure'];

/**
 * JSON-safe rider snapshots for a save request (#270). The caster's toggle
 * state is baked in (unticked riders are omitted — the GM does not re-toggle)
 * and numeric bonuses are pre-resolved, because the GM side has neither the
 * character nor the rider ctx. `appliesToEntryIds` survive as-is: they are the
 * same encounter entryIds the request's targets carry.
 */
export const serializeRidersForSave = (riders, riderState) =>
  (riders || [])
    .filter((r) => riderEnabled(r, riderState))
    .map((r) => {
      const amount = riderAmount(r, r.ctx);
      const out = { id: r.id, label: r.label };
      if (amount !== 0) out.amount = amount;
      if (typeof r.weakness === 'number') out.weakness = r.weakness;
      if (r.appliesToEntryIds) out.appliesToEntryIds = r.appliesToEntryIds;
      if (r.persistent?.dice) {
        out.persistent = { dice: r.persistent.dice, type: r.persistent.type || '' };
      }
      if (r.condition) out.condition = r.condition;
      if (r.on) out.on = r.on;
      return out;
    })
    .filter((r) => r.amount != null || r.weakness != null || r.persistent || r.condition);

/**
 * Per-target damage for a basic save (#270), from the caster's entered total
 * and the target's save degree: success halves (round down), failure takes it
 * full, critical failure doubles; critical success means no damage at all.
 * Bonus riders add before the degree multiplier, weakness after (never
 * multiplied, and only when some damage got through).
 *
 * Persistent riders default to `on: ['failure','criticalFailure']`. Dice are
 * doubled on a critical failure only when the rider also applies on a plain
 * failure — a crit-fail-exclusive rider (Shard Strike's bleed) already states
 * its crit amount. A rider authored to apply on a success keeps its dice and
 * is flagged `half: true` (basic saves halve persistent damage too).
 *
 * Riders here are serializeRidersForSave snapshots ({ amount } pre-resolved).
 * `entered` may be null for persistent-only profiles (Polarize) — the result
 * then carries `final: null` and only the persistent entries.
 *
 * @returns {null|{ entered, final, parts, persistent, riderIds }}
 */
export const computeSaveDamage = ({ entered, degree, riders = [], entryId }) => {
  if (!SAVE_DAMAGE_DEGREES.includes(degree)) return null;
  const enabled = riders.filter((r) => r.enabled !== false);

  const persistent = enabled
    .filter((r) => r.persistent?.dice
      && (r.on ?? SAVE_PERSISTENT_DEFAULT).includes(degree))
    .map((r) => {
      const doubled = degree === 'criticalFailure'
        && (r.on ?? SAVE_PERSISTENT_DEFAULT).includes('failure');
      return {
        dice: doubled ? doubleDice(r.persistent.dice) : r.persistent.dice,
        type: r.persistent.type || '',
        label: r.label,
        ...(degree === 'success' && { half: true }),
      };
    });

  // Condition riders (#228 — Spines' clumsy 1 on a critical failure). Same
  // degree default as persistent riders; surfaced for the GM to apply, never
  // halved or doubled by the save multiplier.
  const conditions = enabled
    .filter((r) => r.condition && (r.on ?? SAVE_PERSISTENT_DEFAULT).includes(degree))
    .map((r) => ({ label: r.label, condition: r.condition }));

  const hasEntered = typeof entered === 'number' && !Number.isNaN(entered);
  if (!hasEntered) {
    if (!persistent.length && !conditions.length) return null;
    return {
      entered: null,
      final: null,
      parts: { base: null, riders: [], multiplier: null, weaknesses: [] },
      persistent,
      conditions,
      riderIds: enabled.map((r) => r.id),
    };
  }

  const bonusParts = enabled
    .filter((r) => typeof r.amount === 'number' && r.amount !== 0
      && (r.on ?? SAVE_DAMAGE_DEGREES).includes(degree))
    .map((r) => ({ label: r.label, amount: r.amount }));

  let total = entered + bonusParts.reduce((sum, p) => sum + p.amount, 0);
  const multiplier = degree === 'success' ? 'half'
    : degree === 'criticalFailure' ? 'double'
    : null;
  if (multiplier === 'half') total = Math.floor(total / 2);
  if (multiplier === 'double') total *= 2;

  const weaknessParts = total > 0
    ? enabled
        .filter((r) => typeof r.weakness === 'number'
          && (r.on ?? SAVE_DAMAGE_DEGREES).includes(degree)
          && (r.appliesToEntryIds ?? []).includes(entryId))
        .map((r) => ({ label: r.label, amount: r.weakness }))
    : [];
  total += weaknessParts.reduce((sum, p) => sum + p.amount, 0);

  return {
    entered,
    final: total,
    parts: { base: entered, riders: bonusParts, multiplier, weaknesses: weaknessParts },
    persistent,
    conditions,
    riderIds: enabled.map((r) => r.id),
  };
};

// Compact log fragment: '30 (9 +4 Implement's Empowerment ×2 +4 weakness (fire))'
// plus ' · 1d4 persistent bleed (DC 15 flat to end)' per persistent entry and
// ' · clumsy 1 …' per condition rider. A bare total (no riders, no crit) logs
// as just the number. Save results render their degree multiplier
// ('half'/'×2'); damage-less results (final: null) log just the fragments.
export const formatDamageBreakdown = ({ final, parts, persistent = [], conditions = [] }) => {
  const persistentStr = persistent
    .map((p) => ` · ${p.dice} persistent ${p.type || 'damage'}${p.half ? ' (half)' : ''} (DC 15 flat to end)`)
    .join('')
    + conditions.map((c) => ` · ${c.condition}`).join('');
  if (final == null) return persistentStr.replace(/^ · /, '');
  const bits = [];
  for (const p of parts.riders) {
    bits.push(`${p.amount > 0 ? '+' : ''}${p.amount} ${p.label}`);
  }
  if (parts.crit || parts.multiplier === 'double') bits.push('×2');
  else if (parts.multiplier === 'half') bits.push('half');
  for (const w of parts.weaknesses) {
    bits.push(`+${w.amount} ${w.label}`);
  }
  const breakdown = bits.length ? `${final} (${parts.base} ${bits.join(' ')})` : String(final);
  return `${breakdown}${persistentStr}`;
};

// The exploited creature's weakness as a runtime rider, scoped to the matching
// targets: Personal Antithesis hits the exact combatant; Mortal Weakness hits
// every combatant sharing the exploited entry's creatureKey (manually-added
// enemies have no creatureKey and degrade to exact-entry matching).
const exploitRider = (exploit, enemyEntries, order) => {
  if (!exploit) return null;
  const matchIds = new Set([exploit.targetEntryId]);
  if (exploit.type === 'mortal') {
    const exploited = (order || []).find((e) => e.entryId === exploit.targetEntryId);
    if (exploited?.creatureKey) {
      for (const e of order) {
        if (e.kind === 'enemy' && e.creatureKey === exploited.creatureKey) {
          matchIds.add(e.entryId);
        }
      }
    }
  }
  const applies = (enemyEntries || []).filter((e) => matchIds.has(e.entryId));
  if (!applies.length) return null;
  const scope = exploit.type === 'mortal'
    ? `${exploit.weaknessType} ${exploit.value}`
    : `Personal Antithesis ${exploit.value}`;
  return {
    id: 'exploit-weakness',
    label: `weakness (${scope})`,
    weakness: exploit.value,
    appliesToEntryIds: applies.map((e) => e.entryId),
    defaultOn: true,
  };
};

/**
 * Damage profile for the resolver's damage panel — base dice hint plus the
 * riders that apply to this use. Returns null when the ability carries no
 * usable damage signal at all (no expression and no riders).
 *
 * Heightening: `damageData.heightened` maps cast-rank keys ('+1', '3rd' — same
 * algebra as spell.heightened) to `{ base?, persistent? }` increments. `base`
 * adds dice to the hint expression; `persistent` adds to every persistent
 * rider's dice (Shocking Grasp: '+1' → { base: '1d12', persistent: 1 }).
 *
 * `damageOverride` (#268) lets a chosen variant (Blazing Bolt's action count)
 * or rider-choice option (Polarize's Discharge) replace damageData fields —
 * field-level preference, no merging. Base and persistent dice run through
 * scaleDamageText so content can author level-scaled phrases
 * ('2d6 (+1d6 per level)', '1d4 per two levels you have') instead of dice
 * that rot on level-up; plain expressions pass through untouched.
 *
 * @param {Object}      ability        - strike or spell object
 * @param {Object}      character      - the acting character
 * @param {number|null} chosenActions  - effective action count (gates when.actions riders)
 * @param {number}      [castRank]     - the rank this cast happens at (spells)
 * @param {Object|null} exploit        - the actor's active exploit (useExploitVulnerability)
 * @param {Array}       enemyEntries   - enemy targets shown on the resolver
 * @param {Array}       order          - full encounter order (creatureKey lookups)
 * @param {Object|null} damageOverride - { base?, type?, heightened?, riders? }
 */
export const buildDamageProfile = (ability, character, {
  chosenActions = null,
  castRank = undefined,
  exploit = null,
  enemyEntries = [],
  order = [],
  damageOverride = null,
} = {}) => {
  if (!ability) return null;
  const dd = ability.damageData;
  const level = character?.level;
  let expression = scaleDamageText(
    damageOverride?.base ?? dd?.base ?? ability.damage ?? null,
    level
  );
  // Damage type: an override/damageData type wins; strikes carry a flat
  // `damageType` instead of a damageData block (#1018), so it backstops here —
  // feeding the panel hint and the typed Foundry relay (#1016).
  const typeLabel = damageOverride?.type ?? dd?.type ?? ability.damageType ?? null;
  const heightenedMap = damageOverride?.heightened ?? dd?.heightened;

  // Heightened damage scaling — cumulative entries at this cast rank.
  const heightenSteps = heightenedMap
    ? heightenedEntriesFor(
        { heightened: heightenedMap, level: ability.level },
        castRank
      )
    : [];
  const persistentBumps = [];
  for (const step of heightenSteps) {
    const inc = step.text; // entry value: { base?, persistent? }
    if (inc?.base && expression) {
      expression = addExpressions(expression, inc.base, step.times);
    }
    if (inc?.persistent != null) {
      persistentBumps.push({ add: inc.persistent, times: step.times });
    }
  }

  const ctx = { expression, character };

  // Strikes are the abilities built by strikeUtils — they carry a numeric attackMod.
  const isStrike = typeof ability.attackMod === 'number';

  const abilityRiders = (damageOverride?.riders ?? dd?.riders ?? ability.riders ?? [])
    .filter((r) => r.when?.actions == null || r.when.actions === chosenActions)
    .map((r) => {
      let next = r;
      if (r.persistent?.dice) {
        let dice = scaleDamageText(r.persistent.dice, level);
        for (const bump of persistentBumps) {
          dice = addExpressions(dice, bump.add, bump.times);
        }
        if (dice !== r.persistent.dice) {
          next = { ...next, persistent: { ...next.persistent, dice } };
        }
      }
      // Immediate extra-dice rider (Gloaming Backstab's hidden precision):
      // level-scaled dice the player rolls into the same hit when toggled on.
      if (r.dice) {
        const dice = scaleDamageText(r.dice, level);
        if (dice !== r.dice) next = { ...next, dice };
      }
      return next;
    });

  const characterRiders = (character?.damageRiders ?? [])
    .filter((r) => r.appliesTo !== 'strikes' || isStrike);

  const riders = [...abilityRiders, ...characterRiders].map((r) => ({ ...r, ctx }));

  const exploitR = exploitRider(exploit, enemyEntries, order);
  if (exploitR) riders.push(exploitR);

  // Resolve trait-conditional riders (#548 — Vitalizing's "vs undead") against
  // the actual targets' creature traits, into the per-target allow-list the
  // damage step already understands.
  const gatedRiders = riders.map((r) =>
    r.appliesVsTrait
      ? { ...r, appliesToEntryIds: traitGatedEntryIds(r.appliesVsTrait, enemyEntries) }
      : r
  );

  if (!expression && !gatedRiders.length) return null;
  return { expression, typeLabel, riders: gatedRiders };
};

/**
 * The type label a hint should append to a damage expression — null when the
 * hand-curated expression text already names it (#1018). Bomb strikes author
 * strings like '1d6 cold' or '1d4 persistent fire'; with a `damageType` now on
 * the strike too, blindly appending would render '1d6 cold cold'. Display-only:
 * the profile keeps its typeLabel for the relay/save-request payloads.
 */
export const hintTypeLabel = (expression, typeLabel) => {
  if (!typeLabel) return null;
  if (typeof expression === 'string'
      && new RegExp(`\\b${typeLabel}\\b`, 'i').test(expression)) return null;
  return typeLabel;
};

/**
 * The dice the player should physically roll: the base expression plus every
 * enabled immediate extra-dice rider (Gloaming Backstab's hidden precision).
 * These riders fold into the hint — the player rolls one combined total — and
 * carry no numeric bonus in computeTargetDamage (the dice are already in the
 * entered total). Returns `[{ dice, typeLabel }]` parts so the panel can show
 * each with its own type ('6d6 void + 6d4 precision') rather than mashing
 * mismatched types into one string.
 */
export const damageHintParts = (profile, riderState) => {
  if (!profile) return [];
  const parts = profile.expression
    ? [{ dice: profile.expression, typeLabel: hintTypeLabel(profile.expression, profile.typeLabel) }]
    : [];
  for (const r of profile.riders || []) {
    if (r.dice && riderEnabled(r, riderState)) {
      parts.push({ dice: r.dice, typeLabel: hintTypeLabel(r.dice, r.type) });
    }
  }
  return parts;
};

/**
 * Per-instance ENTRY parts (#1019) — one rolled total per damage type when the
 * profile mixes types (a piercing sword with a flaming rune's 1d6 fire). Part 0
 * is the base expression; each enabled immediate extra-dice rider whose type
 * differs from the base becomes its own part, keyed by rider id so the panel
 * can hold one input per part. Precision riders stay folded into the base
 * total — PF2e precision damage inherits the parent attack's type for IWR —
 * as do untyped and same-type rider dice. A single-part result means the
 * panel keeps the one-total entry unchanged.
 *
 * @returns {Array<{ key, dice, type, label? }>}
 */
export const damageEntryParts = (profile, riderState) => {
  if (!profile) return [];
  const baseType = (profile.typeLabel || '').toLowerCase();
  const parts = profile.expression
    ? [{ key: 'base', dice: profile.expression, type: profile.typeLabel || '' }]
    : [];
  for (const r of profile.riders || []) {
    if (!r.dice || !riderEnabled(r, riderState)) continue;
    const type = (r.type || '').toLowerCase();
    if (type && type !== 'precision' && type !== baseType) {
      parts.push({ key: r.id, dice: r.dice, type: r.type, label: r.label });
    }
  }
  return parts;
};
