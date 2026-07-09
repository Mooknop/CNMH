import { resolveExpireAt } from './expiry';
import { newEntryUid } from './uid';
import { freqKeyFor } from './frequency';
import { immunityConfigFor, makeImmunityEntry, hasAbilityImmunity } from './immunity';
import { RELAY, APP, syncKey } from '../sync/keys';

const writeLocal = (key, value) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
};

// Resolves which charIds and entryIds an effect/grant targets, given the applyTo rule.
//  'self'       -> caster only
//  'all-allies' -> every PC in the encounter order
//  'target'/'ally' -> the passed-in picked PC targets
export const resolveApplyTargets = (applyTo, caster, targetCharIds, order) => {
  if (applyTo === 'self') {
    const selfEntry = (order || []).find((e) => e.kind === 'pc' && e.charId === caster.id);
    return [{ charId: caster.id, entryId: selfEntry?.entryId || null }];
  }
  if (applyTo === 'all-allies') {
    return (order || [])
      .filter((e) => e.kind === 'pc' && e.charId)
      .map((e) => ({ charId: e.charId, entryId: e.entryId }));
  }
  // 'target' | 'ally' — use the user-picked PC target set
  return targetCharIds.map((charId) => {
    const entry = (order || []).find((e) => e.kind === 'pc' && e.charId === charId);
    return { charId, entryId: entry?.entryId || null };
  });
};

// Build the stored effect entry for one structured effect on one target.
// Durations resolve in precedence order: clock minutes (absolute expireAtSecs,
// pruned by the #218 expiry sweep) → encounter boundaries via resolveExpireAt →
// the daily-prep flag.
export const buildEffectEntry = ({ eff, caster, abilityName, encounter, casterEntryId, targetEntryId, nowSecs }) => {
  const minutes = Number(eff.duration?.minutes);
  const expireAtSecs =
    Number.isFinite(minutes) && minutes > 0 && typeof nowSecs === 'number'
      ? nowSecs + minutes * 60
      : undefined;
  const expireAt = expireAtSecs == null
    ? resolveExpireAt(eff.duration || null, encounter, casterEntryId, targetEntryId)
    : null;
  return {
    id:        newEntryUid(),
    effectId:  eff.effectId,
    appliedBy: caster.id,
    source:    abilityName,
    expireAt:  expireAt || undefined,
    ...(expireAtSecs != null ? { expireAtSecs } : {}),
    // Effects that last "until daily preparations" (Mystic Armor, Light)
    // carry a flag the daily-prep flow clears — they have no encounter
    // boundary, so resolveExpireAt returns null for them.
    ...(eff.duration?.until === 'daily-prep' ? { expireOnDailyPrep: true } : {}),
    ts:        Date.now(),
  };
};

/**
 * Applies an ability's structured effects[] and grants[] to resolved targets.
 * React-free — accepts hooks' return values as plain function arguments.
 *
 * @param {Object}   ability          - The action/spell object with effects[] / grants[]
 * @param {Object}   caster           - The casting character { id, name }
 * @param {string}   casterEntryId    - Encounter entryId of the caster
 * @param {string[]} targetCharIds    - CharIds of picked PC targets (from entryId resolution)
 * @param {string[]} enemyTargetNames - Names of picked enemy targets (logged only, no state write)
 * @param {Array}    order            - encounter.order entries
 * @param {Object}   encounter        - Full encounter object (passed to resolveExpireAt)
 * @param {Object[]} characters       - All PC characters (for target name lookup)
 * @param {Function} getState         - (charId, key) => value
 * @param {Function} sendUpdate       - (charId, key, value) => void
 * @param {Function} appendLog        - ({ type, charId, text }) => void
 * @param {string}   verb             - 'cast' | 'used' (lower-case for log lines)
 * @param {number}   [rank]           - Cast rank when heightened above native (#235); decorates log lines
 * @param {number}   [nowSecs]        - Current absolute game seconds; enables minute durations
 * @param {Object}   [effectDurationOverride] - Replaces each effect's authored duration
 *                                      (e.g. Lingering Composition extends a 1-round
 *                                      composition to { until:'rounds', rounds } — #226-B)
 * @param {boolean}  [suppressStructuredEffects] - Skip the structured effects[] writes,
 *                                      leaving the buff to Foundry's aura engine + the
 *                                      cnmh_foundryeffects read-back (#455). Set when the
 *                                      ability is Foundry-authoritative AND the bridge is
 *                                      connected; grants/immunity/foundryEffect still run.
 */
