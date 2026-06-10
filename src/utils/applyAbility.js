import { resolveExpireAt } from './expiry';
import { newEntryUid } from './uid';
import { freqKeyFor } from './frequency';
import { immunityConfigFor, makeImmunityEntry, hasAbilityImmunity } from './immunity';

const writeLocal = (key, value) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
};

// Resolves which charIds and entryIds an effect/grant targets, given the applyTo rule.
//  'self'       -> caster only
//  'all-allies' -> every PC in the encounter order
//  'target'/'ally' -> the passed-in picked PC targets
const resolveApplyTargets = (applyTo, caster, targetCharIds, order) => {
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
}) {
  const effects = Array.isArray(ability.effects) ? ability.effects : [];
  const grants  = Array.isArray(ability.grants)  ? ability.grants  : [];
  const name    = ability.name || '';

  const charName = (charId) => characters.find((c) => c.id === charId)?.name || charId;

  // ── Structured effects ──────────────────────────────────────────────────────
  effects.forEach((eff) => {
    const resolved = resolveApplyTargets(eff.applyTo, caster, targetCharIds, order);
    resolved.forEach(({ charId: targetCharId, entryId: targetEntryId }) => {
      const expireAt = resolveExpireAt(eff.duration || null, encounter, casterEntryId, targetEntryId);
      const current  = getState(targetCharId, 'effects') || [];
      const newEntry = {
        id:        newEntryUid(),
        effectId:  eff.effectId,
        appliedBy: caster.id,
        source:    name,
        expireAt:  expireAt || undefined,
        ts:        Date.now(),
      };
      const next = [...current, newEntry];
      writeLocal(`cnmh_effects_${targetCharId}`, next);
      sendUpdate(targetCharId, 'effects', next);
      appendLog({
        type:   'action',
        charId: caster.id,
        text:   `${caster.name} ${verb} ${name} on ${charName(targetCharId)}`,
      });
    });

    // Log enemy targets — no state store, name-only
    if ((eff.applyTo === 'target' || eff.applyTo === 'ally') && enemyTargetNames.length) {
      appendLog({
        type:   'action',
        charId: caster.id,
        text:   `${caster.name} ${verb} ${name} on ${enemyTargetNames.join(', ')}`,
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
    sendUpdate(caster.id, 'applyeffect', {
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
      const current  = getState(targetCharId, 'grantedactions') || [];
      const newGrant = {
        id:        newEntryUid(),
        action:    grant.action,
        source:    name,
        grantedBy: caster.id,
        expireAt:  expireAt || undefined,
        ts:        Date.now(),
      };
      const next = [...current, newGrant];
      writeLocal(`cnmh_grantedactions_${targetCharId}`, next);
      sendUpdate(targetCharId, 'grantedactions', next);
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
  const abilityKey  = freqKeyFor(ability);
  const abilityName = ability.name || '';
  (targetCharIds || []).forEach((targetCharId) => {
    const current = getState(targetCharId, 'effects') || [];
    if (hasAbilityImmunity(current, { abilityKey, casterId: caster.id, scope: config.scope, nowSecs })) return;
    const entry = makeImmunityEntry({
      abilityKey, abilityName, casterId: caster.id, nowSecs, durationSecs: config.durationSecs,
    });
    const next = [...current, entry];
    writeLocal(`cnmh_effects_${targetCharId}`, next);
    sendUpdate(targetCharId, 'effects', next);
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
