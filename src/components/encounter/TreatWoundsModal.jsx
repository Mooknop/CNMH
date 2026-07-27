import React, { useState } from 'react';
import RollSheet from './RollSheet';
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
import './TreatWoundsModal.css';
import { APP } from '../../sync/keys';

const GODLESS_HEALING_BONUS = 2;
const STAUNCH_TWO_ACTION_DC_REDUCTION = 10;
// Every degree Treat Wounds / Battle Medicine needs a rolled amount for — a
// critical failure deals damage rather than healing, but it still needs one.
const AMOUNT_DEGREES = ['success', 'criticalSuccess', 'criticalFailure'];

/**
 * Resolution modal for Treat Wounds, Battle Medicine, and Staunch Bleeding —
 * a `RollSheet` configuration (#1688, Roll Resolution redesign workstream F).
 * The roll math, DC table, and the Mortal Healing / Godless Healing riders are
 * unchanged; only the presentation moved into the shell.
 *
 * RollSheet shows no degree before commit, so Mortal Healing — which used to
 * gate on a live `degree === 'success'` — is now a pre-declared intent
 * (checked ahead of the roll, applied inside `onCommit` once the degree is
 * known). Godless Healing stays fully automatic.
 *
 * The flow inverts from the pre-RollSheet shape: `onCommit` now fires the
 * log/spend for degrees with nothing further to enter (failure — and, for
 * Staunch Bleeding, every degree) immediately; degrees that need a rolled
 * amount (success / critical success / critical failure) defer the actual
 * `applyTreatWounds` call to `onFinish`, once the player has entered it.
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
  const [staunchActions, setStaunchActions] = useState(1);
  const [mortalChecked, setMortalChecked] = useState(false);
  // Echoed out of `onCommit` once the roll lands — the amount/finish phases
  // read only this frozen mirror, never live selection state (mirrors
  // RollSheet's own "committed" rule, since RollSheet only hands `onFinish`
  // the entered amounts, nothing else).
  const [resolved, setResolved] = useState(null);

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
  const isImmune       = !!selectedTarget && hasImmunityFrom(targetEffects, healer?.id);

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

  // Mortal Healing (Blu) — pre-declared, since no degree exists on screen
  // before commit: offered whenever the feat applies to this mode, not only
  // on an already-known success.
  const canMortalHeal = mode === 'treat-wounds' && hasFeat(healer, 'Mortal Healing');
  const targetGodless = !staunch && !!selectedTarget && hasGodlessHealing(selectedTarget);

  const blockLine = (() => {
    if (dcs.length === 0) return 'Medicine training required (rank ≥ 1).';
    if (!selectedTarget) return 'Select a target to treat.';
    if (isImmune) return `${selectedTarget.name} is immune to your ${actionName}.`;
    if (selectedDc == null) return 'Select a DC.';
    return null;
  })();

  const handleCommit = (face) => {
    const total = face + medicineModifier;
    const rawDegree = computeSaveDegree({ d20: face, total, dc: effectiveDc });
    const nowSecs = toGameSeconds({ ...gameDate, ...time });
    const target = { id: selectedTarget.id, name: selectedTarget.name, maxHp: selectedTarget.maxHp };

    if (staunch) {
      applyStaunchBleeding({
        healer:  { id: healer.id, name: healer.name },
        target,
        entryId: targetEntryId,
        dc:      effectiveDc,
        degree:  rawDegree,
        bleeds:  targetBleeds,
        nowSecs,
        getState,
        sendUpdate,
        setPersistentMap,
        appendLog,
      });
      if (encounterMode) spendActions(staunchActions, actionName);
      return [{ entryId: selectedTarget.id, name: selectedTarget.name, dcLabel: `DC ${effectiveDc}`, degree: rawDegree }];
    }

    const effectiveDegree = (canMortalHeal && mortalChecked && rawDegree === 'success')
      ? 'criticalSuccess'
      : rawDegree;
    const godlessApplies = targetGodless
      && (effectiveDegree === 'success' || effectiveDegree === 'criticalSuccess');

    if (encounterMode && actionCost > 0) spendActions(actionCost, actionName);

    if (effectiveDegree === 'failure') {
      // Nothing to enter — the whole confirm sequence fires here.
      applyTreatWounds({
        healer: { id: healer.id, name: healer.name },
        target,
        dc: selectedDc,
        degree: 'failure',
        amount: 0,
        actionName,
        nowSecs,
        getState,
        sendUpdate,
        appendLog,
      });
    } else {
      setResolved({ degree: effectiveDegree, dc: selectedDc, target, godlessApplies, nowSecs });
    }

    return [{ entryId: selectedTarget.id, name: selectedTarget.name, dcLabel: `DC ${selectedDc}`, degree: effectiveDegree }];
  };

  const handleFinish = (amounts) => {
    if (!resolved) return;
    const parsed = parseInt(amounts.heal, 10);
    const entered = Number.isNaN(parsed) ? 0 : parsed;
    const amount = resolved.degree === 'criticalFailure'
      ? entered
      : entered + (resolved.godlessApplies ? GODLESS_HEALING_BONUS : 0);
    applyTreatWounds({
      healer: { id: healer.id, name: healer.name },
      target: resolved.target,
      dc: resolved.dc,
      degree: resolved.degree,
      amount,
      actionName,
      nowSecs: resolved.nowSecs,
      getState,
      sendUpdate,
      appendLog,
    });
  };

  if (!isOpen || !healer) return null;

  const isCritFailAmount = resolved?.degree === 'criticalFailure';
  const hint = resolved ? healHint(resolved.dc, resolved.degree) : null;
  // healHint's critical-failure string ("1d8 damage") is display prose, not a
  // rollable expression — the dice part itself is the plain "1d8" the old
  // FoundryDiceInput `formula` override used.
  const dice = isCritFailAmount ? '1d8' : hint;
  const damageParts = (resolved && hint)
    ? [{ key: 'heal', dice, type: isCritFailAmount ? 'damage' : undefined }]
    : null;

  const costLabel = staunch
    ? `${staunchActions} action${staunchActions > 1 ? 's' : ''}`
    : (mode === 'battle-medicine' ? '1 action' : '10 minutes');

  const commitLabel = staunch
    ? `${actionName}${encounterMode ? ` (${staunchActions} act)` : ''}`
    : `${actionName}${actionCost > 0 ? ` (${actionCost} act)` : ''}`;

  const editPanel = (
    <>
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
              onClick={() => {
                setSelectedTargetId((prev) => (prev === c.id ? null : c.id));
                setMortalChecked(false);
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      </section>

      {staunch && (
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
      )}

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
                onClick={() => setSelectedDc(dc)}
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

      {/* Mortal Healing (#224) — pre-declared: applied inside onCommit if the
          check turns out to be a success. */}
      {canMortalHeal && (
        <label className="tw-feat-toggle">
          <input
            type="checkbox"
            checked={mortalChecked}
            onChange={(e) => setMortalChecked(e.target.checked)}
          />
          <span>
            <strong>Mortal Healing:</strong> if this check is a success, upgrade it to a
            critical success (target hasn&apos;t regained HP from divine magic in 24h).
          </span>
        </label>
      )}

      {staunch && selectedTarget && (
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
        </section>
      )}
    </>
  );

  return (
    <RollSheet
      isOpen={isOpen}
      onClose={onClose}
      title={actionName}
      themeColor={themeColor}

      summaryLine={`${selectedTarget?.name ?? 'No target'} · ${costLabel} · Medicine ${formatModifier(medicineModifier)}`}
      blockLine={blockLine}
      editPanel={editPanel}
      editStatusLine={!blockLine ? 'Target, DC and options set — roll when ready.' : ''}

      hasD20
      charId={healer?.id}
      flavor={`${actionName} (Medicine)`}
      bonus={medicineModifier}
      bonusLabel="Medicine"
      dcLine={selectedDc != null ? `nothing rolled yet · DC ${selectedDc}` : 'nothing rolled yet'}
      commitLabel={commitLabel}

      onCommit={handleCommit}

      damageParts={damageParts}
      amountDegrees={AMOUNT_DEGREES}
      amountHeading={isCritFailAmount ? `Damage dealt · ${dice || ''}` : `HP healed · ${hint || ''}`}
      amountExtras={resolved?.godlessApplies ? (
        <p className="tw-feat-note">
          <strong>Godless Healing:</strong> +{GODLESS_HEALING_BONUS} HP (healing-only) applied
          on top of the rolled total.
        </p>
      ) : null}
      ctaLabel={isCritFailAmount ? 'Roll damage' : 'Roll healing'}
      finishLabel={isCritFailAmount ? 'Apply damage' : `Heal ${resolved?.target?.name || ''}`}
      onFinish={handleFinish}

      costLabel={costLabel}
    />
  );
};

export default TreatWoundsModal;
