import React, { useState, useEffect } from 'react';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';
import { minionTurnId, MINION_COMPANION, MINION_FAMILIAR } from '../../utils/minionUtils';
import { isCharTurn } from '../../utils/encounterUtils';
import { useShield } from '../../hooks/useShield';
import { useAura } from '../../hooks/useAura';
import { useSustains } from '../../hooks/useSustains';
import { useSummons } from '../../hooks/useSummons';
import { useReadiedAction } from '../../hooks/useReadiedAction';
import { useSession } from '../../contexts/SessionContext';
import { getFreeActions } from '../../utils/actionUtils';
import { applyHymnTempHp } from '../../utils/hymnHealing';
import { readiedExpireLog } from '../../utils/readiedAction';
import BestiaryModal from './BestiaryModal';
import ShieldBlockBar from './ShieldBlockBar';
import './TurnTrackerPanel.css';
import { RELAY } from '../../sync/keys';

// Residual turn panel (#411, #415): initiative order, round/status, action pips,
// MAP, reaction and End Turn live in the Segmented Deck (InitiativeStrip + DeckHeader);
// movement (Stride/Step) is now a grid tile → MoveActionSheet. What remains here is
// the per-turn machinery with no home elsewhere yet: Raise/Lower Shield + Shield
// Block, Dismiss aura, turn-start free-action offers, Sustain prompts, and the Bestiary.
const TurnTrackerPanel = ({ charId, characterName, inventory = [], character = null }) => {
  const { encounter, appendLog } = useEncounter();
  const { turnState, spendActions, resetForNewTurn } = useTurnState(charId);
  const { getState, sendUpdate } = useSession();

  // Minions act on their owner's turn (Command), so their turn state — Multiple
  // Attack Penalty (#261) and the granted-action pool (#391) — resets when the
  // owner's turn does. Both companion and familiar carry a pool now.
  const hasCompanion = !!character?.animalCompanion;
  const hasFamiliar = !!character?.familiar;
  const { resetForNewTurn: resetCompanionTurn } = useTurnState(
    minionTurnId(charId, MINION_COMPANION)
  );
  const { resetForNewTurn: resetFamiliarTurn } = useTurnState(
    minionTurnId(charId, MINION_FAMILIAR)
  );

  // Turn-start free-action offers (#228 — Primary Threat). Authored as
  // `offerAt: { round? }` on a free action; offered on the actor's turn while
  // the round matches. Handled state is keyed by turn token so a remount
  // mid-turn doesn't re-offer something already used or dismissed.
  const [offersHandled, setOffersHandled] = useState({});

  // Raise a Shield (Slice 1); the Shield Block bar is its own component now.
  // `usable` folds Broken/Destroyed in — a broken shield stays usable only for
  // a Rust-Blessed wielder (campaign boon).
  const { heldShield, raised, broken, destroyed, usable, strapObstructed, raiseShield, lowerShield } =
    useShield(charId, inventory);

  // Kinetic aura (#228) — Dismiss is one of the three ways the aura ends.
  // Unlike a raised shield it persists across turns, so no turn-start reset.
  const { active: auraActive, deactivate: deactivateAura } = useAura(charId);

  // Readied action (#501) — declared on this PC's turn, fires off-turn. Cleared
  // here on its two end conditions: the reaction is spent (it fired, or was used
  // elsewhere so it can no longer fire) and the owner's next turn (lapsed).
  const { readied, clear: clearReadied } = useReadiedAction(charId);

  // Sustained spells (#220) — Bless, Mirror Image, Summon Undead, … prompt the
  // caster to Sustain a Spell (1 action) at the start of each of their turns.
  // `lastSustainedRound` on each entry tracks whether it's been kept alive this
  // round. (The lapse-on-end-turn sweep now lives in useEndTurn.)
  const { sustains, sustain: doSustain, end: endSustain } = useSustains(charId);

  // GM-added summons (#261) are tied to a sustain. Every sustain-end path (manual
  // End, lapse on turn submit, encounter end) mutates this caster's ledger, so a
  // single reconciler here prunes any of *this* caster's summons whose sustain is
  // gone — no need to hook each end path.
  const { summons, pruneOrphans } = useSummons();
  useEffect(() => {
    const liveIds = new Set(sustains.map((s) => s.id));
    const hasOrphan = summons.some((s) => s.casterId === charId && !liveIds.has(s.sustainId));
    if (hasOrphan) pruneOrphans(charId, [...liveIds]);
  }, [sustains, summons, charId, pruneOrphans]);

  // ── Bestiary ──────────────────────────────────────────────────────────────
  const [bestiaryOpen, setBestiaryOpen] = useState(false);

  // ── Turn identity (computed before the early return so the self-reset effect
  // can use it without violating the Rules of Hooks) ────────────────────────
  const order = encounter?.order || [];
  const currentTurnIndex = encounter?.currentTurnIndex ?? 0;
  const isMyTurn = isCharTurn(encounter, charId);
  const phase = encounter?.phase;
  const turnToken = `${encounter?.round ?? 0}:${currentTurnIndex}`;

  // Reset my own turnstate when my turn begins. This is the authoritative reset
  // path — relying on the previous actor to reset the "next" PC is unreliable
  // once Foundry interleaves enemy turns (a PC after an enemy would never get
  // reset, leaving stale actionsSpent that disables their End Turn button).
  // Comparing against the *persisted* token (not a ref) means remounting the
  // panel mid-turn won't wipe actions already spent this turn.
  useEffect(() => {
    if (phase !== 'in-progress') return;
    if (isMyTurn && turnState?.turnToken !== turnToken) {
      resetForNewTurn(turnToken);
      if (hasCompanion) resetCompanionTurn(turnToken);
      if (hasFamiliar) resetFamiliarTurn(turnToken);
      // "Until the start of your next turn" — a raised shield expires now.
      // Gated on the persisted turn token (not a ref) so remounting mid-turn
      // never drops a shield the player raised this turn.
      if (raised) lowerShield();
      // A readied action that never fired lapses at the start of the owner's
      // next turn (#501). It's already null if it fired (the spent-reaction
      // effect below clears it), so this only logs genuinely-unused ones.
      if (readied) {
        appendLog({ type: 'system', text: readiedExpireLog(readied, characterName) });
        clearReadied();
      }
    }
  }, [isMyTurn, turnToken, phase, turnState, resetForNewTurn, hasCompanion, resetCompanionTurn, hasFamiliar, resetFamiliarTurn, raised, lowerShield, readied, clearReadied, appendLog, characterName]);

  // The reaction backing a readied action is spent (it fired, or the player
  // spent their reaction on something else) — either way it can no longer fire,
  // so retire it silently. reactionSpent resets to false on the turn-begin
  // effect above, so this never clears a fresh readied at turn start.
  useEffect(() => {
    if (readied && turnState?.reactionSpent) clearReadied();
  }, [readied, turnState?.reactionSpent, clearReadied]);

  // A raised strapped shield (buckler class) whose hand just got tied up — or
  // that was unstrapped — lowers for real (bucklers S2). The derived `raised`
  // is already false, but leaving the persisted raise stale-true would let the
  // bonus spring back for free the moment the hand empties. This runs on the
  // owner's client, which is also where the hand change was made.
  useEffect(() => {
    if (!strapObstructed) return;
    lowerShield();
    appendLog({
      type: 'system',
      text: `${characterName}'s shield is no longer raised — that hand is tied up`,
    });
  }, [strapObstructed, lowerShield, appendLog, characterName]);

  if (!encounter || encounter.phase === 'idle') return null;

  const handleRaiseShield = () => {
    if (!usable) return;
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

    // Foundry-authoritative aura (#455): re-clone the effect onto the caster so
    // PF2e's aura engine refreshes the buff and re-evaluates which allies are
    // currently in range. No-op when the bridge isn't carrying the aura.
    if (s.foundryAura?.ref) {
      sendUpdate(charId, RELAY.APPLYEFFECT, {
        ref:     s.foundryAura.ref,
        op:      'apply',
        targets: [s.foundryAura.casterEntryId].filter(Boolean),
        source:  s.spellName,
        ts:      Date.now(),
      });
    }

    // Hymn of Healing (#226): the first time each round it's Sustained, the
    // target gains temp HP again (take-higher). Fast healing keeps applying on
    // its own at the target's turn start.
    if (s.heal?.targetId) {
      const target = { id: s.heal.targetId, name: s.heal.targetName, maxHp: s.heal.targetMaxHp };
      applyHymnTempHp({ getState, sendUpdate, target, amount: s.heal.tempHp });
      appendLog({
        type: 'system',
        text: `${s.heal.targetName} gains ${s.heal.tempHp} temporary HP (Hymn of Healing)`,
      });
    }
  };

  const handleEndSustain = (s) => {
    endSustain(s.id);
    appendLog({ type: 'system', text: `${s.spellName} ends` });
  };

  const isInProgress = encounter.phase === 'in-progress';
  const enemies = order.filter((e) => e.kind === 'enemy');

  return (
    <div className="ttp-panel" role="region" aria-label="Encounter tracker">
      {/* Local character controls — only on their turn, only for PCs */}
      {isInProgress && isMyTurn && (
        <div className="ttp-controls" role="group" aria-label="Turn controls">
          {heldShield && !raised && (
            <button
              className="btn-secondary ttp-shield"
              onClick={handleRaiseShield}
              disabled={!usable}
              title={destroyed
                ? 'Shield is destroyed — beyond repair'
                : heldShield.strapped && !heldShield.strapUsable
                ? `Hand ${heldShield.strapHand} is tied up — a strapped shield needs that hand free (or holding a light non-weapon) to raise`
                : broken && !usable
                ? 'Shield is broken — no bonus until repaired'
                : broken
                ? `Raise ${heldShield.name || 'shield'} (+${heldShield.shield?.bonus ?? 0} AC) — broken, held together by Rust Blessing`
                : `Raise ${heldShield.name || 'shield'} (+${heldShield.shield?.bonus ?? 0} AC)`}
              aria-label="Raise a Shield"
            >
              🛡 Raise{destroyed
                ? ' (Destroyed)'
                : heldShield.strapped && !heldShield.strapUsable
                ? ' (Hand full)'
                : broken
                ? ' (Broken)'
                : ''}
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
