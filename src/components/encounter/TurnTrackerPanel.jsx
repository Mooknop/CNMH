import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState, defaultTurnState } from '../../hooks/useTurnState';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useShield } from '../../hooks/useShield';
import { useAura } from '../../hooks/useAura';
import { useOmen } from '../../hooks/useOmen';
import { useSustains } from '../../hooks/useSustains';
import { useSession } from '../../contexts/SessionContext';
import { useTokenMovement } from '../../hooks/useTokenMovement';
import { nextTurnIndex } from '../../utils/encounterUtils';
import { getFreeActions } from '../../utils/actionUtils';
import MoveGridPicker from './MoveGridPicker';
import BestiaryModal from './BestiaryModal';
import ShieldBlockBar from './ShieldBlockBar';
import PersistentChip from './PersistentChip';
import AuraChip from './AuraChip';
import OmenChip from './OmenChip';
import StanceChip from './StanceChip';
import HuntPreyBadge from './HuntPreyBadge';
import EnemyConditionBadge from './EnemyConditionBadge';
import './TurnTrackerPanel.css';

const formatCombatTime = (secs) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

// PF2e movement actions the player can pick before requesting reachable squares.
const MOVE_ACTIONS = [
  { type: 'step',   label: 'Step',   cost: 1 },
  { type: 'stride', label: 'Stride', cost: 1 },
];

