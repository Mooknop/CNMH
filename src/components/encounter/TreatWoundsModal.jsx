import React, { useState } from 'react';
import Modal from '../shared/Modal';
import { useSession } from '../../contexts/SessionContext';
import { useContent } from '../../contexts/ContentContext';
import { useGameDate } from '../../contexts/GameDateContext';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';
import { useCharacter } from '../../hooks/useCharacter';
import { computeSaveDegree } from '../../utils/saveDegree';
import { formatModifier, hasFeat } from '../../utils/CharacterUtils';
import { hasGodlessHealing } from '../../utils/consumables';
import { toGameSeconds } from '../../utils/gameTime';

const GODLESS_HEALING_BONUS = 2;
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
  const [mortalChecked, setMortalChecked] = useState(false);

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

  // Mortal Healing (Blu) — on a Treat Wounds success against a creature that
  // hasn't had divine healing in 24h, upgrade to a critical success. The 24h
  // condition can't be tracked, so it's a player-confirmed checkbox; offered
  // only on a raw success (you can't upgrade a crit or a failure).
  const canMortalHeal = mode !== 'battle-medicine'
    && hasFeat(healer, 'Mortal Healing')
    && degree === 'success';
  const effectiveDegree = (canMortalHeal && mortalChecked) ? 'criticalSuccess' : degree;

  // Godless Healing (Blu) — +2 HP from healing-only effects received by the
  // target. Applies on any delivered healing (success / critical success).
  const targetGodless = !!selectedTarget && hasGodlessHealing(selectedTarget);
  const godlessApplies = targetGodless
    && (effectiveDegree === 'success' || effectiveDegree === 'criticalSuccess');

  const hint       = effectiveDegree && effectiveDegree !== 'failure' && selectedDc != null
    ? healHint(selectedDc, effectiveDegree)
    : null;
  const needsAmount = effectiveDegree === 'success' || effectiveDegree === 'criticalSuccess' || effectiveDegree === 'criticalFailure';

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
    setMortalChecked(false);
  };

  const handleDcSelect = (dc) => {
    setSelectedDc(dc);
    setAmountInput('');
    setMortalChecked(false);
  };

  const handleD20Change = (val) => {
    setD20Input(val);
    setAmountInput('');
    setMortalChecked(false);
  };

  const handleConfirm = () => {
    if (!confirmEnabled || !selectedTarget) return;
    const healAmount = needsAmount
      ? amount + (godlessApplies ? GODLESS_HEALING_BONUS : 0)
      : 0;
    applyTreatWounds({
      healer:     { id: healer.id, name: healer.name },
      target:     { id: selectedTarget.id, name: selectedTarget.name, maxHp: selectedTarget.maxHp },
      dc:         selectedDc,
      degree:     effectiveDegree,
      amount:     healAmount,
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

  const degreeInfo = effectiveDegree ? DEGREE_INFO[effectiveDegree] : null;

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

        {/* Mortal Healing (#224) — upgrade a Treat Wounds success to a crit when
            the target hasn't had divine healing in 24h (player-confirmed). */}
        {canMortalHeal && (
          <label className="tw-feat-toggle">
            <input
              type="checkbox"
              checked={mortalChecked}
              onChange={(e) => setMortalChecked(e.target.checked)}
            />
            <span>
              <strong>Mortal Healing:</strong> target hasn't regained HP from
              divine magic in 24h — upgrade to a critical success.
            </span>
          </label>
        )}
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
                aria-label={effectiveDegree === 'criticalFailure' ? 'damage total' : 'hp healed'}
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
              />
            </div>
            {godlessApplies && (
              <p className="tw-feat-note">
                <strong>Godless Healing:</strong> +{GODLESS_HEALING_BONUS} HP (healing-only)
                applied on top of the rolled total.
              </p>
            )}
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
