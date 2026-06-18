// src/components/encounter/stage/ArmedReactionBar.jsx
// Off-turn armed-reaction footer (#474). Lists this character's reactions as
// player-initiated buttons — the trigger call is the player's. Live ones are
// "armed"; blocked ones say why. Pressing resolves through UseAbilityModal at
// reaction cost (which spends the reaction/pool + logs). Typed-d20 reactions
// (Attack of Opportunity) and opposed cases are refined in #475.
//
// Shield Block is intentionally excluded here: it has its own damage-split bar
// (ShieldBlockBar) rendered by TurnTrackerPanel, driven by a raised shield
// rather than the reaction list. Surfacing it here too would double the bar.
import React, { useState } from 'react';
import { useReactionOptions } from '../../../hooks/useReactionOptions';
import UseAbilityModal from '../UseAbilityModal';

const triggerTextOf = (reaction) => reaction.trigger || reaction.description || '';

const ReactionButton = ({ reaction, live, liveReason, onUse }) => (
  <button
    type="button"
    className={`stage-react${live ? '' : ' stage-react--blocked'}`}
    onClick={live ? onUse : undefined}
    disabled={!live}
    aria-label={live ? `Use ${reaction.name}` : `${reaction.name} — ${liveReason}`}
  >
    <span className="stage-react-top">
      <span className="stage-react-name">{reaction.name}</span>
      <span className="stage-react-state">{live ? 'armed' : liveReason || 'unavailable'}</span>
    </span>
    {triggerTextOf(reaction) && (
      <span className="stage-react-trigger">{triggerTextOf(reaction)}</span>
    )}
  </button>
);

const ArmedReactionBar = ({ character, themeColor }) => {
  const { options } = useReactionOptions(character);
  const [using, setUsing] = useState(null); // { ability, castSource }

  // Shield Block lives in its own bar (see header note) — drop it from the list.
  const shown = options.filter((o) => o.reaction.name !== 'Shield Block');

  return (
    <div className="stage-reactbar" aria-label="Your reactions">
      <div className="stage-reactbar-head">Your reactions &middot; your call</div>

      {shown.length === 0 ? (
        <p className="stage-reactbar-empty">No reaction ready.</p>
      ) : (
        <div className="stage-reactbar-list">
          {shown.map(({ reaction, castSource, live, liveReason }) => (
            <ReactionButton
              key={`${reaction.name}-${castSource || 'self'}`}
              reaction={reaction}
              live={live}
              liveReason={liveReason}
              onUse={() => setUsing({ ability: reaction, castSource })}
            />
          ))}
        </div>
      )}

      {using && (
        <UseAbilityModal
          isOpen
          onClose={() => setUsing(null)}
          ability={using.ability}
          cost="reaction"
          verb={using.castSource ? 'Cast' : 'Use'}
          castSource={using.castSource}
          character={character}
          themeColor={themeColor}
        />
      )}
    </div>
  );
};

export default ArmedReactionBar;
