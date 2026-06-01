import React, { useState } from 'react';
import Modal from '../shared/Modal';
import { useSession } from '../../contexts/SessionContext';
import { useContent } from '../../contexts/ContentContext';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';
import { resolveExpireAt } from '../../utils/expiry';
import { newEntryUid } from '../../utils/uid';

const writeLocal = (key, value) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
};

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

/**
 * Modal for casting a spell in encounter mode.
 *
 * If the spell has a structured `effects` array, shows a target picker per
 * effect and resolves `expireAt` on apply. If not, the Cast button simply
 * spends the action cost and logs the cast.
 */
const CastSpellModal = ({
  isOpen,
  onClose,
  spell,
  character,
  themeColor,
}) => {
  const { getState, sendUpdate } = useSession();
  const { characters } = useContent();
  const { encounter, appendLog } = useEncounter();
  const { spendActions, spendReaction } = useTurnState(character?.id || 'nobody');

  const [targets, setTargets] = useState({}); // effectIndex/grantIndex → charId

  if (!spell || !character) return null;

  const spellEffects = Array.isArray(spell.effects) ? spell.effects : [];
  const spellGrants = Array.isArray(spell.grants) ? spell.grants : [];
  const cost = parseActionCost(spell.actions);

  // Find the caster's encounter entry (for resolveExpireAt)
  const casterEntry = (encounter.order || []).find(
    (e) => e.kind === 'pc' && e.charId === character.id
  );
  const casterEntryId = casterEntry?.entryId || null;

  const getTargetOptions = (applyTo) => {
    if (applyTo === 'self') return [character];
    return characters.filter(Boolean);
  };

  const getDefaultTarget = (applyTo, idx) => {
    if (targets[idx]) return targets[idx];
    if (applyTo === 'self') return character.id;
    return character.id;
  };

  const handleCast = () => {
    if (spellEffects.length > 0) {
      // Apply each structured effect to its target
      spellEffects.forEach((spellEffect, idx) => {
        const targetId =
          spellEffect.applyTo === 'self'
            ? character.id
            : (targets[idx] ?? character.id);

        const targetEntry = (encounter.order || []).find(
          (e) => e.kind === 'pc' && e.charId === targetId
        );
        const targetEntryId = targetEntry?.entryId || null;

        const expireAt = resolveExpireAt(
          spellEffect.duration || null,
          encounter,
          casterEntryId,
          targetEntryId
        );

        const current = getState(targetId, 'effects') || [];
        const newEntry = {
          id: newEntryUid(),
          effectId: spellEffect.effectId,
          appliedBy: character.id,
          source: spell.name,
          expireAt: expireAt || undefined,
          ts: Date.now(),
        };
        const next = [...current, newEntry];
        const key = `cnmh_effects_${targetId}`;
        writeLocal(key, next);
        sendUpdate(targetId, 'effects', next);

        const targetChar = characters.find((c) => c.id === targetId);
        const targetName = targetChar?.name || targetId;
        appendLog({
          type: 'action',
          charId: character.id,
          text: `${character.name} cast ${spell.name} on ${targetName}`,
        });
      });
    } else {
      // No structured effects — just log the cast
      appendLog({
        type: 'action',
        charId: character.id,
        text: `${character.name} cast ${spell.name}`,
      });
    }

    // Write any granted actions to each target
    spellGrants.forEach((grant, idx) => {
      const targetId =
        grant.applyTo === 'self'
          ? character.id
          : (targets[`g${idx}`] ?? character.id);

      const targetEntry = (encounter.order || []).find(
        (e) => e.kind === 'pc' && e.charId === targetId
      );
      const targetEntryId = targetEntry?.entryId || null;

      const expireAt = resolveExpireAt(
        grant.duration || null,
        encounter,
        casterEntryId,
        targetEntryId
      );

      const current = getState(targetId, 'grantedactions') || [];
      const newGrant = {
        id: newEntryUid(),
        action: grant.action,
        source: spell.name,
        grantedBy: character.id,
        expireAt: expireAt || undefined,
        ts: Date.now(),
      };
      const next = [...current, newGrant];
      const key = `cnmh_grantedactions_${targetId}`;
      writeLocal(key, next);
      sendUpdate(targetId, 'grantedactions', next);

      const targetChar = characters.find((c) => c.id === targetId);
      const targetName = targetChar?.name || targetId;
      appendLog({
        type: 'action',
        charId: character.id,
        text: `${character.name} granted ${grant.action?.name || spell.name} to ${targetName}`,
      });
    });

    // Debit action cost
    if (cost === 'reaction') {
      spendReaction(`Cast ${spell.name}`);
    } else if (cost > 0) {
      spendActions(cost, `Cast ${spell.name}`);
    }

    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Cast: ${spell.name}`}
      themeColor={themeColor}
      maxWidth="560px"
    >
      {/* Spell summary */}
      <section className="ct-section">
        <div style={{ marginBottom: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          {spell.actions && <span>Actions: {spell.actions} · </span>}
          {spell.range && <span>Range: {spell.range} · </span>}
          {spell.targets && <span>Targets: {spell.targets}</span>}
        </div>
      </section>

      {/* Per-effect target pickers */}
      {spellEffects.length > 0 && (
        <>
          <hr className="ct-divider" />
          <section className="ct-section">
            <h3 className="ct-section-title">Apply Effects</h3>
            {spellEffects.map((eff, idx) => {
              const options = getTargetOptions(eff.applyTo);
              return (
                <div key={idx} style={{ marginBottom: '0.75rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                    {eff.effectId}
                    {eff.applyTo === 'all-allies' ? ' → all allies' : ''}
                  </label>
                  {eff.applyTo !== 'self' && eff.applyTo !== 'all-allies' && (
                    <select
                      aria-label={`target-${idx}`}
                      value={getDefaultTarget(eff.applyTo, idx)}
                      onChange={(e) =>
                        setTargets((prev) => ({ ...prev, [idx]: e.target.value }))
                      }
                      style={{ display: 'block', marginTop: '4px', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--color-border)' }}
                    >
                      {options.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.id === character.id ? ' (you)' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                  {eff.applyTo === 'self' && (
                    <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem' }}>→ {character.name}</span>
                  )}
                  {eff.duration && (
                    <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      ({eff.duration.until === 'rounds' ? `${eff.duration.rounds} rounds` : eff.duration.until})
                    </span>
                  )}
                </div>
              );
            })}
          </section>
        </>
      )}

      {spellEffects.length === 0 && spellGrants.length === 0 && (
        <>
          <hr className="ct-divider" />
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '0 0 1rem' }}>
            No structured effects — use Apply Effect to apply buffs manually.
          </p>
        </>
      )}

      {/* Per-grant target pickers */}
      {spellGrants.length > 0 && (
        <>
          <hr className="ct-divider" />
          <section className="ct-section">
            <h3 className="ct-section-title">Grant Actions</h3>
            {spellGrants.map((grant, idx) => {
              const options = getTargetOptions(grant.applyTo || 'ally');
              return (
                <div key={idx} style={{ marginBottom: '0.75rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                    {grant.action?.name || spell.name}
                    {grant.action?.description && (
                      <span style={{ display: 'block', fontStyle: 'italic', fontSize: '0.8rem' }}>
                        {grant.action.description}
                      </span>
                    )}
                  </label>
                  {grant.applyTo !== 'self' && (
                    <select
                      aria-label={`grant-target-${idx}`}
                      value={targets[`g${idx}`] ?? character.id}
                      onChange={(e) =>
                        setTargets((prev) => ({ ...prev, [`g${idx}`]: e.target.value }))
                      }
                      style={{ display: 'block', marginTop: '4px', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--color-border)' }}
                    >
                      {options.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.id === character.id ? ' (you)' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                  {grant.duration && (
                    <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      ({grant.duration.until === 'rounds' ? `${grant.duration.rounds} rounds` : grant.duration.until})
                    </span>
                  )}
                </div>
              );
            })}
          </section>
        </>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button
          className="btn-primary"
          onClick={handleCast}
          aria-label="confirm-cast"
        >
          Cast ({spell.actions || '?'})
        </button>
      </div>
    </Modal>
  );
};

export default CastSpellModal;
