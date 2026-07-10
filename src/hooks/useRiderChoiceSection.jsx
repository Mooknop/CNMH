import { useState } from 'react';
import { applyRiderChoice } from '../utils/applyAbility';

/**
 * Rider choice (#225, extracted #1317 D2) — an either/or rider picked at use
 * time (e.g. the electric Eld powers' "become Charged" vs "Discharge").
 * Options that require an active effect (requiresEffectId) are disabled until
 * the caster has it.
 *
 * Section-hook shape (adapted from the D1 gate pattern): { selectedRider,
 * section, applyOnConfirm }. `selectedRider` is re-exported for the
 * orchestrator's damage profile (a rider option may override the dice, #268).
 * `applyOnConfirm(ctx)` applies/removes the chosen rider's caster-scoped
 * effect at the same handleConfirm sequence position as before.
 */
export const useRiderChoiceSection = (ability, activeEffects) => {
  // Rider choice (#225) — which either/or rider option is picked. null =
  // default to the first available option.
  const [riderChoiceId, setRiderChoiceId] = useState(null);

  const riderChoice =
    ability?.riderChoice && Array.isArray(ability.riderChoice.options)
    && ability.riderChoice.options.length > 0
      ? ability.riderChoice
      : null;
  const riderAvailable = (opt) =>
    !opt.requiresEffectId
    || (activeEffects || []).some((e) => e.effectId === opt.requiresEffectId);
  const selectedRider = riderChoice
    ? (riderChoice.options.find((o) => o.id === riderChoiceId && riderAvailable(o))
        || riderChoice.options.find(riderAvailable)
        || null)
    : null;

  // Rider choice (#225) — apply/remove the chosen rider's caster-scoped
  // effect (e.g. gain eld-charged, or Discharge to consume it).
  const applyOnConfirm = ({
    caster,
    casterEntryId,
    encounter,
    nowSecs,
    getState,
    sendUpdate,
    appendLog,
  }) => {
    if (selectedRider) {
      applyRiderChoice({
        option: selectedRider,
        ability,
        caster,
        casterEntryId,
        encounter,
        nowSecs,
        getState,
        sendUpdate,
        appendLog,
      });
    }
  };

  // Rider choice (#225) — either/or rider picked at use time
  const section = riderChoice ? (
    <>
      <hr className="ct-divider" />
      <section className="ct-section">
        <h3 className="ct-section-title">{riderChoice.prompt || 'Rider'}</h3>
        <div className="uam-cost-options" role="radiogroup" aria-label="Rider choice">
          {riderChoice.options.map((opt) => {
            const available = riderAvailable(opt);
            return (
              <label
                key={opt.id}
                className={`uam-cost-option${!available ? ' uam-cost-option--disabled' : ''}`}
              >
                <input
                  type="radio"
                  name="rider-choice"
                  disabled={!available}
                  checked={selectedRider?.id === opt.id}
                  onChange={() => setRiderChoiceId(opt.id)}
                />
                {opt.label}
              </label>
            );
          })}
        </div>
        {selectedRider?.note && <div className="uam-variant-note">{selectedRider.note}</div>}
      </section>
    </>
  ) : null;

  return { selectedRider, section, applyOnConfirm };
};

export default useRiderChoiceSection;
