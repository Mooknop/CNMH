import React, { useState } from 'react';
import Modal from '../shared/Modal';
import { useSession } from '../../contexts/SessionContext';
import { useContent } from '../../contexts/ContentContext';
import { useGameDate } from '../../contexts/GameDateContext';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';
import { useCharacter } from '../../hooks/useCharacter';
import { useSyncedState } from '../../hooks/useSyncedState';
import { computeSaveDegree } from '../../utils/saveDegree';
import { formatModifier, hasFeat } from '../../utils/CharacterUtils';
import { hasGodlessHealing } from '../../utils/consumables';
import { toGameSeconds } from '../../utils/gameTime';
import { PERSISTENT_KEY } from '../../utils/persistentDamage';
import {
  availableDcs,
  healHint,
  hasImmunityFrom,
  bleedInstances,
  applyTreatWounds,
  applyStaunchBleeding,
} from '../../utils/treatWounds';
import { DEGREE_LABELS, DEGREE_CLASS } from '../../utils/degreeDisplay';
import './TreatWoundsModal.css';
import { APP } from '../../sync/keys';

const GODLESS_HEALING_BONUS = 2;
const STAUNCH_TWO_ACTION_DC_REDUCTION = 10;

const DEGREE_INFO = {
  criticalSuccess: { label: DEGREE_LABELS.criticalSuccess, cls: DEGREE_CLASS.criticalSuccess },
  success:         { label: DEGREE_LABELS.success,         cls: DEGREE_CLASS.success         },
  failure:         { label: DEGREE_LABELS.failure,         cls: DEGREE_CLASS.failure         },
  criticalFailure: { label: DEGREE_LABELS.criticalFailure, cls: DEGREE_CLASS.criticalFailure },
};

/**
 * Resolution modal for Treat Wounds, Battle Medicine, and Staunch Bleeding.
 *
 * @param {boolean} isOpen
 * @param {Function} onClose
 * @param {'treat-wounds'|'battle-medicine'|'staunch-bleeding'} mode
 * @param {Object}  healer      - raw character object (the acting PC)
 * @param {string}  themeColor
 * @param {number}  actionCost  - actions to spend on confirm (1 for Battle Medicine in encounter, 0 otherwise; Staunch Bleeding spends its own 1–2 action choice)
 */
