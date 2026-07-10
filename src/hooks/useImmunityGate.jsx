import { useState } from 'react';
import { immunityConfigFor } from '../utils/immunity';
import { freqKeyFor } from '../utils/frequency';
import { applyAbilityImmunity } from '../utils/applyAbility';
import { expiryLabelSecs } from '../utils/expiry';
import { APP } from '../sync/keys';

/**
 * Target-immunity gate (#218, extracted #1317 D1) — for abilities that confer
 * immunity (Guidance, Battle Medicine, …), flag picked PC targets already
 * immune. The use is blocked only when EVERY picked target is immune
 * (override available).
 *
 * Uniform gate-hook shape: { gateOk, blocked, override, setOverride, section,
 * applyOnConfirm } plus `immunityConfig` / `immunityAbilityKey` re-exported
 * for the opposed-reaction path (per-enemy immunity stamping stays in the
 * orchestrator).
 */
export const useImmunityGate = ({
  ability,
  character,
  characters,
  targetCharIds,
  nowSecs,
  getState,
  sendUpdate,
}) => {
  // Override when all picked targets are immune.
  const [override, setOverride] = useState(false);

  const immunityConfig = immunityConfigFor(ability);
  // `immunityKey` lets variants share one immunity pool (#228 — Murmured
  // Prayer's 1/day +2 Guidance is still "Guidance" for the 1-hour immunity).
  const immunityAbilityKey = ability ? (ability.immunityKey || freqKeyFor(ability)) : null;
  const immuneTargets = (immunityConfig && character)
    ? targetCharIds
        .map((cid) => {
          const tEffects = getState(cid, APP.EFFECTS) || [];
          const immune = tEffects.find(
            (e) => e.effectId === 'ability-immunity'
              && e.abilityKey === immunityAbilityKey
              && (immunityConfig.scope !== 'per-caster' || e.appliedBy === character.id)
              && !(typeof e.expireAtSecs === 'number' && e.expireAtSecs <= nowSecs)
          );
          return immune
            ? {
                charId: cid,
                name: characters.find((c) => c.id === cid)?.name || cid,
                expireAtSecs: immune.expireAtSecs,
              }
            : null;
        })
        .filter(Boolean)
    : [];
  const allTargetsImmune =
    !!immunityConfig && targetCharIds.length > 0 && immuneTargets.length === targetCharIds.length;
  const blocked = allTargetsImmune;
  const gateOk = !allTargetsImmune || override;

  // Stamp clock-expiring immunity on picked PC targets (Guidance, Tell
  // Fortune, …). Independent of effects[]; idempotent on already-immune.
  const applyOnConfirm = () => {
    if (immunityConfig) {
      applyAbilityImmunity({
        ability,
        caster: character,
        targetCharIds,
        nowSecs,
        getState,
        sendUpdate,
      });
    }
  };

  // Target immunity — picked PC targets already immune to this ability.
  const section = immuneTargets.length > 0 ? (
    <>
      <hr className="ct-divider" />
      <section className="ct-section">
        <h3 className="ct-section-title">Immunity</h3>
        {immuneTargets.map((t) => (
          <div key={t.charId} className="uam-cost-empty">
            {t.name} is immune
            {typeof t.expireAtSecs === 'number'
              ? ` — expires at ${expiryLabelSecs(t.expireAtSecs, nowSecs)}`
              : ''}
          </div>
        ))}
        {allTargetsImmune && (
          <label className="uam-cost-override">
            <input
              type="checkbox"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
            />
            Override (GM ruling) — use anyway
          </label>
        )}
      </section>
    </>
  ) : null;

  return {
    gateOk,
    blocked,
    override,
    setOverride,
    section,
    applyOnConfirm,
    immunityConfig,
    immunityAbilityKey,
    immuneTargets,
  };
};

export default useImmunityGate;
