// Stateless render sections of UseAbilityModal (extracted #1317 D4) — no
// state and no confirm-time behavior of their own; the orchestrator passes
// every live value (including chainRef and the hoisted mapSection/rollSection)
// in as props.

import ChainedStrikeSection from './ChainedStrikeSection';
import ChainedSpellSection from './ChainedSpellSection';

/**
 * Ability summary header: meta line, description, the ally-resistance note
 * (#228), the active harrow-omen line (#227) and the variable action-count
 * selector (passed in from useAbilityCastPlan).
 */
export const AbilitySummarySection = ({ ability, allyResistance, showsOmen, omen, actionsSelector }) => (
  <section className="ct-section">
    <div className="uam-meta-line">
      {ability.actions && <span>Actions: {ability.actions} · </span>}
      {ability.range   && <span>Range: {ability.range} · </span>}
      {ability.targets && <span>Targets: {ability.targets}</span>}
    </div>
    {ability.description && (
      <p className="uam-desc">
        {ability.description}
      </p>
    )}
    {allyResistance != null && (
      <p className="uam-ally-resistance">
        Ally gains resistance {allyResistance} against the triggering damage.
      </p>
    )}
    {showsOmen && (
      <p className="uam-omen-line">
        Active harrow omen: {omen.suit || 'none'}
        {ability.clearsOmen === true && omen.suit ? ' — spent on use' : ''}
      </p>
    )}
    {actionsSelector}
  </section>
);

/** Self / all-allies effect lines inside the Apply Effects section. */
export const StaticEffectsList = ({ effects, characterName }) => (
  <>
    {effects
      .filter((e) => e.applyTo === 'self' || e.applyTo === 'all-allies')
      .map((eff, idx) => (
        <div key={idx} className="uam-meta-line">
          <span>{eff.effectId}</span>
          {eff.applyTo === 'self' && (
            <span className="uam-inline-gap">→ {characterName}</span>
          )}
          {eff.applyTo === 'all-allies' && (
            <span className="uam-inline-gap">→ all allies</span>
          )}
          {eff.duration && (
            <span className="uam-duration-note">
              ({eff.duration.until === 'rounds' ? `${eff.duration.rounds} rounds` : eff.duration.until})
            </span>
          )}
        </div>
      ))}
  </>
);

/**
 * The bottom action area for abilities without structured effects: a chained
 * Strike (Inner Upheaval, Flurry) or chained spell cast (Reach Spell, Harrow
 * Casting) — else the hoisted MAP row + roll section. `chainRef` is the
 * orchestrator's ref; confirm reads getResults() through it.
 */
export const ChainedActionsSwitch = ({
  ability,
  character,
  chainRef,
  hasChainStrike,
  hasChainSpell,
  effectiveCost,
  enemyWithDefenses,
  activeConditions,
  activeEffects,
  mapStep,
  mapSection,
  rollSection,
  exploit,
  order,
  resources,
  onTotalCostChange,
  onSpellChange,
}) => (
  hasChainStrike ? (
    <>
      <h3 className="ct-section-title uam-chain-title">
        {ability.chain.heading
          || (ability.chain.modes?.includes('flurry') ? 'Strike or Flurry of Blows' : 'Strike')}
        <span className="uam-chain-title-cost">
          (included in {effectiveCost})
        </span>
      </h3>
      {mapSection}
      <ChainedStrikeSection
        ref={chainRef}
        character={character}
        chain={ability.chain}
        enemyTargets={enemyWithDefenses}
        conditions={activeConditions || []}
        effects={activeEffects || []}
        mapStep={mapStep}
        exploit={exploit}
        order={order}
      />
    </>
  ) : hasChainSpell ? (
    <>
      <h3 className="ct-section-title uam-chain-title">
        Cast a Spell
      </h3>
      <ChainedSpellSection
        ref={chainRef}
        character={character}
        chain={ability.chain}
        parentCost={effectiveCost}
        enemyTargets={enemyWithDefenses}
        conditions={activeConditions || []}
        effects={activeEffects || []}
        onTotalCostChange={onTotalCostChange}
        onSpellChange={onSpellChange}
        mapStep={mapStep}
        resources={resources}
        exploit={exploit}
        order={order}
      />
    </>
  ) : (
    <>
      {mapSection}
      {rollSection}
    </>
  )
);

/** Granted-actions display section; renders nothing without grants. */
export const GrantActionsSection = ({ grants, ability }) => (
  grants.length > 0 ? (
    <>
      <hr className="ct-divider" />
      <section className="ct-section">
        <h3 className="ct-section-title">Grant Actions</h3>
        {grants.map((grant, idx) => (
          <div key={idx} className="uam-grant-line">
            <span>{grant.action?.name || ability.name}</span>
            {grant.action?.description && (
              <span className="uam-grant-desc">
                {grant.action.description}
              </span>
            )}
            {grant.duration && (
              <span className="uam-duration-note">
                ({grant.duration.until === 'rounds' ? `${grant.duration.rounds} rounds` : grant.duration.until})
              </span>
            )}
          </div>
        ))}
      </section>
    </>
  ) : null
);
