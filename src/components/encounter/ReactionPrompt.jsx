import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';
import { useCharacter } from '../../hooks/useCharacter';
import { useShield } from '../../hooks/useShield';
import { useCountdown } from '../../hooks/useCountdown';
import { useContent } from '../../contexts/ContentContext';
import { matchingReactions } from '../../utils/reactionTriggers';
import { buildReactionSources, castSourceOf } from '../../utils/reactionSources';
import UseAbilityModal from './UseAbilityModal';
import ShieldBlockBar from './ShieldBlockBar';
import './SavePrompt.css';
import './ReactionPrompt.css';
import { APP, syncKey } from '../../sync/keys';

/**
 * Appears on a player's device when a GM-fired trigger event (#221) wakes one
 * of their reactions. The GM broadcasts over cnmh_reactprompt_<charId>; this
 * component matches the event against the character's reactions' declared
 * triggerType and gates on reaction availability from turn state.
 *
 * Mechanical hooks per matched entry:
 *  - Shield Block → the shared ShieldBlockBar (damage-split math via applyBlock);
 *    matched only while the shield is actually raised.
 *  - Reaction-cost staff spells (e.g. Overselling Flourish) → UseAbilityModal as
 *    a Cast from the staff, so charge costing applies.
 *  - Everything else → UseAbilityModal at reaction cost (targeting, effects,
 *    chained Strikes for e.g. Retributive Strike, spend, log).
 *
 * Cancelling the modal keeps the prompt up; Pass just dismisses (per the
 * issue). The synced key is cleared once the reaction is spent (any path) or
 * on Pass, and a round-stamped prompt expires with its round — a stale prompt
 * can't resurface after the reaction resets.
 *
 * Countdown (#1575 D4): a prompt carrying ttlSec shows a draining ring and
 * auto-passes when it expires (clearing the key so the GM's waiting chip
 * settles too, plus a combat-log line when the prompt was actually visible).
 * The deadline anchors on ARRIVAL on this device — no clock-skew coupling to
 * the GM's ts. Paused while the reaction modal is open: a player mid-resolve
 * is never yanked out. Prompts without ttlSec behave exactly as before.
 */
