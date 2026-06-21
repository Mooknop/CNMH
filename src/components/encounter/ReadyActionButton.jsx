// src/components/encounter/ReadyActionButton.jsx
// On-turn declare surface for the Ready activity (#501). A PC spends 2 actions to
// ready an action with a free-text trigger; it's stored in cnmh_readied_<charId>
// and armed off-turn by the encounter stage (useReactionOptions → ArmedReactionBar).
// Only one readied action at a time (it consumes the single reaction when it fires).
import React, { useState } from 'react';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState, defaultTurnState } from '../../hooks/useTurnState';
import { useReadiedAction } from '../../hooks/useReadiedAction';
import { isCharTurn } from '../../utils/encounterUtils';
import './ReadyActionButton.css';

const READY_COST = 2;

const ReadyActionButton = ({ charId, characterName }) => {
  const { encounter, appendLog } = useEncounter();
  const { turnState, spendActions } = useTurnState(charId);
  const { readied, declare, clear } = useReadiedAction(charId);

  const [open, setOpen] = useState(false);
  const [actionName, setActionName] = useState('');
  const [trigger, setTrigger] = useState('');

  // Only meaningful on this PC's own turn in an active fight.
  if (!encounter?.active || encounter.phase !== 'in-progress' || !isCharTurn(encounter, charId)) {
    return null;
  }

  const { actionsSpent } = turnState || defaultTurnState();
  const actionsLeft = Math.max(0, 3 - actionsSpent);
  const canAfford = actionsLeft >= READY_COST;

  // Already readied this turn — show the standing declaration with an undo.
  if (readied) {
    return (
      <div className="ready-action ready-action--set" role="status">
        <span className="ready-action-tag">Readied</span>
        <span className="ready-action-summary">
          <strong>{readied.actionName}</strong>
          {readied.trigger ? ` — ${readied.trigger}` : ''}
        </span>
        <button
          type="button"
          className="btn-text ready-action-cancel"
          onClick={() => {
            appendLog({ type: 'system', text: `${characterName} cancels their readied action` });
            clear();
          }}
          aria-label="Cancel readied action"
        >
          Cancel
        </button>
      </div>
    );
  }

  const reset = () => {
    setOpen(false);
    setActionName('');
    setTrigger('');
  };

  const handleConfirm = () => {
    const name = actionName.trim();
    if (!name || !canAfford) return;
    spendActions(READY_COST, 'Ready an Action');
    declare({ actionName: name, trigger, round: encounter.round });
    appendLog({
      type: 'action',
      charId,
      text: `${characterName} readies ${name}${trigger.trim() ? ` (trigger: ${trigger.trim()})` : ''}`,
    });
    reset();
  };

  if (!open) {
    return (
      <div className="ready-action">
        <button
          type="button"
          className="btn-secondary ready-action-open"
          onClick={() => setOpen(true)}
          disabled={!canAfford}
          title={canAfford ? undefined : 'Ready costs 2 actions'}
          aria-label="Ready an action"
        >
          ↩ Ready an action <span className="ready-action-cost">(2 actions)</span>
        </button>
      </div>
    );
  }

  return (
    <div className="ready-action ready-action--form">
      <label className="ready-action-field">
        <span>Action to ready</span>
        <input
          type="text"
          value={actionName}
          onChange={(e) => setActionName(e.target.value)}
          placeholder="e.g. Strike, Raise a Shield"
          aria-label="Action to ready"
          autoFocus
        />
      </label>
      <label className="ready-action-field">
        <span>Trigger</span>
        <input
          type="text"
          value={trigger}
          onChange={(e) => setTrigger(e.target.value)}
          placeholder="e.g. when an enemy enters my reach"
          aria-label="Trigger"
        />
      </label>
      <div className="ready-action-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={handleConfirm}
          disabled={!actionName.trim() || !canAfford}
          aria-label="Confirm ready"
        >
          Ready (2 actions)
        </button>
        <button type="button" className="btn-text" onClick={reset} aria-label="Dismiss ready form">
          Cancel
        </button>
      </div>
    </div>
  );
};

export default ReadyActionButton;