export function applyAbility({
  ability,
  caster,
  casterEntryId,
  targetCharIds,
  enemyTargetNames,
  order,
  encounter,
  characters,
  getState,
  sendUpdate,
  appendLog,
  verb = 'used',
  rank,
  nowSecs,
  effectDurationOverride,
  suppressStructuredEffects = false,
}) {
  const effects = Array.isArray(ability.effects) ? ability.effects : [];
  const grants  = Array.isArray(ability.grants)  ? ability.grants  : [];
  const name    = ability.name || '';
  const loggedName = rank ? `${name} (rank ${rank})` : name;

  const charName = (charId) => characters.find((c) => c.id === charId)?.name || charId;

  // ── Structured effects ──────────────────────────────────────────────────────
  // When Foundry owns this ability's buff (aura engine, #455) and the bridge is
  // connected, skip the app-side effect writes — the buff arrives via the
  // foundryEffect link below + the cnmh_foundryeffects read-back. The forEach is
  // simply gated rather than removed so the enemy-target logging still runs.
  (suppressStructuredEffects ? [] : effects).forEach((eff) => {
    // Per-cast duration override (Lingering Composition, #226-B): swap the
    // authored duration only when both an override and an authored duration exist.
    const effForApply = (effectDurationOverride && eff.duration)
      ? { ...eff, duration: effectDurationOverride }
      : eff;
    const resolved = resolveApplyTargets(eff.applyTo, caster, targetCharIds, order);
    resolved.forEach(({ charId: targetCharId, entryId: targetEntryId }) => {
      const current  = getState(targetCharId, APP.EFFECTS) || [];
      const newEntry = buildEffectEntry({
        eff: effForApply, caster, abilityName: name, encounter, casterEntryId, targetEntryId, nowSecs,
      });
      const next = [...current, newEntry];
      writeLocal(syncKey(APP.EFFECTS, targetCharId), next);
      sendUpdate(targetCharId, APP.EFFECTS, next);
      appendLog({
        type:   'action',
        charId: caster.id,
        text:   `${caster.name} ${verb} ${loggedName} on ${charName(targetCharId)}`,
      });
    });

    // Log enemy targets — no state store, name-only
    if ((eff.applyTo === 'target' || eff.applyTo === 'ally') && enemyTargetNames.length) {
      appendLog({
        type:   'action',
        charId: caster.id,
        text:   `${caster.name} ${verb} ${loggedName} on ${enemyTargetNames.join(', ')}`,
      });
    }
  });

  // ── Foundry effect link ─────────────────────────────────────────────────────
  // Independent of effects[]/grants[]: if the ability has a foundryEffect config,
  // tell the bridge to clone the compendium effect item onto the target tokens.
  const fe = ability.foundryEffect;
  if (fe?.ref) {
    const feResolved = resolveApplyTargets(fe.applyTo || 'self', caster, targetCharIds, order);
    const feTargets  = feResolved.map((r) => r.entryId).filter(Boolean);
    sendUpdate(caster.id, RELAY.APPLYEFFECT, {
      ref:     fe.ref,
      op:      'apply',
      targets: feTargets,
      source:  name,
      ts:      Date.now(),
    });
  }

  // ── Structured grants ───────────────────────────────────────────────────────
  grants.forEach((grant) => {
    const resolved = resolveApplyTargets(grant.applyTo || 'ally', caster, targetCharIds, order);
    resolved.forEach(({ charId: targetCharId, entryId: targetEntryId }) => {
      const expireAt = resolveExpireAt(grant.duration || null, encounter, casterEntryId, targetEntryId);
      const current  = getState(targetCharId, APP.GRANTEDACTIONS) || [];
      const newGrant = {
        id:        newEntryUid(),
        action:    grant.action,
        source:    name,
        grantedBy: caster.id,
        expireAt:  expireAt || undefined,
        ts:        Date.now(),
      };
      const next = [...current, newGrant];
      writeLocal(syncKey(APP.GRANTEDACTIONS, targetCharId), next);
      sendUpdate(targetCharId, APP.GRANTEDACTIONS, next);
      appendLog({
        type:   'action',
        charId: caster.id,
        text:   `${caster.name} granted ${grant.action?.name || name} to ${charName(targetCharId)}`,
      });
    });
  });
}