const ReactionPrompt = ({ character, themeColor }) => {
  const charId = character.id;
  const [prompt, setPrompt] = useSyncedState(syncKey(APP.REACTPROMPT, charId), null);
  const { encounter, appendLog } = useEncounter();
  const { turnState } = useTurnState(charId);
  const {
    reactions,
    staffSpells,
    focusSpells,
    inventory,
    spellcasting,
    innateSpells,
    wandSpells,
    scrollSpells,
    eldPowers,
    level,
  } = useCharacter(character);
  const { raised } = useShield(charId, inventory);
  const { spells: catalogSpells } = useContent();
  const [attunedSource] = useSyncedState(syncKey(APP.ELDATTUNE, charId), '');
  const [usingReaction, setUsingReaction] = useState(null); // { ability, castSource? }

  // Shared source list (character reactions + reaction-cost spells from every
  // cast list + attuned eld powers), identical to the off-turn armed bar (#474)
  // so the two never drift.
  const sources = useMemo(
    () =>
      buildReactionSources({
        reactions,
        staffSpells,
        focusSpells,
        catalogSpells,
        repertoireSpells: spellcasting?.spells,
        innateSpells,
        wandSpells,
        scrollSpells,
        eldPowers,
        attunedSource,
        characterLevel: level,
      }),
    [reactions, staffSpells, focusSpells, catalogSpells, spellcasting, innateSpells, wandSpells, scrollSpells, eldPowers, attunedSource, level]
  );

  // The reaction was spent (via the modal, the block bar, or any other path) —
  // the trigger window is consumed, so clear the synced prompt for good.
  const reactionSpent = !!turnState?.reactionSpent;
  useEffect(() => {
    if (prompt && reactionSpent) {
      setUsingReaction(null);
      setPrompt(null);
    }
  }, [prompt, reactionSpent, setPrompt]);

  // Visibility, derived BEFORE the hooks below need it. Reaction windows are
  // immediate — a prompt fired in an earlier round is dead (round stamp).
  const roundLive = !(
    prompt?.round != null && encounter?.round != null && prompt.round !== encounter.round
  );
  const matched = prompt
    ? matchingReactions(sources, prompt.eventId)
      // Shield Block is only a live option while the shield is raised — and
      // `raised` already requires a usable shield (unbroken, or broken in a
      // Rust-Blessed wielder's hands; never destroyed).
      .filter((r) => r.name !== 'Shield Block' || raised)
    : [];
  const available =
    !!turnState?.hasStartedFirstTurn &&
    !!turnState?.reactionAvailable &&
    !reactionSpent;
  const visible = !!prompt && !!encounter?.active && roundLive && matched.length > 0 && available;

  // Countdown (#1575 D4) — deadline anchored on when THIS device first saw the
  // reqId (lazy ref init; a re-render never restarts the clock).
  const ttlSec = Number(prompt?.ttlSec) || 0;
  const reqId = prompt?.reqId || null;
  const seenAtRef = useRef({});
  if (reqId && ttlSec > 0 && seenAtRef.current[reqId] == null) {
    seenAtRef.current[reqId] = Date.now();
  }
  const deadline = reqId && ttlSec > 0 ? seenAtRef.current[reqId] + ttlSec * 1000 : null;
  const remaining = useCountdown(deadline);

  // Expiry auto-pass: clear the key (settling the GM chip) and log — but only
  // log when the prompt was actually actionable here, and never while the
  // player is mid-resolve in the reaction modal.
  useEffect(() => {
    if (!prompt || remaining !== 0 || usingReaction) return;
    if (visible) {
      appendLog?.({
        type: 'system',
        text: `${character.name} let '${prompt.label || 'a reaction'}' pass (timer expired)`,
      });
    }
    setPrompt(null);
  }, [prompt, remaining, usingReaction, visible, appendLog, setPrompt, character.name]);

  if (!visible) return null;

  const handlePass = () => {
    setUsingReaction(null);
    setPrompt(null);
  };

  return (
    <div className="save-prompt reaction-prompt" role="region" aria-label="Reaction trigger prompt">
      <div className="save-prompt-header">
        <span className="save-prompt-icon" aria-hidden="true">↩</span>
        <span className="save-prompt-title">{prompt.label || 'Reaction trigger'}</span>
        {remaining != null && (
          <span
            className={`react-countdown${remaining <= 5 ? ' react-countdown--urgent' : ''}`}
            role="timer"
            aria-label={`${remaining} seconds to react`}
            style={{ '--cd-pct': ttlSec > 0 ? (remaining / ttlSec) * 100 : 0 }}
          >
            {remaining}
          </span>
        )}
      </div>

      {prompt.note && (
        <div className="save-prompt-details">
          <span className="save-prompt-mod">{prompt.note}</span>
        </div>
      )}

      {matched.map((reaction) => (
        <div key={reaction.name} className="save-prompt-entry">
          <span className="save-prompt-type">{reaction.name}</span>
          {reaction.name === 'Shield Block' ? (
            <ShieldBlockBar
              charId={charId}
              characterName={character.name}
              inventory={inventory}
            />
          ) : (
            <button
              className="btn-primary"
              onClick={() =>
                setUsingReaction({
                  ability: reaction,
                  castSource: castSourceOf(reaction),
                })
              }
              aria-label={`Use ${reaction.name}`}
            >
              {reaction.isSpell ? 'Cast ↩' : 'Use ↩'}
            </button>
          )}
        </div>
      ))}

      <button
        className="btn-text save-result-dismiss"
        onClick={handlePass}
        aria-label="Pass on reaction"
      >
        Pass
      </button>

      {usingReaction && (
        <UseAbilityModal
          isOpen
          onClose={() => setUsingReaction(null)}
          ability={usingReaction.ability}
          cost="reaction"
          verb={usingReaction.castSource || usingReaction.ability?.isSpell ? 'Cast' : 'Use'}
          castSource={usingReaction.castSource}
          character={character}
          themeColor={themeColor}
        />
      )}
    </div>
  );
};

export default ReactionPrompt;
