import React, { useRef } from 'react';
import Modal from '../shared/Modal';
import TargetPicker from './TargetPicker';
import TargetRollResolver from './TargetRollResolver';
import ChainedStrikeSection from './ChainedStrikeSection';
import { useSession } from '../../contexts/SessionContext';
import { useContent } from '../../contexts/ContentContext';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';
import { useTargeting } from '../../hooks/useTargeting';
import { useEffects } from '../../hooks/useEffects';
import { useSyncedState } from '../../hooks/useSyncedState';
import { applyAbility, abilityNeedsPicker } from '../../utils/applyAbility';
import { DEFENSE_LABELS } from '../../utils/defense';
import { resolveActionRoll } from '../../utils/rollResolution';

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
  if (ability.actions) return ability.actions;
  if (explicitCost === 'reaction') return 'Reaction';
  if (explicitCost === 'free' || explicitCost === 0) return 'Free';
  if (typeof explicitCost === 'number') return String(explicitCost);
  return '?';
};

/**
 * Unified modal for using any encounter ability (action / reaction / spell).
 *
 * If the ability has structured effects[] or grants[], shows a shared TargetPicker
 * and applies them to the chosen targets on confirm. Otherwise just logs the use.
 *
 * @param {Object}        ability    - The action / spell object
 * @param {number|string} [cost]     - Explicit action cost (optional; parsed from ability.actions if omitted)
 * @param {string}        verb       - 'Cast' | 'Use' — shown in title and confirm button
 * @param {Object}        character  - The acting character
 * @param {string}        themeColor - Theme colour
 */
