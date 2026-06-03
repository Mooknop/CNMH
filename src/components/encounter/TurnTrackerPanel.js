import React, { useState, useRef, useEffect } from 'react';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState, defaultTurnState } from '../../hooks/useTurnState';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useShield } from '../../hooks/useShield';
import { useSession } from '../../contexts/SessionContext';
import { nextTurnIndex } from '../../utils/encounterUtils';
import MoveGridPicker from './MoveGridPicker';
import BestiaryModal from './BestiaryModal';
import './TurnTrackerPanel.css';

// PF2e movement actions the player can pick before requesting reachable squares.
const MOVE_ACTIONS = [
  { type: 'step',   label: 'Step',   cost: 1 },
  { type: 'stride', label: 'Stride', cost: 1 },
];

const RESET_STATE = {
  actionsSpent: 0,
  reactionAvailable: true,
  reactionSpent: false,
  hasStartedFirstTurn: true,
  actionsLog: [],
};

const writeLocal = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch { /* noop */ }
};

const ActionPip = ({ filled }) => (
  <span className={`ttp-pip${filled ? ' ttp-pip--filled' : ''}`} aria-hidden="true" />
);

const ReactionIcon = ({ state }) => {
  const labels = {
    unavailable: 'Reaction (unavailable until your first turn)',
    available: 'Reaction (available)',
    spent: 'Reaction (spent)',
  };
  return (
    <span
      className={`ttp-reaction ttp-reaction--${state}`}
      title={labels[state]}
      aria-label={labels[state]}
    >
      ↩
    </span>
  );
};

