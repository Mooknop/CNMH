import React, { useState, useEffect } from 'react';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';
import { useCharacter } from '../../hooks/useCharacter';
import { matchingReactions } from '../../utils/reactionTriggers';
import UseAbilityModal from './UseAbilityModal';
import './SavePrompt.css';

/**
 * Appears on a player's device when a GM-fired trigger event (#221) wakes one
 * of their reactions. The GM broadcasts over cnmh_reactprompt_<charId>; this
 * component matches the event against the character's reactions' declared
 * triggerType and gates on reaction availability from turn state.
 *
 * Use → opens UseAbilityModal (cost 'reaction'), which runs targeting/effects,
 * spends the reaction, and logs; cancelling the modal keeps the prompt up.
 * Pass → just dismisses (per the issue). The synced key is cleared once the
 * reaction is spent (any path) or on Pass, and a round-stamped prompt expires
 * with its round — a stale prompt can't resurface after the reaction resets.
 */
const ReactionPrompt = ({ character, themeColor }) => {
  const charId = character.id;
  const [prompt, setPrompt] = useSyncedState(`cnmh_reactprompt_${charId}`, null);
  const { encounter } = useEncounter();
  const { turnState } = useTurnState(charId);
  const { reactions } = useCharacter(character);
  const [usingReaction, setUsingReaction] = useState(null);

  // The reaction was spent (via the modal or any other path) — the trigger
  // window is consumed, so clear the synced prompt for good.
  const reactionSpent = !!turnState?.reactionSpent;
  useEffect(() => {
    if (prompt && reactionSpent) {
      setUsingReaction(null);
      setPrompt(null);
    }
  }, [prompt, reactionSpent, setPrompt]);

  if (!prompt || !encounter?.active) return null;

  // Reaction windows are immediate — a prompt fired in an earlier round is dead.
  if (prompt.round != null && encounter.round != null && prompt.round !== encounter.round) {
    return null;
  }

  const matched = matchingReactions(reactions, prompt.eventId);
  const available =
    !!turnState?.hasStartedFirstTurn &&
    !!turnState?.reactionAvailable &&
    !reactionSpent;

  if (matched.length === 0 || !available) return null;

  const handlePass = () => {
    setUsingReaction(null);
    setPrompt(null);
  };

  return (
    <div className="save-prompt reaction-prompt" role="region" aria-label="Reaction trigger prompt">
      <div className="save-prompt-header">
        <span className="save-prompt-icon" aria-hidden="true">↩</span>
        <span className="save-prompt-title">{prompt.label || 'Reaction trigger'}</span>
      </div>

      {prompt.note && (
        <div className="save-prompt-details">
          <span className="save-prompt-mod">{prompt.note}</span>
        </div>
      )}

      {matched.map((reaction) => (
        <div key={reaction.name} className="save-prompt-entry">
          <span className="save-prompt-type">{reaction.name}</span>
          <button
            className="btn-primary"
            onClick={() => setUsingReaction(reaction)}
            aria-label={`Use ${reaction.name}`}
          >
            Use ↩
          </button>
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
          ability={usingReaction}
          cost="reaction"
          verb="Use"
          character={character}
          themeColor={themeColor}
        />
      )}
    </div>
  );
};

export default ReactionPrompt;