const UseAbilityModal = ({
  isOpen,
  onClose,
  ability,
  cost: explicitCost,
  verb = 'Use',
  character,
  themeColor,
}) => {
  const { getState, sendUpdate } = useSession();
  const { characters } = useContent();
  const { encounter, appendLog, addSaveRequest } = useEncounter();
  const { spendActions, spendReaction } = useTurnState(character?.id || 'nobody');

  const resolverRef = useRef(null);
  const chainRef    = useRef(null);

  // Read the actor's active conditions and effects (same sources StatsBlock uses).
  const [activeConditions] = useSyncedState(`cnmh_conditions_${character?.id || ''}`, []);
  const { effects: activeEffects } = useEffects(character?.id || '');

  const order = encounter?.order || [];

  const { targets, selectable, isTargeted, toggleTarget } =
    useTargeting(character?.id || '', order, { includeSelf: true });

  if (!ability || !character) return null;

  const effects     = Array.isArray(ability.effects) ? ability.effects : [];
  const grants      = Array.isArray(ability.grants)  ? ability.grants  : [];
  const hasEffects  = effects.length > 0 || grants.length > 0;
  const needsPicker = abilityNeedsPicker(ability);

  const effectiveCost = explicitCost !== undefined ? explicitCost : parseActionCost(ability.actions);
  const effectiveVerb = verb.toLowerCase();
  const costDisplay   = costToDisplay(ability, effectiveCost);

  const casterEntry    = order.find((e) => e.kind === 'pc' && e.charId === character.id);
  const casterEntryId  = casterEntry?.entryId || null;

  const selectedEntries  = order.filter((e) => targets.includes(e.entryId));
  const targetCharIds    = selectedEntries.filter((e) => e.kind === 'pc' && e.charId).map((e) => e.charId);
  const enemyTargetNames = selectedEntries.filter((e) => e.kind === 'enemy').map((e) => e.name);

  // Enemy targets with defense data — used by both the regular resolver and the chain section.
  const enemyWithDefenses = selectedEntries.filter((e) => e.kind === 'enemy' && e.defenses);

  const hasChainStrike = ability.chain?.into === 'strike';

  // Resolve roll profile — includes condition/effect netting for the actor.
  const rollProfile = resolveActionRoll(ability, character, {
    conditions: activeConditions || [],
    effects: activeEffects || [],
  });

  // Which defense to show on the resolver (actor-roll only).
  const effectiveDefense = rollProfile.mode === 'actor-roll'
    ? rollProfile.defense
    : (ability.targetDefense || (ability.traits?.includes('Attack') ? 'ac' : null));

  // Enemy targets that have defense data and a resolvable defense (actor-roll path only).
  const resolverTargets = (rollProfile.mode === 'actor-roll' && effectiveDefense)
    ? enemyWithDefenses
    : [];

  // For target-save: enemy targets whose save mod we can read (used in the save request).
  const saveTargets = rollProfile.mode === 'target-save'
    ? selectedEntries.filter((e) => e.kind === 'enemy')
    : [];

  const confirmEnabled = !needsPicker || targets.length > 0;

  const charName = (charId) => characters.find((c) => c.id === charId)?.name || charId;

  const handleConfirm = () => {
    const rollResults  = resolverRef.current?.getResults() ?? null;
    const chainResults = chainRef.current?.getResults() ?? null;

    // Entry IDs of enemies whose result has a degree (they get a dedicated log line).
    const coveredByRoll = new Set(
      rollResults ? rollResults.filter((r) => r.degree != null).map((r) => r.entryId) : []
    );

    if (hasEffects) {
      applyAbility({
        ability,
        caster: character,
        casterEntryId,
        targetCharIds,
        enemyTargetNames,
        order,
        encounter,
        characters,
        getState,
        sendUpdate,
        appendLog,
        verb: effectiveVerb,
      });
    } else {
      // Generic action log — omit enemies whose roll result will be logged below.
      const genericNames = [
        ...targetCharIds.map(charName),
        ...selectedEntries
          .filter((e) => e.kind === 'enemy' && !coveredByRoll.has(e.entryId))
          .map((e) => e.name),
      ].join(', ');
      if (genericNames || coveredByRoll.size === 0) {
        appendLog({
          type:   'action',
          charId: character.id,
          text:   genericNames
            ? `${character.name} ${effectiveVerb} ${ability.name} on ${genericNames}`
            : `${character.name} ${effectiveVerb} ${ability.name}`,
        });
      }
    }

    if (rollResults) {
      const defLabel = DEFENSE_LABELS[effectiveDefense] || effectiveDefense;
      const degreeMap = effectiveDefense === 'ac'
        ? { criticalSuccess: 'Critical Hit', success: 'Hit', failure: 'Miss', criticalFailure: 'Critical Miss' }
        : { criticalSuccess: 'Critical Success', success: 'Success', failure: 'Failure', criticalFailure: 'Critical Failure' };
      rollResults.forEach((r) => {
        if (!r.degree) return;
        const degreeLabel = degreeMap[r.degree] || r.degree;
        appendLog({
          type:   'action',
          charId: character.id,
          text:   `${character.name} ${effectiveVerb} ${ability.name} vs ${r.name} (${defLabel} ${r.dc}): ${r.total} → ${degreeLabel}`,
        });
      });
    }

    // Log chained strike results (Inner Upheaval and similar).
    if (chainResults) {
      const strikeLabel = chainResults.mode === 'flurry' ? 'Flurry of Blows' : chainResults.strikeName;
      chainResults.rolls.forEach((rollSet, rollIdx) => {
        if (!rollSet) return;
        const strikeNum = chainResults.mode === 'flurry' ? ` (${rollIdx + 1})` : '';
        rollSet.forEach((r) => {
          const degreeLabel = r.degree
            ? ({ criticalSuccess: 'Critical Hit', success: 'Hit', failure: 'Miss', criticalFailure: 'Critical Miss' }[r.degree] || r.degree)
            : null;
          const resultText = degreeLabel
            ? `${character.name} ${effectiveVerb} ${ability.name} — ${strikeLabel}${strikeNum} vs ${r.name} (AC ${r.dc}): ${r.total} → ${degreeLabel} · dmg ${chainResults.damage}`
            : `${character.name} ${effectiveVerb} ${ability.name} — ${strikeLabel}${strikeNum} · dmg ${chainResults.damage}`;
          appendLog({ type: 'action', charId: character.id, text: resultText });
        });
        if (!rollSet.length) {
          appendLog({ type: 'action', charId: character.id, text: `${character.name} ${effectiveVerb} ${ability.name} — ${strikeLabel}${strikeNum} · dmg ${chainResults.damage}` });
        }
      });
    }

    // Push a save request to the GM for target-save abilities.
    if (rollProfile.mode === 'target-save' && saveTargets.length > 0 && rollProfile.dc != null) {
      const targets = saveTargets.map((e) => ({
        entryId: e.entryId,
        name: e.name,
        saveMod: e.defenses?.saves?.[rollProfile.defense] ?? null,
      }));
      addSaveRequest({
        casterId: character.id,
        casterName: character.name,
        abilityName: ability.name,
        save: rollProfile.defense,
        dc: rollProfile.dc,
        basic: !!(ability.basic),
        targets,
      });
    }

    if (effectiveCost === 'reaction') {
      spendReaction(`${verb} ${ability.name}`);
    } else if (effectiveCost > 0) {
      spendActions(effectiveCost, `${verb} ${ability.name}`);
    }

    onClose();
  };

  const staticEffects = effects.filter(
    (e) => e.applyTo === 'self' || e.applyTo === 'all-allies'
  );

  // The roll resolution section: inline resolver (actor-roll) or save-request info (target-save).
  let rollSection = null;
  if (rollProfile.mode === 'actor-roll' && resolverTargets.length > 0) {
    rollSection = (
      <TargetRollResolver
        ref={resolverRef}
        enemyTargets={resolverTargets}
        targetDefense={effectiveDefense}
        rollBonus={rollProfile.bonus}
      />
    );
  } else if (rollProfile.mode === 'target-save' && saveTargets.length > 0) {
    const saveLabel = DEFENSE_LABELS[rollProfile.defense] || rollProfile.defense;
    rollSection = (
      <div className="ct-save-request-preview" style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
        <strong>Save request → GM:</strong> {saveLabel} DC {rollProfile.dc}
        <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
          {saveTargets.map((e) => (
            <li key={e.entryId}>{e.name}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${verb}: ${ability.name}`}
      themeColor={themeColor}
      maxWidth="560px"
    >
      {/* Ability summary */}
      <section className="ct-section">
        <div style={{ marginBottom: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          {ability.actions && <span>Actions: {ability.actions} · </span>}
          {ability.range   && <span>Range: {ability.range} · </span>}
          {ability.targets && <span>Targets: {ability.targets}</span>}
        </div>
        {ability.description && (
          <p style={{ fontSize: '0.85rem', margin: '0 0 0.25rem', color: 'var(--color-text-muted)' }}>
            {ability.description}
          </p>
        )}
      </section>

      {hasEffects && (
        <>
          <hr className="ct-divider" />
          <section className="ct-section">
            <h3 className="ct-section-title">Apply Effects</h3>

            {staticEffects.map((eff, idx) => (
              <div key={idx} style={{ marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                <span>{eff.effectId}</span>
                {eff.applyTo === 'self' && (
                  <span style={{ marginLeft: '0.5rem' }}>→ {character.name}</span>
                )}
                {eff.applyTo === 'all-allies' && (
                  <span style={{ marginLeft: '0.5rem' }}>→ all allies</span>
                )}
                {eff.duration && (
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem' }}>
                    ({eff.duration.until === 'rounds' ? `${eff.duration.rounds} rounds` : eff.duration.until})
                  </span>
                )}
              </div>
            ))}

            {needsPicker && (
              <TargetPicker
                selectable={selectable}
                isTargeted={isTargeted}
                onToggle={toggleTarget}
              />
            )}
            {rollSection}
          </section>
        </>
      )}

      {grants.length > 0 && (
        <>
          <hr className="ct-divider" />
          <section className="ct-section">
            <h3 className="ct-section-title">Grant Actions</h3>
            {grants.map((grant, idx) => (
              <div key={idx} style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                <span>{grant.action?.name || ability.name}</span>
                {grant.action?.description && (
                  <span style={{ display: 'block', fontStyle: 'italic', fontSize: '0.8rem' }}>
                    {grant.action.description}
                  </span>
                )}
                {grant.duration && (
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem' }}>
                    ({grant.duration.until === 'rounds' ? `${grant.duration.rounds} rounds` : grant.duration.until})
                  </span>
                )}
              </div>
            ))}
          </section>
        </>
      )}

      {!hasEffects && (
        <>
          <hr className="ct-divider" />
          <section className="ct-section">
            <TargetPicker
              selectable={selectable}
              isTargeted={isTargeted}
              onToggle={toggleTarget}
            />
            {hasChainStrike ? (
              <>
                <h3 className="ct-section-title" style={{ marginTop: '0.75rem' }}>
                  {ability.chain.modes?.includes('flurry') ? 'Strike or Flurry of Blows' : 'Strike'}
                  <span style={{ marginLeft: '8px', fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--color-text-muted)' }}>
                    (included in {costDisplay})
                  </span>
                </h3>
                <ChainedStrikeSection
                  ref={chainRef}
                  character={character}
                  chain={ability.chain}
                  enemyTargets={enemyWithDefenses}
                  conditions={activeConditions || []}
                  effects={activeEffects || []}
                />
              </>
            ) : rollSection}
          </section>
        </>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button
          className="btn-primary"
          onClick={handleConfirm}
          disabled={!confirmEnabled}
          aria-label="confirm-cast"
        >
          {verb} ({costDisplay})
        </button>
      </div>
    </Modal>
  );
};

export default UseAbilityModal;