const TreatWoundsModal = ({ isOpen, onClose, mode, healer, themeColor, actionCost, defaultTargetId = null }) => {
  const { getState, sendUpdate } = useSession();
  const { characters } = useContent();
  const { gameDate, time } = useGameDate();
  const { encounter, appendLog } = useEncounter();
  const healerModel = useCharacter(healer);
  const { spendActions } = useTurnState(healer?.id || 'nobody');
  const [persistentMap, setPersistentMap] = useSyncedState(PERSISTENT_KEY, {});

  // Pre-select the focused ally (#429) when one was handed in; the picker still
  // lets the healer change it.
  const [selectedTargetId, setSelectedTargetId] = useState(defaultTargetId);
  const [selectedDc, setSelectedDc] = useState(null);
  const [d20Input, setD20Input] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [mortalChecked, setMortalChecked] = useState(false);
  const [staunchActions, setStaunchActions] = useState(1);

  const staunch = mode === 'staunch-bleeding';
  const actionName = staunch
    ? 'Staunch Bleeding'
    : (mode === 'battle-medicine' ? 'Battle Medicine' : 'Treat Wounds');
  const encounterMode = !!(encounter?.active && encounter.phase === 'in-progress');

  const medicineModifier = healerModel?.skillModifiers?.medicine ?? 0;
  const medicineRank     = healerModel?.skillProficiencies?.medicine ?? 0;
  const dcs = availableDcs(medicineRank);

  const selectedTarget = characters.find((c) => c.id === selectedTargetId) || null;
  const targetEffects  = selectedTarget ? (getState(selectedTarget.id, APP.EFFECTS) || []) : [];
  const isImmune       = selectedTarget && hasImmunityFrom(targetEffects, healer?.id);

  // Staunch Bleeding (#224) — the two-action variant lowers the DC by 10, and
  // success clears the target's tracked persistent bleed. Bleeds live in the
  // encounter-keyed persistent map, so map the chosen PC to their entryId.
  const targetEntryId = selectedTarget
    ? (encounter?.order || []).find((e) => e.charId === selectedTarget.id)?.entryId || null
    : null;
  const targetBleeds = staunch && targetEntryId
    ? bleedInstances(persistentMap?.[targetEntryId])
    : [];
  const effectiveDc = selectedDc != null
    ? selectedDc - (staunch && staunchActions === 2 ? STAUNCH_TWO_ACTION_DC_REDUCTION : 0)
    : null;

  const d20     = parseInt(d20Input, 10);
  const hasD20  = !isNaN(d20);
  const total   = hasD20 ? d20 + medicineModifier : NaN;

  const degree = (hasD20 && effectiveDc != null)
    ? computeSaveDegree({ d20, total, dc: effectiveDc })
    : null;

  // Mortal Healing (Blu) — on a Treat Wounds success against a creature that
  // hasn't had divine healing in 24h, upgrade to a critical success. The 24h
  // condition can't be tracked, so it's a player-confirmed checkbox; offered
  // only on a raw success (you can't upgrade a crit or a failure).
  const canMortalHeal = mode === 'treat-wounds'
    && hasFeat(healer, 'Mortal Healing')
    && degree === 'success';
  const effectiveDegree = (canMortalHeal && mortalChecked) ? 'criticalSuccess' : degree;

  // Godless Healing (Blu) — +2 HP from healing-only effects received by the
  // target. Applies on any delivered healing (success / critical success); not
  // to Staunch Bleeding, which restores no HP.
  const targetGodless = !staunch && !!selectedTarget && hasGodlessHealing(selectedTarget);
  const godlessApplies = targetGodless
    && (effectiveDegree === 'success' || effectiveDegree === 'criticalSuccess');

  const staunchSuccess = staunch
    && (effectiveDegree === 'success' || effectiveDegree === 'criticalSuccess');

  const hint       = !staunch && effectiveDegree && effectiveDegree !== 'failure' && selectedDc != null
    ? healHint(selectedDc, effectiveDegree)
    : null;
  // Staunch Bleeding restores/deals no HP — it clears bleed on success, nothing
  // on failure — so it never needs a rolled amount.
  const needsAmount = !staunch
    && (effectiveDegree === 'success' || effectiveDegree === 'criticalSuccess' || effectiveDegree === 'criticalFailure');

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
    const nowSecs = toGameSeconds({ ...gameDate, ...time });

    if (staunch) {
      applyStaunchBleeding({
        healer:  { id: healer.id, name: healer.name },
        target:  { id: selectedTarget.id, name: selectedTarget.name },
        entryId: targetEntryId,
        dc:      effectiveDc,
        degree:  effectiveDegree,
        bleeds:  targetBleeds,
        nowSecs,
        getState,
        sendUpdate,
        setPersistentMap,
        appendLog,
      });
      if (encounterMode) spendActions(staunchActions, actionName);
      onClose();
      return;
    }

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
      nowSecs,
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
      placement="bottom"
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

      {/* ── Action cost (Staunch Bleeding only) ──────────────────────────── */}
      {staunch && (
        <>
          <section className="ct-section">
            <h3 className="ct-section-title">Actions</h3>
            <div className="tw-dc-row" role="group" aria-label="Select action cost">
              {[1, 2].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={['tw-dc-btn', staunchActions === n ? 'tw-dc-btn--on' : ''].filter(Boolean).join(' ')}
                  style={staunchActions === n ? { '--color-theme': themeColor, borderColor: themeColor } : {}}
                  onClick={() => setStaunchActions(n)}
                >
                  <span className="tw-dc-value">{n} action{n > 1 ? 's' : ''}</span>
                  <span className="tw-dc-hint">{n === 2 ? 'DC −10' : 'normal DC'}</span>
                </button>
              ))}
            </div>
          </section>
          <hr className="ct-divider" />
        </>
      )}

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
                  {staunch
                    ? `vs DC ${dc - (staunchActions === 2 ? STAUNCH_TWO_ACTION_DC_REDUCTION : 0)}`
                    : `${healHint(dc, 'success')} / ${healHint(dc, 'criticalSuccess')}`}
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

      {/* ── Bleeding (Staunch Bleeding only) ─────────────────────────────── */}
      {staunch && selectedTarget && (
        <>
          <hr className="ct-divider" />
          <section className="ct-section">
            <h3 className="ct-section-title">Bleeding</h3>
            {targetBleeds.length === 0 ? (
              <p className="tw-locked-notice">No tracked bleeding on {selectedTarget.name}.</p>
            ) : (
              <ul className="tw-bleed-list">
                {targetBleeds.map((b) => (
                  <li key={b.id} className="tw-bleed-row">
                    {b.dice} persistent {b.type || 'bleed'}
                    {b.sourceName && <span className="tw-bleed-source"> · {b.sourceName}</span>}
                  </li>
                ))}
              </ul>
            )}
            {staunchSuccess && targetBleeds.length > 0 && (
              <p className="tw-feat-note">Cleared on confirm.</p>
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
          {actionName}
          {staunch
            ? (encounterMode ? ` (${staunchActions} act)` : '')
            : (actionCost > 0 ? ` (${actionCost} act)` : '')}
        </button>
      </div>
    </Modal>
  );
};

export default TreatWoundsModal;
