import React from 'react';
import { useReactionOptions } from '../../hooks/useReactionOptions';
import GmReactionBadge from './GmReactionBadge';

// Command Dock party-reaction rail (#1525 S3) — for every OTHER PC in the
// initiative order: their reaction-availability badge plus each reaction with
// its trigger text and live/blocked state. Read-only intel this slice; firing
// the matching trigger prompt from a row lands in S4.
//
// Unlike the player's ArmedReactionBar, Shield Block IS listed here (the GM
// wants the full picture; there's no ShieldBlockBar on this surface to double
// up with). Readied actions ride along from useReactionOptions — off-sheet
// intel the GM otherwise has to remember.

const triggerTextOf = (reaction) => reaction.trigger || reaction.description || '';

const RailReaction = ({ reaction, live, liveReason }) => (
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
  </li>
);

// Per-PC child so each row owns its character's hook tree (useReactionOptions
// → useCharacter/useTurnState/…), the same pattern as GmInitiativePanel rows.
const RailRow = ({ character }) => {
  const { options } = useReactionOptions(character);
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
          {options.map(({ reaction, castSource, live, liveReason }) => (
            <RailReaction
              key={`${reaction.name}-${castSource || 'self'}`}
              reaction={reaction}
              live={live}
              liveReason={liveReason}
            />
          ))}
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
        rows.map(({ entry, character }) => <RailRow key={entry.entryId} character={character} />)
      )}
    </aside>
  );
};

export default DockReactionRail;
