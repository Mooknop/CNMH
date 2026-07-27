import { computeSaveDamage } from './damage';
import { addPersistent, makeInstances } from './persistentDamage';
import { buildDamageApply } from './damageRelay';
import { RELAY } from '../sync/keys';

/**
 * The HP-affecting half of a resolved save request, extracted from
 * `RequestedSaves.finishResolve` (#1689 — the caster save round trip).
 *
 * It used to live only GM-side because the caster's damage total rode the save
 * request. Under the inverted flow the caster rolls damage AFTER seeing the
 * degrees, so the same three appliers have to run on the CASTER's client
 * instead — and running them in both places would double-apply (G1 risk 1).
 * One module, two call sites, one behaviour:
 *
 *   - old-style request (`damage.entered` is a number) → RequestedSaves
 *   - new-style request (`damage.entered == null`)     → the caster's sheet
 *
 * Nothing here is new math: `computeSaveDamage` still owns the degree ladder,
 * `addPersistent` / `makeInstances` still own the persistent rail (#272), and
 * `buildDamageApply` still owns the typed relay (#1016).
 */

/**
 * Per-target damage off a save-request/resolution `damage` payload.
 *
 * @param {Object|null} damage   - `{ entered, expression, typeLabel, riders, degrees? }`
 * @param {string|null} degree   - the target's resolved save degree
 * @param {string}      entryId  - the target's encounter entryId (weakness riders scope by it)
 * @param {Object|null} defenses - the target's LIVE defenses for IWR netting (#1014).
 *                                 Deliberately not snapshotted: a target that left
 *                                 the order degrades to raw damage (G1 risk 3).
 * @returns {null | { none: true } | { dmg: Object }}
 */
export const saveDamageFor = (damage, degree, entryId, defenses = null) => {
  if (!damage || !degree) return null;
  if (degree === 'criticalSuccess') return { none: true };
  const dmg = computeSaveDamage({
    entered: damage.entered,
    degree,
    riders: damage.riders,
    entryId,
    // Monster IWR (#1014): the target's own defenses net into the displayed
    // final (the relay below stays raw via rawFinal).
    typeLabel: damage.typeLabel,
    defenses,
    // Per-degree multiplier overrides (#987 — Boulder Crush's full-on-crit-fail).
    degrees: damage.degrees ?? null,
  });
  return dmg ? { dmg } : null;
};

/**
 * Apply a resolved save's damage: persistent tracking (#272), the typed
 * `dmgapply` relay (#1016) and the IWR reveal-on-trigger (#1014). Logging is
 * NOT here — the GM leg folds damage into its degree line, the caster leg
 * writes its own lines — so the caller gets the per-target results back.
 *
 * @param {Object}   damage        - the payload, with `entered` ALREADY overwritten by
 *                                   the roller. Never trust a record's stored `entered`:
 *                                   on a resolution record it is stale GM-time data (G1 risk 2).
 * @param {Array}    results       - `[{ entryId, name, degree, … }]`
 * @param {Array}    order         - the LIVE encounter order (defenses + enemy filter)
 * @param {string}   abilityName
 * @param {Function} [setPersistentMap]
 * @param {Function} [sendUpdate]
 * @param {Function} [revealFiredIwr]
 * @returns {Array<{ result, damage }>} one entry per result, `damage` as saveDamageFor returns it
 */
export const applySaveDamageOutcome = ({
  damage,
  results = [],
  order = [],
  abilityName,
  setPersistentMap,
  sendUpdate,
  revealFiredIwr,
}) => {
  const defensesFor = (entryId) =>
    (order || []).find((e) => e.entryId === entryId)?.defenses ?? null;

  const perTarget = (results || []).map((result) => ({
    result,
    damage: saveDamageFor(damage, result.degree, result.entryId, defensesFor(result.entryId)),
  }));

  // Persistent-damage tracking (#272): computeSaveDamage already gated the
  // entries by degree (and doubled/halved their dice) — record what's left.
  const persistentHits = perTarget
    .filter((p) => p.damage?.dmg?.persistent?.length)
    .map((p) => ({ entryId: p.result.entryId, persistent: p.damage.dmg.persistent }));
  if (persistentHits.length && setPersistentMap) {
    setPersistentMap((m) => persistentHits.reduce(
      (acc, h) => addPersistent(acc, h.entryId, makeInstances(h.persistent, abilityName)),
      m || {},
    ));
  }

  // Typed damage relay (#1016): push each enemy target's RAW typed total to
  // the bridge — Foundry's applyDamage nets the monster's IWR (the logged
  // number stays raw/informational). Enemies only, same as UseAbilityModal.
  const enemyEntryIds = new Set(
    (order || []).filter((e) => e.kind === 'enemy').map((e) => e.entryId),
  );
  const relayHits = perTarget
    .map((p) => {
      // Raw pre-IWR amount (#1014): Foundry's applyDamage nets IWR itself —
      // an app-netted 0 (immune) still relays raw and Foundry decides.
      const raw = p.damage?.dmg?.rawFinal ?? p.damage?.dmg?.final;
      return raw > 0 && enemyEntryIds.has(p.result.entryId)
        ? {
          entryId: p.result.entryId,
          name: p.result.name,
          amount: raw,
          type: damage?.typeLabel || '',
        }
        : null;
    })
    .filter(Boolean);
  if (relayHits.length && sendUpdate) {
    sendUpdate('global', RELAY.DMGAPPLY, buildDamageApply({ hits: relayHits, sourceName: abilityName }));
  }

  // Reveal-on-trigger (#1014): monster IWR that just modified a target's save
  // damage becomes table knowledge.
  revealFiredIwr?.(perTarget.map((p) => ({
    entryId: p.result.entryId,
    damage: p.damage?.dmg || null,
  })));

  return perTarget;
};

export default applySaveDamageOutcome;
