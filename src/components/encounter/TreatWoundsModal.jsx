import React, { useState } from 'react';
import Modal from '../shared/Modal';
import { useSession } from '../../contexts/SessionContext';
import { useContent } from '../../contexts/ContentContext';
import { useGameDate } from '../../contexts/GameDateContext';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';
import { useCharacter } from '../../hooks/useCharacter';
import { computeSaveDegree } from '../../utils/saveDegree';
import { formatModifier } from '../../utils/CharacterUtils';
import { toGameSeconds } from '../../utils/gameTime';
import {
  availableDcs,
  healHint,
  hasImmunityFrom,
  applyTreatWounds,
} from '../../utils/treatWounds';
import './TreatWoundsModal.css';

const DEGREE_INFO = {
  criticalSuccess: { label: 'Critical Success', cls: 'tw-degree--crit-success' },
  success:         { label: 'Success',           cls: 'tw-degree--success'      },
  failure:         { label: 'Failure',           cls: 'tw-degree--failure'      },
  criticalFailure: { label: 'Critical Failure',  cls: 'tw-degree--crit-failure' },
};

/**
 * Resolution modal for Treat Wounds and Battle Medicine.
 *
 * @param {boolean} isOpen
 * @param {Function} onClose
 * @param {'treat-wounds'|'battle-medicine'} mode
 * @param {Object}  healer      - raw character object (the acting PC)
 * @param {string}  themeColor
 * @param {number}  actionCost  - actions to spend on confirm (1 for Battle Medicine in encounter, 0 otherwise)
 */
