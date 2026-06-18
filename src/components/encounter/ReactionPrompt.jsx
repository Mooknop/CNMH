import React, { useState, useEffect, useMemo } from 'react';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';
import { useCharacter } from '../../hooks/useCharacter';
import { useShield } from '../../hooks/useShield';
import { useContent } from '../../contexts/ContentContext';
import { matchingReactions } from '../../utils/reactionTriggers';
import { buildReactionSources, castSourceOf } from '../../utils/reactionSources';
import UseAbilityModal from './UseAbilityModal';
import ShieldBlockBar from './ShieldBlockBar';
import './SavePrompt.css';

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
 */
const ReactionPrompt = ({ character, themeColor }) => {
  const charId = character.id;
  const [prompt, setPrompt] = useSyncedState(`cnmh_reactprompt_${charId}`, null);
  const { encounter } = useEncounter();
  const { turnState } = useTurnState(charId);
  const { reactions, staffSpells, focusSpells, inventory } = useCharacter(character);
  const { raised, broken } = useShield(charId, inventory);
  const { spells: catalogSpells } = useContent();
  const [usingReaction, setUsingReaction] = useState(null); // { ability, castSource? }

  // Shared source list (character reactions + reaction-cost staff/focus spells),
  // identical to the off-turn armed bar (#474) so the two never drift.
  const sources = useMemo(
    () => buildReactionSources({ reactions, staffSpells, focusSpells, catalogSpells }),
    [reactions, staffSpells, focusSpells, catalogSpells]
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

  if (!prompt || !encounter?.active) return null;

  // Reaction windows are immediate — a prompt fired in an earlier round is dead.
  if (prompt.round != null && encounter.round != null && prompt.round !== encounter.round) {
    return null;
  }

  const matched = matchingReactions(sources, prompt.eventId)
    // Shield Block is only a live option while the shield is raised (and whole).
    .filter((r) => r.name !== 'Shield Block' || (raised && !broken));
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
              {reaction.fromStaff || reaction.fromFocus ? 'Cast ↩' : 'Use ↩'}
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
          verb={usingReaction.castSource ? 'Cast' : 'Use'}
          castSource={usingReaction.castSource}
          character={character}
          themeColor={themeColor}
        />
      )}
    </div>
  );
};

export default ReactionPrompt;