const TurnTrackerPanel = ({ charId, characterName, inventory = [] }) => {
  const { encounter, advanceTurn, appendLog } = useEncounter();
  const { turnState, spendActions, spendReaction, resetForNewTurn } = useTurnState(charId);
  const { sendUpdate } = useSession();

  // Raise a Shield / Shield Block (Slices 1 + 4).
  const { heldShield, raised, broken, raiseShield, lowerShield, applyBlock } =
    useShield(charId, inventory);
  // Shield Block damage input — player enters the incoming hit; '' hides the bar.
  const [blockDamage, setBlockDamage] = useState('');

  // ── Bestiary ──────────────────────────────────────────────────────────────
  const [bestiaryOpen, setBestiaryOpen] = useState(false);

  // ── Flanking (Slice 3) ───────────────────────────────────────────────────
  // Bridge pushes { [enemyEntryId]: { byCharIds:[...] } } whenever tokens move or
  // turns advance. We read it here so the order strip can show the flanked badge.
  const [flankedMap] = useSyncedState('cnmh_flanked_global', {});

  // ── Movement (Feature 3) ──────────────────────────────────────────────────
  // moveStage: null | 'choosing' | 'awaiting-opts' | 'picking' | 'awaiting-done'
  const [moveStage, setMoveStage]       = useState(null);
  const [pendingMoveType, setPendingMoveType] = useState(null);
  const [pickerOpts, setPickerOpts]     = useState(null);
  const moveSessionTs = useRef(null);
  // Bridge responses arrive as cnmh_* keys via the relay.
  const [moveOpts] = useSyncedState(`cnmh_moveopts_${charId}`, null);
  const [moveDone] = useSyncedState(`cnmh_movedone_${charId}`, null);

  // Reachable squares arrived → open the picker (only for the request we made).
  useEffect(() => {
    if (moveStage === 'awaiting-opts' && moveOpts && moveOpts.reqTs === moveSessionTs.current) {
      setPickerOpts(moveOpts);
      setMoveStage('picking');
    }
  }, [moveOpts, moveStage]);

  // Move completed in Foundry → log it and close.
  useEffect(() => {
    if (moveStage === 'awaiting-done' && moveDone && moveDone.reqTs === moveSessionTs.current) {
      appendLog({ type: 'action', charId, text: `${characterName} moved ${moveDone.feetMoved} ft` });
      setMoveStage(null);
      setPickerOpts(null);
      setPendingMoveType(null);
    }
  }, [moveDone, moveStage, appendLog, charId, characterName]);

  const requestMove = (moveType) => {
    const ts = Date.now();
    moveSessionTs.current = ts;
    setPendingMoveType(moveType);
    setMoveStage('awaiting-opts');
    sendUpdate(charId, 'movereq', { moveType, ts });
  };

  const confirmMove = (destination) => {
    const action = MOVE_ACTIONS.find((a) => a.type === pendingMoveType);
    const cost = action?.cost ?? 1;
    sendUpdate(charId, 'moveconfirm', {
      destination,
      moveType: pendingMoveType,
      actionCost: cost,
      ts: moveSessionTs.current,
    });
    spendActions(cost, action?.label || 'Move');
    setMoveStage('awaiting-done');
  };

  const cancelMove = () => {
    setMoveStage(null);
    setPickerOpts(null);
    setPendingMoveType(null);
  };

  // ── Turn identity (computed before the early return so the self-reset effect
  // can use it without violating the Rules of Hooks) ────────────────────────
  const order = encounter?.order || [];
  const currentTurnIndex = encounter?.currentTurnIndex ?? 0;
  const currentEntry = order[currentTurnIndex] || null;
  const isMyTurn =
    !!currentEntry &&
    currentEntry.kind === 'pc' &&
    currentEntry.charId === charId;
  const phase = encounter?.phase;
  const turnToken = `${encounter?.round ?? 0}:${currentTurnIndex}`;

  // Reset my own turnstate when my turn begins. This is the authoritative reset
  // path — relying on the previous actor to reset the "next" PC is unreliable
  // once Foundry interleaves enemy turns (a PC after an enemy would never get
  // reset, leaving stale actionsSpent that disables their Submit Turn button).
  // Comparing against the *persisted* token (not a ref) means remounting the
  // panel mid-turn won't wipe actions already spent this turn.
  useEffect(() => {
    if (phase !== 'in-progress') return;
    if (isMyTurn && turnState?.turnToken !== turnToken) {
      resetForNewTurn(turnToken);
      // "Until the start of your next turn" — a raised shield expires now.
      // Gated on the persisted turn token (not a ref) so remounting mid-turn
      // never drops a shield the player raised this turn.
      if (raised) lowerShield();
    }
  }, [isMyTurn, turnToken, phase, turnState, resetForNewTurn, raised, lowerShield]);

  if (!encounter || encounter.phase === 'idle') return null;

  const { actionsSpent, reactionAvailable, reactionSpent, hasStartedFirstTurn } =
    turnState || defaultTurnState();

  const canSubmit = isMyTurn && actionsSpent <= 3;

  const handleSubmit = () => {
    if (!canSubmit) return;

    cancelMove(); // close any open move UI when the turn ends

    // Determine next actor BEFORE advancing so we can reset their state.
    const { currentTurnIndex: nextIdx } = nextTurnIndex(
      order,
      encounter.currentTurnIndex || 0,
      encounter.round || 1
    );
    const nextEntry = order[nextIdx] || null;

    appendLog({
      type: 'action',
      charId,
      text: `${characterName} submitted their turn`,
    });

    if (encounter.foundryCombatId) {
      sendUpdate('global', 'turncmd', { action: 'next-turn', ts: Date.now() });
    } else {
      advanceTurn();
    }

    if (nextEntry && nextEntry.kind === 'pc') {
      const key = `cnmh_turnstate_${nextEntry.charId}`;
      writeLocal(key, RESET_STATE);
      sendUpdate(nextEntry.charId, 'turnstate', RESET_STATE);
    }
  };

  const handleRaiseShield = () => {
    if (!heldShield || broken) return;
    raiseShield(heldShield.uid);
    spendActions(1, 'Raise a Shield');
    appendLog({ type: 'action', charId, text: `${characterName} raised a shield` });
  };

  const handleLowerShield = () => {
    lowerShield();
    appendLog({ type: 'action', charId, text: `${characterName} lowered their shield` });
  };

  // Shield Block (Slice 4) — reaction, available on any in-progress turn while
  // the shield is raised and the reaction hasn't been spent yet.
  const canShieldBlock =
    raised && !broken && hasStartedFirstTurn && reactionAvailable && !reactionSpent;

  const handleShieldBlock = () => {
    const dealt = parseInt(blockDamage, 10);
    if (!canShieldBlock || isNaN(dealt) || dealt < 0) return;
    const result = applyBlock(dealt);
    if (!result) return;
    spendReaction('Shield Block');
    setBlockDamage('');
    if (result.broken) lowerShield();
    const detail = result.broken
      ? `shield broke! (${result.prevented} prevented)`
      : `${result.prevented} prevented, shield → ${result.shieldHpAfter} HP`;
    appendLog({ type: 'action', charId, text: `${characterName} Shield Blocked: ${detail}` });
  };

  const reactionState = !hasStartedFirstTurn
    ? 'unavailable'
    : reactionSpent
    ? 'spent'
    : reactionAvailable
    ? 'available'
    : 'unavailable';

  const isSetup = encounter.phase === 'setup';
  const isInProgress = encounter.phase === 'in-progress';
  const enemies = order.filter((e) => e.kind === 'enemy');

  return (
    <div className="ttp-panel" role="region" aria-label="Encounter tracker">
      {/* Initiative order strip */}
      <div className="ttp-order" aria-label="Initiative order">
        {order.map((entry, idx) => {
          const isCurrent = isInProgress && idx === encounter.currentTurnIndex;
          return (
            <div
              key={entry.entryId}
              className={[
                'ttp-entry',
                isCurrent ? 'ttp-entry--current' : '',
                entry.kind === 'enemy' ? 'ttp-entry--enemy' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-current={isCurrent ? 'true' : undefined}
            >
              <span className="ttp-entry-name">{entry.name}</span>
              {entry.kind === 'enemy' && flankedMap?.[entry.entryId] && (
                <span className="ttp-flanked-badge" aria-label={`${entry.name} is flanked`} title="Flanked">⚔</span>
              )}
              <span className="ttp-entry-init">
                {entry.initiative !== null && entry.initiative !== undefined
                  ? entry.initiative
                  : '?'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Round + current actor */}
      {isInProgress && (
        <div className="ttp-status">
          <span className="ttp-round">Round {encounter.round}</span>
          {currentEntry && (
            <span className="ttp-current-actor">
              {currentEntry.kind === 'enemy'
                ? `Enemy: ${currentEntry.name}'s turn`
                : `${currentEntry.name}'s turn`}
            </span>
          )}
        </div>
      )}

      {isSetup && (
        <div className="ttp-status ttp-status--setup">
          Waiting for all players to enter initiative…
        </div>
      )}

      {/* Local character controls — only on their turn, only for PCs */}
      {isInProgress && isMyTurn && (
        <div className="ttp-controls" role="group" aria-label="Turn controls">
          <div className="ttp-pips" aria-label="Actions spent">
            {[1, 2, 3].map((n) => (
              <ActionPip key={n} filled={n <= actionsSpent} />
            ))}
            {actionsSpent > 3 && (
              <span className="ttp-over-budget" aria-label="Over action budget">
                +{actionsSpent - 3}
              </span>
            )}
          </div>

          <ReactionIcon state={reactionState} />

          {moveStage === null && (
            <button
              className="btn-secondary ttp-move"
              onClick={() => setMoveStage('choosing')}
              aria-label="Move"
            >
              Move
            </button>
          )}

          {heldShield && !raised && (
            <button
              className="btn-secondary ttp-shield"
              onClick={handleRaiseShield}
              disabled={broken}
              title={broken
                ? 'Shield is broken — no bonus until repaired'
                : `Raise ${heldShield.name || 'shield'} (+${heldShield.shield?.bonus ?? 0} AC)`}
              aria-label="Raise a Shield"
            >
              🛡 Raise{broken ? ' (Broken)' : ''}
            </button>
          )}

          {heldShield && raised && (
            <button
              className="btn-secondary ttp-shield ttp-shield--raised"
              onClick={handleLowerShield}
              aria-label="Lower Shield"
            >
              🛡 Lower
            </button>
          )}

          <button
            className="btn-primary ttp-submit"
            onClick={handleSubmit}
            disabled={!canSubmit}
            aria-label="Submit turn"
          >
            Submit Turn
          </button>
        </div>
      )}

      {/* Shield Block reaction (Slice 4) — visible any in-progress turn while raised */}
      {isInProgress && heldShield && raised && (
        <div className="ttp-shieldblock-bar">
          <input
            type="number"
            min="0"
            className="ttp-shieldblock-input"
            placeholder="Damage taken"
            aria-label="Shield Block damage"
            value={blockDamage}
            onChange={(e) => setBlockDamage(e.target.value)}
          />
          <button
            className="btn-secondary ttp-shieldblock"
            onClick={handleShieldBlock}
            disabled={!canShieldBlock || blockDamage === '' || parseInt(blockDamage, 10) < 0}
            aria-label="Shield Block"
            title={
              !canShieldBlock
                ? (reactionSpent ? 'Reaction already spent' : 'Reaction not yet available')
                : 'Block this damage with your shield (reaction)'
            }
          >
            🛡 Block ↩
          </button>
        </div>
      )}

      {/* Movement sub-UI */}
      {isInProgress && isMyTurn && moveStage === 'choosing' && (
        <div className="ttp-move-choose" role="group" aria-label="Choose move action">
          {MOVE_ACTIONS.map((a) => (
            <button
              key={a.type}
              className="btn-secondary"
              onClick={() => requestMove(a.type)}
              aria-label={`move-${a.type}`}
            >
              {a.label} <span className="ttp-move-cost">({a.cost})</span>
            </button>
          ))}
          <button className="btn-text" onClick={cancelMove} aria-label="cancel-move">
            Cancel
          </button>
        </div>
      )}

      {isInProgress && isMyTurn && moveStage === 'awaiting-opts' && (
        <div className="ttp-move-status">Calculating reachable squares…</div>
      )}

      {isInProgress && isMyTurn && moveStage === 'picking' && pickerOpts && (
        <MoveGridPicker
          origin={pickerOpts.origin}
          reachable={pickerOpts.reachable}
          blocked={pickerOpts.blocked}
          maxFeet={pickerOpts.maxFeet}
          onSelect={confirmMove}
          onCancel={cancelMove}
        />
      )}

      {isInProgress && isMyTurn && moveStage === 'awaiting-done' && (
        <div className="ttp-move-status">Moving…</div>
      )}

      {enemies.length > 0 && (
        <button
          className="btn-secondary ttp-bestiary"
          onClick={() => setBestiaryOpen(true)}
          aria-label="Open Bestiary"
        >
          Bestiary
        </button>
      )}

      {bestiaryOpen && (
        <BestiaryModal
          isOpen
          onClose={() => setBestiaryOpen(false)}
          enemies={enemies}
          actingCharId={charId}
          actingCharName={characterName}
        />
      )}
    </div>
  );
};

export default TurnTrackerPanel;
