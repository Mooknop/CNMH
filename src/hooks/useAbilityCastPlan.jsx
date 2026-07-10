import { useState, useCallback } from 'react';
import HeightenedNotes from '../components/encounter/HeightenedNotes';
import { useCastingResources } from './useCastingResources';
import { autoMapStep, mapPenaltyFor } from '../utils/map';
import { getVariableActionRange, variantFor } from '../utils/ActionsUtils';

// Parse "Two Actions", "One Action", "Free Action", "Reaction", "1", "2", "3"
const parseActionCost = (actionsText) => {
  if (!actionsText) return 1;
  const t = String(actionsText).toLowerCase();
  if (t.includes('free')) return 0;
  if (t.includes('reaction')) return 'reaction';
  if (t.includes('three') || t === '3') return 3;
  if (t.includes('two') || t === '2') return 2;
  if (t.includes('one') || t === '1') return 1;
  const n = parseInt(t);
  return Number.isNaN(n) ? 1 : n;
};

const costToDisplay = (ability, explicitCost) => {
  if (ability?.actions) return ability.actions;
  if (explicitCost === 'reaction') return 'Reaction';
  if (explicitCost === 'free' || explicitCost === 0) return 'Free';
  if (typeof explicitCost === 'number') return String(explicitCost);
  return '?';
};

/**
 * Casting-arithmetic plan (#1317 D4) — bundles UseAbilityModal's cost cluster:
 * the MAP step (auto from attacks made + manual override), the variable
 * action-count choice (#215) and its variant, the multi-ray count, the casting
 * resource wiring (useCastingResources source/rank options, empty-pool
 * override, #235) and the derived cost displays. Owns three self-contained
 * render pieces: `actionsSelector`, `castSection` (source/rank picker +
 * HeightenedNotes) and `mapRow` (the orchestrator gates it on showMapToggle
 * and renders the hoisted value in every branch).
 *
 * `applyOnConfirm({ addSuffix })` is the confirm-time resource spend — it runs
 * FIRST among the log-suffix contributors, before the D1 gate slices, so the
 * joined suffix composes exactly as the old inline block did.
 *
 * Called before the modal's `if (!ability || !character) return null` guard,
 * so every derivation tolerates a null ability.
 */