/**
 * Stamp a clock-expiring immunity on the picked PC targets for abilities with
 * an `immunity` config (Guidance, Tell Fortune, …). Idempotent: targets already
 * immune are skipped. React-free; the modal calls this alongside applyAbility.
 * Enemy targets have no PC effect store, so only PC targets are tracked.
 *
 * @param {Object}   ability       - ability with optional `immunity` config
 * @param {Object}   caster        - { id }
 * @param {string[]} targetCharIds - picked PC target charIds
 * @param {number}   nowSecs       - current absolute game seconds
 * @param {Function} getState      - (charId, key) => value
 * @param {Function} sendUpdate    - (charId, key, value) => void
 */
export function applyAbilityImmunity({ ability, caster, targetCharIds, nowSecs, getState, sendUpdate }) {
  const config = immunityConfigFor(ability);
  if (!config) return;
  // `immunityKey` lets variants share one immunity pool (#228 — Murmured
  // Prayer's 1/day +2 Guidance stamps and checks the same key as Guidance).
  const abilityKey  = ability.immunityKey || freqKeyFor(ability);
  const abilityName = ability.name || '';
  (targetCharIds || []).forEach((targetCharId) => {
    const current = getState(targetCharId, APP.EFFECTS) || [];
    if (hasAbilityImmunity(current, { abilityKey, casterId: caster.id, scope: config.scope, nowSecs })) return;
    const entry = makeImmunityEntry({
      abilityKey, abilityName, casterId: caster.id, nowSecs, durationSecs: config.durationSecs,
    });
    const next = [...current, entry];
    writeLocal(syncKey(APP.EFFECTS, targetCharId), next);
    sendUpdate(targetCharId, APP.EFFECTS, next);
  });
}

/**
 * Apply one chosen rider option from an ability's `riderChoice` config (#225 —
 * e.g. the electric Eld powers' "become Charged" vs "Discharge"). Rider
 * effects are caster-scoped: `appliesEffect` lands on the caster, and
 * `removesEffectId` strips matching entries from the caster's effects.
 * React-free; the modal calls this alongside applyAbility on confirm.
 *
 * option shape: { id, label, note?, appliesEffect?: { effectId, duration? },
 *                 removesEffectId?, requiresEffectId? }
 */
export function applyRiderChoice({
  option,
  ability,
  caster,
  casterEntryId,
  encounter,
  nowSecs,
  getState,
  sendUpdate,
  appendLog,
}) {
  if (!option) return;
  let current = getState(caster.id, APP.EFFECTS) || [];
  let changed = false;

  if (option.removesEffectId) {
    const next = current.filter((e) => e.effectId !== option.removesEffectId);
    if (next.length !== current.length) {
      current = next;
      changed = true;
    }
  }

  if (option.appliesEffect?.effectId) {
    current = [
      ...current,
      buildEffectEntry({
        eff: option.appliesEffect,
        caster,
        abilityName: ability.name || '',
        encounter,
        casterEntryId,
        targetEntryId: casterEntryId,
        nowSecs,
      }),
    ];
    changed = true;
  }

  if (changed) {
    writeLocal(syncKey(APP.EFFECTS, caster.id), current);
    sendUpdate(caster.id, APP.EFFECTS, current);
  }

  appendLog({
    type:   'action',
    charId: caster.id,
    text:   `${caster.name} chose ${option.label} (${ability.name})${option.note ? ` — ${option.note}` : ''}`,
  });
}

// Returns true when an ability has at least one effect or grant whose target
// must be picked by the user (as opposed to being auto-resolved as 'self' or
// 'all-allies').
export function abilityNeedsPicker(ability) {
  const all = [
    ...(Array.isArray(ability?.effects) ? ability.effects : []),
    ...(Array.isArray(ability?.grants)  ? ability.grants  : []),
  ];
  return all.some((x) => x.applyTo === 'target' || x.applyTo === 'ally');
}

// Returns true when an ability has any structured effects or grants at all.
export function abilityHasStructuredEffects(ability) {
  return (
    (Array.isArray(ability?.effects) && ability.effects.length > 0) ||
    (Array.isArray(ability?.grants)  && ability.grants.length  > 0)
  );
}
