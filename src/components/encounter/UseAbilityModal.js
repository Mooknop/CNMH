import React from 'react';
import Modal from '../shared/Modal';
import TargetPicker from './TargetPicker';
import { useSession } from '../../contexts/SessionContext';
import { useContent } from '../../contexts/ContentContext';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';
import { useTargeting } from '../../hooks/useTargeting';
import { applyAbility, abilityNeedsPicker } from '../../utils/applyAbility';

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
  const { encounter, appendLog } = useEncounter();
  const { spendActions, spendReaction } = useTurnState(character?.id || 'nobody');

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

  const confirmEnabled = !needsPicker || targets.length > 0;

  const charName = (charId) => characters.find((c) => c.id === charId)?.name || charId;

  const handleConfirm = () => {
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
      const allTargetNames = [...targetCharIds.map(charName), ...enemyTargetNames].join(', ');
      appendLog({
        type:   'action',
        charId: character.id,
        text:   allTargetNames
          ? `${character.name} ${effectiveVerb} ${ability.name} on ${allTargetNames}`
          : `${character.name} ${effectiveVerb} ${ability.name}`,
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