// Derived from defaultTurnState so new fields (attacksMade, …) can't drift.
const RESET_STATE = {
  ...defaultTurnState(),
  reactionAvailable: true,
  hasStartedFirstTurn: true,
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

const TurnTrackerPanel = ({ charId, characterName, inventory = [], character = null }) => {
  const { encounter, advanceTurn, appendLog } = useEncounter();
  const { turnState, spendActions, resetForNewTurn } = useTurnState(charId);
  const { sendUpdate } = useSession();

  // Turn-start free-action offers (#228 — Primary Threat). Authored as
  // `offerAt: { round? }` on a free action; offered on the actor's turn while
  // the round matches. Handled state is keyed by turn token so a remount
  // mid-turn doesn't re-offer something already used or dismissed.
  const [offersHandled, setOffersHandled] = useState({});

  // Raise a Shield (Slice 1); the Shield Block bar is its own component now.
  const { heldShield, raised, broken, raiseShield, lowerShield } =
    useShield(charId, inventory);

  // Kinetic aura (#228) — Dismiss is one of the three ways the aura ends.
  // Unlike a raised shield it persists across turns, so no turn-start reset.
  const { active: auraActive, deactivate: deactivateAura } = useAura(charId);

  // Harrow omen (#227) — a failed Harrow Cast flat check flags the omen for
  // loss at the END of the turn; submitting the turn is that boundary.
  const omen = useOmen(charId);

  // Sustained spells (#220) — Bless, Mirror Image, Summon Undead, … prompt the
  // caster to Sustain a Spell (1 action) at the start of each of their turns.
  // `lastSustainedRound` on each entry tracks whether it's been kept alive this
  // round; forgetting (submitting without sustaining) lapses it.
  const { sustains, sustain: doSustain, end: endSustain } = useSustains(charId);

  // ── Bestiary ──────────────────────────────────────────────────────────────
  const [bestiaryOpen, setBestiaryOpen] = useState(false);

  // ── Flanking (Slice 3) ───────────────────────────────────────────────────
  // Bridge pushes { [enemyEntryId]: { byCharIds:[...] } } whenever tokens move or
  // turns advance. We read it here so the order strip can show the flanked badge.
  const [flankedMap] = useSyncedState('cnmh_flanked_global', {});

  // ── Combat clock ─────────────────────────────────────────────────────────
  // Elapsed seconds accrued by useEncounterClock (running in EncounterClockSync).
  // Read-only here — writing is gated to the GM in the hook.
  const [combatSecs] = useSyncedState('cnmh_combatsecs_global', 0);

  // ── Movement (Feature 3) — 8-direction stepper ─────────────────────────────
  // isChoosingMove: local-only Step/Stride selection UI.
  // feetThisAction: feet walked under the current Stride action. A Stride covers
  // up to the character's Speed for 1 action; crossing each Speed increment
  // charges another action. A Step is its own dedicated single 5-ft action.
  const [isChoosingMove, setIsChoosingMove] = useState(false);
  const [feetThisAction, setFeetThisAction] = useState(0);

  // requestMoveRefresh / cancelMove are returned by the hook below but are
  // referenced inside onMoveDone (which the hook needs as input) — bridge them
  // through refs to break the cycle. moveTypeRef/speedRef likewise carry the
  // live move type and Speed into the callback without stale closures.
  const requestMoveRefreshRef = useRef(null);
  const cancelMoveRef = useRef(null);
  const moveTypeRef = useRef(null);
  const speedRef = useRef(0);

  const handleMoveDone = useCallback((done) => {
    const stepFeet = done?.feetMoved ?? 5;
    appendLog({ type: 'action', charId, text: `${characterName} moved ${stepFeet} ft` });

    if (moveTypeRef.current === 'step') {
      // A Step is a single dedicated action: one 5-ft move, then close the pad.
      spendActions(1, 'Step');
      cancelMoveRef.current?.();
      return;
    }

    // Stride: charge the 1st action on the 1st step, and one more each time the
    // running distance would cross the character's Speed.
    const speed = speedRef.current || stepFeet;
    const needNewAction = feetThisAction === 0 || feetThisAction + stepFeet > speed;
    if (needNewAction) {
      spendActions(1, 'Stride');
      setFeetThisAction(stepFeet);
    } else {
      setFeetThisAction(feetThisAction + stepFeet);
    }
    requestMoveRefreshRef.current?.('stride'); // keep the pad open to chain steps
  }, [feetThisAction, spendActions, appendLog, charId, characterName]);

  const {
    stage: moveStage,
    pickerOpts,
    pendingMoveType,
    requestMove: rawRequestMove,
    requestMoveRefresh,
    confirmMove: rawConfirmMove,
    cancelMove: rawCancelMove,
  } = useTokenMovement(charId, { onMoveDone: handleMoveDone });

  requestMoveRefreshRef.current = requestMoveRefresh;
  cancelMoveRef.current = rawCancelMove;
  speedRef.current = pickerOpts?.speed || speedRef.current;

  const requestMove = (moveType) => {
    setIsChoosingMove(false);
    moveTypeRef.current = moveType;
    if (moveType === 'stride') setFeetThisAction(0);
    rawRequestMove(moveType);
  };

  const cancelMove = () => {
    setIsChoosingMove(false);
    setFeetThisAction(0);
    rawCancelMove();
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
      setFeetThisAction(0); // distance budget is per-turn
      // "Until the start of your next turn" — a raised shield expires now.
      // Gated on the persisted turn token (not a ref) so remounting mid-turn
      // never drops a shield the player raised this turn.
      if (raised) lowerShield();
    }
  }, [isMyTurn, turnToken, phase, turnState, resetForNewTurn, raised, lowerShield]);

  if (!encounter || encounter.phase === 'idle') return null;

  const { actionsSpent, reactionAvailable, reactionSpent, hasStartedFirstTurn } =
    turnState || defaultTurnState();
  const attacksMade = turnState?.attacksMade ?? 0;
  const mapPenalty = Math.min(attacksMade, 2) * 5;

  const canSubmit = isMyTurn && actionsSpent <= 3;

  const handleSubmit = () => {
    if (!canSubmit) return;

    cancelMove(); // close any open move UI when the turn ends

    // A failed Harrow Cast flat check loses the omen at end of turn (#227).
    if (omen.pendingLoss && omen.suit) {
      appendLog({
        type: 'system',
        text: `${characterName}'s harrow omen (${omen.suit}) is lost (failed Harrow Cast flat check)`,
      });
      omen.clear();
    }

    // Sustained spells not sustained this round lapse when the turn ends (#220).
    sustains.forEach((s) => {
      if (s.lastSustainedRound !== encounter.round) {
        appendLog({ type: 'system', text: `${s.spellName} ends (not sustained)` });
        endSustain(s.id);
      }
    });

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

  // Dismiss is a 1-action concentrate activity in combat.
  const handleDismissAura = () => {
    deactivateAura();
    spendActions(1, 'Dismiss');
    appendLog({ type: 'action', charId, text: `${characterName} Dismissed their kinetic aura` });
  };

  // Turn-start free-action offers (#228) — see state above.
  const turnStartOffers = (character ? getFreeActions(character) : []).filter(
    (fa) => fa.offerAt
      && (fa.offerAt.round == null || fa.offerAt.round === (encounter?.round ?? 0))
      && fa.active !== false
      && !offersHandled[`${fa.name}:${turnToken}`]
  );

  const markOfferHandled = (fa) =>
    setOffersHandled((cur) => ({ ...cur, [`${fa.name}:${turnToken}`]: true }));

  const handleUseFreeAction = (fa) => {
    spendActions(0, fa.name);
    appendLog({ type: 'action', charId, text: `${characterName} used ${fa.name} (free action)` });
    if (fa.reminder) {
      appendLog({ type: 'system', text: fa.reminder });
    }
    markOfferHandled(fa);
  };

  // Sustain prompts (#220) — show on the caster's turn for any tracked spell not
  // yet sustained this round (a spell cast this turn already reads as current).
  const pendingSustains = sustains.filter((s) => s.lastSustainedRound !== encounter?.round);

  const handleSustain = (s) => {
    spendActions(1, `Sustain ${s.spellName}`);
    doSustain(s.id, encounter?.round);
    appendLog({ type: 'action', charId, text: `${characterName} sustained ${s.spellName}` });
  };

  const handleEndSustain = (s) => {
    endSustain(s.id);
    appendLog({ type: 'system', text: `${s.spellName} ends` });
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
              {entry.kind === 'enemy' && <HuntPreyBadge enemyEntry={entry} order={order} />}
              {entry.kind === 'enemy' && <EnemyConditionBadge enemyEntry={entry} />}
              {entry.kind === 'pc' && <AuraChip entry={entry} />}
              {entry.kind === 'pc' && <OmenChip entry={entry} />}
              {entry.kind === 'pc' && <StanceChip entry={entry} />}
              <PersistentChip entry={entry} viewerCharId={charId} />
              <span className="ttp-entry-init">
                {entry.initiative !== null && entry.initiative !== undefined
                  ? entry.initiative
                  : '?'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Round + current actor + elapsed time */}
      {isInProgress && (
        <div className="ttp-status">
          <span className="ttp-round">
            Round {encounter.round}
            {combatSecs > 0 && (
              <span className="ttp-elapsed" aria-label={`${combatSecs} seconds elapsed`}>
                {' · '}{formatCombatTime(combatSecs)}
              </span>
            )}
          </span>
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

          {attacksMade > 0 && (
            <span
              className="ttp-map-chip"
              title="Multiple Attack Penalty (−4/−8 with agile weapons)"
              aria-label={`Multiple Attack Penalty −${mapPenalty}`}
            >
              MAP −{mapPenalty}
            </span>
          )}

          {moveStage !== null && pendingMoveType === 'stride' && (
            <span className="ttp-move-dist" aria-label="Stride distance">
              {feetThisAction}/{pickerOpts?.speed ?? speedRef.current} ft
            </span>
          )}

          {moveStage === null && !isChoosingMove && (
            <button
              className="btn-secondary ttp-move"
              onClick={() => setIsChoosingMove(true)}
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

          {auraActive && (
            <button
              className="btn-secondary ttp-aura-dismiss"
              onClick={handleDismissAura}
              title="Dismiss your kinetic aura (1 action)"
              aria-label="Dismiss Aura"
            >
              ◈ Dismiss
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

      {/* Turn-start free-action offers (#228 — Primary Threat on round 1) */}
      {isInProgress && isMyTurn && turnStartOffers.map((fa) => (
        <div key={fa.name} className="ttp-offer" role="group" aria-label={`${fa.name} (free action)`}>
          <span className="ttp-offer-name">
            {fa.name} <span className="ttp-offer-cost">(free action)</span>
          </span>
          <button
            className="btn-secondary ttp-offer-use"
            onClick={() => handleUseFreeAction(fa)}
            title={fa.description || undefined}
            aria-label={`Use ${fa.name}`}
          >
            Use
          </button>
          <button
            className="btn-text"
            onClick={() => markOfferHandled(fa)}
            aria-label={`Dismiss ${fa.name}`}
          >
            Dismiss
          </button>
        </div>
      ))}

      {/* Sustain-a-Spell prompts (#220) — one per tracked sustained spell */}
      {isInProgress && isMyTurn && pendingSustains.map((s) => (
        <div key={s.id} className="ttp-offer ttp-offer--sustain" role="group" aria-label={`Sustain ${s.spellName}`}>
          <span className="ttp-offer-name">
            Sustain {s.spellName} <span className="ttp-offer-cost">(1 action)</span>
          </span>
          <button
            className="btn-secondary ttp-offer-use"
            onClick={() => handleSustain(s)}
            aria-label={`Sustain ${s.spellName}`}
          >
            Sustain
          </button>
          <button
            className="btn-text"
            onClick={() => handleEndSustain(s)}
            aria-label={`End ${s.spellName}`}
          >
            End
          </button>
        </div>
      ))}

      {/* Shield Block reaction — visible any in-progress turn while raised */}
      {isInProgress && (
        <ShieldBlockBar charId={charId} characterName={characterName} inventory={inventory} />
      )}

      {/* Movement sub-UI */}
      {isInProgress && isMyTurn && isChoosingMove && moveStage === null && (
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
          radius={1}
          stepMode
          cancelLabel="Done"
          onSelect={rawConfirmMove}
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