export const useAbilityCastPlan = ({
  ability,
  character,
  explicitCost,
  effectiveVerb,
  castSource,
  turnState,
  isChamberedFire,
  fireExtra,
}) => {
  // Multiple Attack Penalty — auto step from attacks already made this turn,
  // with a manual override for table corrections. null = follow the auto step.
  const [mapOverride, setMapOverride] = useState(null);

  // Variable action-cost abilities (#215): chosen action count. null = default
  // to the explicit cost picked upstream (UseActionChip) or the range minimum.
  // For per-action multi-ray spells (Blazing Bolt) this doubles as the ray count.
  const [actionCountOverride, setActionCountOverride] = useState(null);

  // Casting resources — which pool pays for the cast, and the empty-pool
  // override for table rulings. null index = default to first enabled option.
  const resources = useCastingResources(character);
  const [castOptionIdx, setCastOptionIdx] = useState(null);
  const [castOverride, setCastOverride] = useState(false);

  // Tracks the spell-chain total cost so the confirm button label stays accurate.
  const [spellChainTotalCost, setSpellChainTotalCost] = useState(null);
  const onSpellChainCostChange = useCallback((cost) => setSpellChainTotalCost(cost), []);

  // Multiple Attack Penalty step: attacks already made this turn, or the override.
  // A reaction Strike fires off-turn (AoO, Retributive Strike) so its MAP starts
  // at 0 rather than the stale attacksMade from the player's last turn (#475).
  const autoStep = autoMapStep({
    isReaction: explicitCost === 'reaction',
    attacksMade: turnState?.attacksMade ?? 0,
  });
  const mapStep = mapOverride ?? autoStep;

  const hasChainStrike = ability?.chain?.into === 'strike';
  const hasChainSpell  = ability?.chain?.into === 'spell';

  const effectiveCost = explicitCost !== undefined ? explicitCost : parseActionCost(ability?.actions);

  // Variable action-cost abilities (#215): the in-modal picker is authoritative
  // for the spend. Reactions/free actions and chained abilities (which own their
  // own total-cost arithmetic) opt out.
  const variableRange =
    (effectiveCost === 'reaction' || effectiveCost === 'free' || hasChainSpell || hasChainStrike)
      ? null
      : getVariableActionRange(ability);
  // An explicit numeric cost picked upstream (UseActionChip dropdown) seeds the
  // picker but stays changeable here.
  const seedCount = (variableRange
    && typeof explicitCost === 'number'
    && explicitCost >= variableRange.min
    && explicitCost <= variableRange.max)
    ? explicitCost
    : variableRange?.min;
  const chosenActions = variableRange
    ? Math.min(Math.max(actionCountOverride ?? seedCount, variableRange.min), variableRange.max)
    : null;
  // The declared consequence of the chosen count (scaling note, DC change).
  const variant = variableRange ? variantFor(ability, chosenActions) : null;

  // Multi-ray attack spells fire one attack roll per ray. `rolls: 'per-action'` makes
  // the ray count = chosen action count (variable, e.g. Blazing Bolt 1–3); `rollCount: N`
  // is a fixed multi-ray count. The count drives the number of resolver rows.
  const perActionRange = ability?.rolls === 'per-action' ? variableRange : null;
  const fixedRayCount  = (typeof ability?.rollCount === 'number' && ability.rollCount > 1) ? ability.rollCount : null;
  const isMultiRay     = perActionRange != null || fixedRayCount != null;
  const rayCount = perActionRange ? chosenActions : (fixedRayCount ?? 1);
  const castCost = variableRange ? chosenActions : effectiveCost;

  // Casting-cost options (slot rank / focus / staff charges / wand / scroll).
  // Only casts pay a resource; plain actions get an empty list and no section.
  const castOptions = effectiveVerb === 'cast' ? resources.optionsFor(ability, castSource) : [];
  const defaultCastIdx = Math.max(0, castOptions.findIndex((o) => o.enabled));
  const selectedCastIdx = castOptionIdx ?? defaultCastIdx;
  const selectedCastOption = castOptions[selectedCastIdx] || null;
  // Free options (cantrip/innate) need no picker UI — just a muted cost line.
  const castIsFree = castOptions.length === 1
    && (castOptions[0].type === 'cantrip' || castOptions[0].type === 'innate');
  // For spell chains the total cost = parent + chosen spell; use it in the button once known.
  const confirmCost   = (hasChainSpell && spellChainTotalCost != null) ? spellChainTotalCost : effectiveCost;
  // Variable-cost abilities show the chosen numeric count; spell-chain total is numeric
  // too (bypass costToDisplay, which would show ability.actions instead).
  const costDisplay   = variableRange != null
    ? String(chosenActions)
    : (hasChainSpell && typeof confirmCost === 'number')
      ? String(confirmCost)
      : costToDisplay(ability, confirmCost);
  // Chambered fire shows the combined Strike + Activate cost (#676).
  const costDisplayFinal = (isChamberedFire && typeof effectiveCost === 'number')
    ? String(effectiveCost + fireExtra)
    : costDisplay;

  // The rank this cast happens at (#235): the chosen slot option's rank, or
  // the spell's native rank for free/focus casts. Non-spell actions: none.
  const directCastRank = selectedCastOption?.rank
    ?? (effectiveVerb === 'cast' && typeof ability?.level === 'number' && ability.level > 0
      ? ability.level
      : undefined);

  // Block the cast while the chosen pool is empty, unless overridden.
  const castGateOk =
    castOptions.length === 0 || selectedCastOption?.enabled || castOverride;

  // Spend the casting resource (slot/focus/staff/wand/scroll). The empty-pool
  // override casts without decrementing — the manual pips stay the
  // remediation surface and pools never go negative.
  const applyOnConfirm = ({ addSuffix }) => {
    if (selectedCastOption) {
      if (selectedCastOption.enabled) {
        const { label } = resources.spend(selectedCastOption);
        if (label) addSuffix(` (${label})`);
      } else if (castOverride) {
        addSuffix(' (override — no resource spent)');
      }
    }
  };

  // MAP toggle row — the orchestrator shows it for Attack-trait abilities with
  // an inline resolver, and for strike chains (the child section applies the
  // step to both strikes).
  const mapRow = ability ? (
    <div className="uam-map-row" role="group" aria-label="Multiple Attack Penalty">
      <span className="uam-map-label">MAP</span>
      {[0, 1, 2].map((step) => (
        <button
          key={step}
          type="button"
          className={`uam-map-btn${mapStep === step ? ' uam-map-btn--active' : ''}`}
          aria-pressed={mapStep === step}
          onClick={() => setMapOverride(step === autoStep ? null : step)}
        >
          {step === 0 ? '0' : `${mapPenaltyFor(ability, step)}`}
          {step === autoStep ? ' (auto)' : ''}
        </button>
      ))}
    </div>
  ) : null;

  // Action-count picker for variable-cost abilities (#215): Force Barrage 1–3,
  // Elemental Blast 1–2, per-action multi-ray spells (Blazing Bolt). Each button
  // carries its variant note as a tooltip; the chosen variant's note renders below.
  const actionsSelector = (variableRange && variableRange.max > variableRange.min) ? (
    <>
      <div className="uam-actions-row" role="radiogroup" aria-label="Number of actions">
        <span className="uam-actions-label">Actions</span>
        {Array.from(
          { length: variableRange.max - variableRange.min + 1 },
          (_, k) => variableRange.min + k
        ).map((n) => (
          <button
            key={n}
            type="button"
            className={`uam-actions-btn${chosenActions === n ? ' uam-actions-btn--active' : ''}`}
            aria-pressed={chosenActions === n}
            title={variantFor(ability, n)?.note || undefined}
            onClick={() => setActionCountOverride(n)}
          >
            {n}
          </button>
        ))}
      </div>
      {variant?.note && <div className="uam-variant-note">{variant.note}</div>}
    </>
  ) : null;

  // Casting cost — source/rank picker, empty-pool block + override.
  const castSection = castOptions.length > 0 ? (
    <>
      <hr className="ct-divider" />
      <section className="ct-section">
        {!castIsFree && <h3 className="ct-section-title">Casting Cost</h3>}
        {castOptions.length === 1 ? (
          <div className="uam-cost-single">{castOptions[0].label}</div>
        ) : (
          <div className="uam-cost-options" role="radiogroup" aria-label="Casting source">
            {castOptions.map((opt, idx) => (
              <label
                key={`${opt.type}-${opt.rank ?? opt.key ?? idx}`}
                className={`uam-cost-option${!opt.enabled ? ' uam-cost-option--disabled' : ''}`}
              >
                <input
                  type="radio"
                  name="cast-source"
                  checked={selectedCastIdx === idx}
                  onChange={() => { setCastOptionIdx(idx); setCastOverride(false); }}
                />
                {opt.label}
              </label>
            ))}
          </div>
        )}
        {(selectedCastOption?.type === 'slot' || selectedCastOption?.type === 'staff-slot') && (
          <HeightenedNotes spell={ability} castRank={selectedCastOption.rank} />
        )}
        {selectedCastOption && !selectedCastOption.enabled && (
          <>
            <div className="uam-cost-empty">
              {selectedCastOption.reason || 'Resource exhausted'}
            </div>
            <label className="uam-cost-override">
              <input
                type="checkbox"
                checked={castOverride}
                onChange={(e) => setCastOverride(e.target.checked)}
              />
              Override (GM ruling) — cast without spending
            </label>
          </>
        )}
      </section>
    </>
  ) : null;

  return {
    resources,
    mapStep,
    effectiveCost,
    castCost,
    chosenActions,
    variant,
    hasChainStrike,
    hasChainSpell,
    isMultiRay,
    rayCount,
    selectedCastOption,
    directCastRank,
    castGateOk,
    costDisplayFinal,
    onSpellChainCostChange,
    applyOnConfirm,
    mapRow,
    actionsSelector,
    castSection,
  };
};

export default useAbilityCastPlan;