const TreatWoundsModal = ({ isOpen, onClose, mode, healer, themeColor, actionCost }) => {
  const { getState, sendUpdate } = useSession();
  const { characters } = useContent();
  const { gameDate, time } = useGameDate();
  const { encounter, appendLog } = useEncounter();
  const healerModel = useCharacter(healer);
  const { spendActions } = useTurnState(healer?.id || 'nobody');

  const [selectedTargetId, setSelectedTargetId] = useState(null);
  const [selectedDc, setSelectedDc] = useState(null);
  const [d20Input, setD20Input] = useState('');
  const [amountInput, setAmountInput] = useState('');

  const actionName = mode === 'battle-medicine' ? 'Battle Medicine' : 'Treat Wounds';
  const encounterMode = !!(encounter?.active && encounter.phase === 'in-progress');

  const medicineModifier = healerModel?.skillModifiers?.medicine ?? 0;
  const medicineRank     = healerModel?.skillProficiencies?.medicine ?? 0;
  const dcs = availableDcs(medicineRank);

  const selectedTarget = characters.find((c) => c.id === selectedTargetId) || null;
  const targetEffects  = selectedTarget ? (getState(selectedTarget.id, 'effects') || []) : [];
  const isImmune       = selectedTarget && hasImmunityFrom(targetEffects, healer?.id);

  const d20     = parseInt(d20Input, 10);
  const hasD20  = !isNaN(d20);
  const total   = hasD20 ? d20 + medicineModifier : NaN;

  const degree = (hasD20 && selectedDc != null)
    ? computeSaveDegree({ d20, total, dc: selectedDc })
    : null;

  const hint       = degree && degree !== 'failure' && selectedDc != null
    ? healHint(selectedDc, degree)
    : null;
  const needsAmount = degree === 'success' || degree === 'criticalSuccess' || degree === 'criticalFailure';

  const amount    = parseInt(amountInput, 10);
  const hasAmount = !isNaN(amount) && amount > 0;

  const confirmEnabled =
    selectedTarget != null &&
    selectedDc != null &&
    hasD20 &&
    degree != null &&
    (!needsAmount || hasAmount) &&
    !isImmune;

  const handleTargetSelect = (id) => {
    setSelectedTargetId((prev) => (prev === id ? null : id));
    setAmountInput('');
  };

  const handleDcSelect = (dc) => {
    setSelectedDc(dc);
    setAmountInput('');
  };

  const handleD20Change = (val) => {
    setD20Input(val);
    setAmountInput('');
  };

  const handleConfirm = () => {
    if (!confirmEnabled || !selectedTarget) return;
    applyTreatWounds({
      healer:     { id: healer.id, name: healer.name },
      target:     { id: selectedTarget.id, name: selectedTarget.name, maxHp: selectedTarget.maxHp },
      dc:         selectedDc,
      degree,
      amount:     needsAmount ? amount : 0,
      actionName,
      nowSecs:    toGameSeconds({ ...gameDate, ...time }),
      getState,
      sendUpdate,
      appendLog,
    });
    if (encounterMode && actionCost > 0) {
      spendActions(actionCost, actionName);
    }
    onClose();
  };

  if (!isOpen || !healer) return null;

  const degreeInfo = degree ? DEGREE_INFO[degree] : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={actionName}
      themeColor={themeColor}
      maxWidth="460px"
    >
      {/* ── Target ─────────────────────────────────────────────────────── */}
      <section className="ct-section">
        <h3 className="ct-section-title">Target</h3>
        <div className="tw-target-list" role="group" aria-label="Select target">
          {characters.map((c) => (
            <button
              key={c.id}
              type="button"
              className={[
                'ttp-target-chip',
                selectedTargetId === c.id ? 'ttp-target-chip--on' : '',
              ].filter(Boolean).join(' ')}
              aria-pressed={selectedTargetId === c.id}
              onClick={() => handleTargetSelect(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </section>

      <hr className="ct-divider" />

      {/* ── DC ─────────────────────────────────────────────────────────── */}
      <section className="ct-section">
        <h3 className="ct-section-title">DC</h3>
        {dcs.length === 0 ? (
          <p className="tw-locked-notice">Medicine training required (rank ≥ 1).</p>
        ) : (
          <div className="tw-dc-row" role="group" aria-label="Select DC">
            {dcs.map((dc) => (
              <button
                key={dc}
                type="button"
                className={['tw-dc-btn', selectedDc === dc ? 'tw-dc-btn--on' : ''].filter(Boolean).join(' ')}
                style={selectedDc === dc ? { '--color-theme': themeColor, borderColor: themeColor } : {}}
                onClick={() => handleDcSelect(dc)}
              >
                <span className="tw-dc-value">DC {dc}</span>
                <span className="tw-dc-hint">
                  {healHint(dc, 'success')} / {healHint(dc, 'criticalSuccess')}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <hr className="ct-divider" />

      {/* ── Medicine check ──────────────────────────────────────────────── */}
      <section className="ct-section">
        <h3 className="ct-section-title">Medicine Check</h3>
        <div className="trr-entry-row">
          <input
            type="number"
            className="trr-roll-input"
            placeholder="d20"
            aria-label="raw d20"
            value={d20Input}
            onChange={(e) => handleD20Change(e.target.value)}
          />
          <span className="trr-bonus-badge" aria-label="medicine modifier">
            {formatModifier(medicineModifier)}
          </span>
          {hasD20 && (
            <span className="trr-total-badge">= {total}</span>
          )}
          {degreeInfo && (
            <span className={`tw-degree-chip ${degreeInfo.cls}`}>
              {degreeInfo.label}
            </span>
          )}
        </div>
      </section>

      {/* ── Amount (healing or damage) ───────────────────────────────────── */}
      {needsAmount && hint && (
        <>
          <hr className="ct-divider" />
          <section className="ct-section">
            <h3 className="ct-section-title">
              {degree === 'criticalFailure' ? 'Damage Dealt' : 'HP Healed'}
            </h3>
            <div className="trr-entry-row">
              <span className="tw-hint-label">{hint}</span>
              <input
                type="number"
                className="trr-roll-input"
                placeholder="total"
                aria-label={degree === 'criticalFailure' ? 'damage total' : 'hp healed'}
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
              />
            </div>
          </section>
        </>
      )}

      {/* ── Immunity block ────────────────────────────────────────────────── */}
      {isImmune && (
        <div className="tw-immunity-notice">
          <strong>{selectedTarget?.name}</strong> is immune to your {actionName}.
          Ask the GM to remove the "Treat Wounds Immunity" effect before treating again.
        </div>
      )}

      <div className="tw-footer">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button
          className="btn-primary"
          onClick={handleConfirm}
          disabled={!confirmEnabled}
        >
          {actionName}{actionCost > 0 ? ` (${actionCost} act)` : ''}
        </button>
      </div>
    </Modal>
  );
};

export default TreatWoundsModal;
