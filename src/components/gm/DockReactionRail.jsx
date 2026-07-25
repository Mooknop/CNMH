import React from 'react';
import { useReactionOptions } from '../../hooks/useReactionOptions';
import { useSession } from '../../contexts/SessionContext';
import { useSessionLog } from '../../hooks/useSessionLog';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useCountdown } from '../../hooks/useCountdown';
import { TRIGGER_EVENTS } from '../../utils/reactionTriggers';
import { buildReactionPrompt } from '../../utils/reactionPrompt';
import { APP, syncKey } from '../../sync/keys';
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
//
// D4 (#1575): prompts carry ttlSec (buildReactionPrompt), and while one is
// outstanding the row header shows a waiting chip counting down on the GM's
// own clock — it settles the moment the player uses/passes (the key clears)
// or reads "no answer" if the countdown drains with the key still set (player
// offline / pre-D4 client — their round stamp still kills it).

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

  // Outstanding prompt for this PC (D4) — the same key firePrompt writes; the
  // player device clears it on use/pass/expiry, which settles the chip.
  const [outstanding] = useSyncedState(syncKey(APP.REACTPROMPT, character.id), null);
  const promptLive = !!outstanding
    && (outstanding.round == null || round == null || outstanding.round === round);
  const deadline = promptLive && Number(outstanding.ttlSec) > 0
    ? Number(outstanding.ts) + Number(outstanding.ttlSec) * 1000
    : null;
  const remaining = useCountdown(deadline);

  const firePrompt = (reaction, event) => {
    sendUpdate(character.id, APP.REACTPROMPT, buildReactionPrompt({
      eventId: event.id,
      label: event.label,
      round,
    }));
    appendEvent({
      type: 'trigger',
      text: `Trigger: ${event.label} → ${character.name} (${reaction.name})`,
    });
  };

  return (
    <section className="dock-rail-row" aria-label={`${character.name} reactions`}>
      <header className="dock-rail-row-head">
        <span className="dock-rail-row-name">{character.name}</span>
        {promptLive && (
          <span className="dock-rail-wait" role="timer" data-testid="dock-rail-wait">
            {remaining == null ? '⏳ prompted'
              : remaining > 0 ? `⏳ ${remaining}s`
              : '⏳ no answer'}
          </span>
        )}
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
