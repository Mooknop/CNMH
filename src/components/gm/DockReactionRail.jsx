import React from 'react';
import { useReactionOptions } from '../../hooks/useReactionOptions';
import { useSession } from '../../contexts/SessionContext';
import { useSessionLog } from '../../hooks/useSessionLog';
import { TRIGGER_EVENTS } from '../../utils/reactionTriggers';
import { APP } from '../../sync/keys';
import GmReactionBadge from './GmReactionBadge';

// Command Dock party-reaction rail (#1525 S3/S4) — for every OTHER PC in the
// initiative order: their reaction-availability badge plus each reaction with
// its trigger text and live/blocked state. An armed reaction whose triggerType
// maps to a trigger event gets a Prompt button (S4) that fires the SAME
// cnmh_reactprompt_<charId> broadcast as GmTriggerConsole — matching still
// happens on the player device, so the prompt may wake sibling reactions that
// match the same event; that's the existing event semantic.
//
// Unlike the player's ArmedReactionBar, Shield Block IS listed here (the GM
// wants the full picture; there's no ShieldBlockBar on this surface to double
// up with). Readied actions ride along from useReactionOptions — off-sheet
// intel the GM otherwise has to remember (never promptable: they're player-
// initiated and unknown to ReactionPrompt's source list).

let _reqCounter = 0;

const triggerTextOf = (reaction) => reaction.trigger || reaction.description || '';

// First GM-fireable event that would wake this reaction's declared triggerType.
const eventForTrigger = (triggerType) =>
  triggerType ? TRIGGER_EVENTS.find((e) => e.matches.includes(triggerType)) || null : null;

const RailReaction = ({ reaction, live, liveReason, onPrompt }) => (
  <li className={`dock-rail-react${live ? '' : ' dock-rail-react--blocked'}`}>
    <span className="dock-rail-react-top">
      <span className="dock-rail-react-name">{reaction.name}</span>
      <span className="dock-rail-react-state">
        {live ? (reaction.readied ? 'readied' : 'armed') : liveReason || 'unavailable'}
      </span>
    </span>
    {triggerTextOf(reaction) && (
      <span className="dock-rail-react-trigger">{triggerTextOf(reaction)}</span>
    )}
    {onPrompt && (
      <button
        type="button"
        className="dock-rail-react-fire"
        onClick={onPrompt}
        aria-label={`Prompt ${reaction.name}`}
      >
        Prompt
      </button>
    )}
  </li>
);

// Per-PC child so each row owns its character's hook tree (useReactionOptions
// → useCharacter/useTurnState/…), the same pattern as GmInitiativePanel rows.
const RailRow = ({ character, round }) => {
  const { options } = useReactionOptions(character);
  const { sendUpdate } = useSession();
  const { appendEvent } = useSessionLog();

  const firePrompt = (reaction, event) => {
    sendUpdate(character.id, APP.REACTPROMPT, {
      reqId: `react-${Date.now()}-${++_reqCounter}`,
      eventId: event.id,
      label: event.label,
      round,
      ts: Date.now(),
    });
    appendEvent({
      type: 'trigger',
      text: `Trigger: ${event.label} → ${character.name} (${reaction.name})`,
    });
  };

  return (
    <section className="dock-rail-row" aria-label={`${character.name} reactions`}>
      <header className="dock-rail-row-head">
        <span className="dock-rail-row-name">{character.name}</span>
        <GmReactionBadge charId={character.id} name={character.name} />
      </header>
      {options.length === 0 ? (
        <p className="dock-rail-empty">No reactions.</p>
      ) : (
        <ul className="dock-rail-list">
          {options.map(({ reaction, castSource, live, liveReason }) => {
            const event = !reaction.readied && live ? eventForTrigger(reaction.triggerType) : null;
            return (
              <RailReaction
                key={`${reaction.name}-${castSource || 'self'}`}
                reaction={reaction}
                live={live}
                liveReason={liveReason}
                onPrompt={event ? () => firePrompt(reaction, event) : null}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
};

const DockReactionRail = ({ encounter, characters, excludeEntryId }) => {
  const rows = (encounter?.order || [])
    .filter((e) => e.kind === 'pc' && e.charId && e.entryId !== excludeEntryId)
    .map((e) => ({ entry: e, character: (characters || []).find((c) => c.id === e.charId) }))
    .filter((r) => r.character);

  return (
    <aside className="dock-rail" aria-label="Party reactions">
      <div className="dock-rail-head">Party reactions</div>
      {rows.length === 0 ? (
        <p className="dock-rail-empty">No other party members in the order.</p>
      ) : (
        rows.map(({ entry, character }) => (
          <RailRow key={entry.entryId} character={character} round={encounter?.round} />
        ))
      )}
    </aside>
  );
};

export default DockReactionRail;
