import React, { useState } from 'react';
import Modal from '../shared/Modal';
import { useSession } from '../../contexts/SessionContext';
import { useContent } from '../../contexts/ContentContext';
import { useGameDate } from '../../contexts/GameDateContext';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';
import { useSessionLog } from '../../hooks/useSessionLog';
import { useSyncedState } from '../../hooks/useSyncedState';
import { toGameSeconds } from '../../utils/gameTime';
import {
  consumableMeta,
  consumableVerb,
  hasGodlessHealing,
  applyHealing,
  applyHealingConsumable,
  applyEffectConsumable,
} from '../../utils/consumables';
import './UseConsumableModal.css';

/**
 * Confirmation modal for using a consumable item (#217).
 *
 * Consumption never edits the GM-gated inventory: it increments the
 * player-writable `cnmh_consumed_<charId>` overlay (the same mechanism
 * scrolls use), and InventoryTab hides items whose remaining count is 0.
 *
 * @param {boolean} isOpen
 * @param {Function} onClose
 * @param {Object}  item       - resolved inventory item (quantity already consumed-adjusted)
 * @param {Object}  character  - raw character object (the user)
 * @param {string}  themeColor
 * @param {number}  actionCost - actions to spend in encounter (#428): the drink/apply
 *                  plus any draw/retrieve to get it in hand. Defaults to 1.
 * @param {string}  defaultTargetId - charId of a focused ally to administer a *healing*
 *                  consumable to (#434); defaults to self. Reach is gated upstream (the
 *                  tile disables out-of-reach), so the recipient here is already valid.
 */
const UseConsumableModal = ({ isOpen, onClose, item, character, themeColor, actionCost = 1, defaultTargetId = null }) => {
  const { getState, sendUpdate } = useSession();
  const { effects: effectCatalog, characters } = useContent();
  const { gameDate, time } = useGameDate();
  const { encounter, appendLog } = useEncounter();
  const { appendEvent } = useSessionLog();
  const { spendActions } = useTurnState(character?.id || 'nobody');
  const [, setConsumed] = useSyncedState(`cnmh_consumed_${character?.id}`, {});

  const [amountInput, setAmountInput] = useState('');

  if (!isOpen || !item || !character) return null;

  const meta = consumableMeta(item);
  if (!meta) return null;

  const verb = consumableVerb(item);
  const encounterMode = !!(encounter?.active && encounter.phase === 'in-progress');
  const remaining = item.quantity ?? 1;

  // Administer to a focused ally (#434) — only for *healing* consumables; effect
  // potions stay self-use even with an ally focused. Reach was validated by the
  // tile gate (#430). `ally` is the recipient's character model (for maxHp clamp
  // + their Godless Healing); falls back to self when there's no ally target.
  const ally = (defaultTargetId && meta.kind === 'healing' && defaultTargetId !== character.id)
    ? (characters || []).find((c) => c.id === defaultTargetId)
    : null;
  const recipient = ally
    ? { id: ally.id, name: ally.name, maxHp: ally.maxHp }
    : { id: character.id, name: character.name, maxHp: character.maxHp };

  const catalogEffect = meta.kind === 'effect'
    ? (effectCatalog || []).find((e) => e.id === meta.effectId)
    : null;
  const durationLabel = meta.durationMinutes
    ? `${meta.durationMinutes} minute${meta.durationMinutes === 1 ? '' : 's'}`
    : 'until removed';

  const amount = parseInt(amountInput, 10);
  const hasAmount = !isNaN(amount) && amount > 0;
  const confirmEnabled = remaining > 0 && (meta.kind !== 'healing' || hasAmount);

  // In-encounter log lines go to the combat log; otherwise to the session log.
  const log = encounter?.active
    ? appendLog
    : ({ type, text }) => appendEvent({ type, text });

  const handleConfirm = () => {
    if (!confirmEnabled) return;
    setConsumed((cur) => ({
      ...(cur || {}),
      [item.name]: ((cur || {})[item.name] || 0) + 1,
    }));

    const user = { id: character.id, name: character.name, maxHp: character.maxHp };
    if (meta.kind === 'healing') {
      if (ally) {
        // Administering to a focused ally: heal the ally, log it as administered.
        applyHealing({
          target: recipient,
          amount,
          getState,
          sendUpdate,
          appendLog: log,
          logText: `${character.name} administered ${item.name} to ${recipient.name} — healed ${amount} HP`,
        });
      } else {
        applyHealingConsumable({
          user, itemName: item.name, amount, getState, sendUpdate, appendLog: log,
        });
      }
    } else {
      applyEffectConsumable({
        user,
        itemName: item.name,
        meta,
        nowSecs: toGameSeconds({ ...gameDate, ...time }),
        getState,
        sendUpdate,
        appendLog: log,
      });
    }

    if (encounterMode && actionCost > 0) {
      // A worn/stowed item costs extra to get in hand first (#428).
      if (actionCost > 1) {
        log({
          type: 'action',
          text: `${character.name} ${actionCost >= 3 ? 'retrieved' : 'drew'} ${item.name}`,
        });
      }
      spendActions(actionCost, `${verb} ${item.name}`);
    }
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={ally ? `${verb} ${item.name} → ${ally.name}` : `${verb} ${item.name}`}
      themeColor={themeColor}
      maxWidth="420px"
      placement="bottom"
      highZ
    >
      <section className="ct-section">
        <div className="ucm-summary">
          <span className="ucm-remaining" aria-label="remaining count">
            ×{remaining} remaining
          </span>
          {meta.note && <span className="ucm-note">{meta.note}</span>}
        </div>
      </section>

      {meta.kind === 'healing' && (
        <>
          <hr className="ct-divider" />
          <section className="ct-section">
            <h3 className="ct-section-title">HP Healed</h3>
            <div className="trr-entry-row">
              <input
                type="number"
                className="trr-roll-input"
                placeholder="total"
                aria-label="hp healed"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
              />
              <span className="ucm-roll-hint">roll your dice, enter the total</span>
            </div>
            {hasGodlessHealing(ally || character) && (
              <p className="ucm-godless-hint">
                <strong>Godless Healing:</strong> +2 HP from healing-only effects —
                add it to {ally ? `${ally.name}'s` : 'your'} total.
              </p>
            )}
          </section>
        </>
      )}

      {meta.kind === 'effect' && (
        <>
          <hr className="ct-divider" />
          <section className="ct-section">
            <h3 className="ct-section-title">Effect</h3>
            <p className="ucm-effect-name">
              {catalogEffect?.name || meta.effectId}
              <span className="ucm-effect-duration"> · {durationLabel}</span>
            </p>
            {catalogEffect?.description && (
              <p className="ucm-effect-description">{catalogEffect.description}</p>
            )}
          </section>
        </>
      )}

      <div className="ucm-footer">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button
          className="btn-primary"
          onClick={handleConfirm}
          disabled={!confirmEnabled}
        >
          {verb}{encounterMode && actionCost > 0 ? ` (${actionCost} act)` : ''}
        </button>
      </div>
    </Modal>
  );
};

export default UseConsumableModal;
