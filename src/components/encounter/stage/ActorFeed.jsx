// src/components/encounter/stage/ActorFeed.jsx
// The acting combatant's live action feed (#472a) — an ordered timeline of what
// they've done this turn, newest last. Entries are relayed from the bridge
// (#472b); this component just renders them. The trailing `pending` entry is the
// action the actor is mid-deciding.
//
// When an entry satisfies one of the viewer's armed reactions (#472c), an inline
// cue card threads in right under it — "trigger met · your reaction" + a React
// button per matching reaction. The match is computed upstream (EncounterStage);
// `cues` keys entry.n → the matching reaction options, and `onReact(option)`
// resolves through the shared reaction flow. Narration only; never auto-fires.
import React from 'react';
import ActionSymbol from '../../shared/ActionSymbol';

// Feed costs use the compact 1|2|3|'r'|'f' form; map to ActionSymbol's vocabulary.
const COST_SYM = { r: 'reaction', f: 'free' };
const toSymCost = (cost) => COST_SYM[cost] ?? cost;

const CueCard = ({ options, onReact }) => (
  <li className="stage-feed-cue">
    <span className="stage-feed-cue-head">Trigger met &middot; your reaction</span>
    <div className="stage-feed-cue-actions">
      {options.map(({ reaction, castSource }) => (
        <button
          key={`${reaction.name}-${castSource || 'self'}`}
          type="button"
          className="stage-feed-cue-btn"
          onClick={() => onReact({ reaction, castSource })}
        >
          {reaction.name}
        </button>
      ))}
    </div>
  </li>
);

const ActorFeed = ({ feed, cues, onReact }) => (
  <ol className="stage-feed-list">
    {feed.map((item) => {
      const cue = cues?.[item.n];
      return (
        <React.Fragment key={item.n}>
          <li
            className={[
              'stage-feed-row',
              item.tone ? `stage-feed-row--${item.tone}` : '',
              item.state === 'pending' ? 'is-pending' : '',
            ].filter(Boolean).join(' ')}
          >
            <span className="stage-feed-node" aria-hidden="true" />
            <span className="stage-feed-body">
              <span className="stage-feed-top">
                {item.state !== 'pending' && item.cost != null && (
                  <span className="stage-feed-cost">
                    <ActionSymbol cost={toSymCost(item.cost)} />
                  </span>
                )}
                <span className="stage-feed-label">{item.label}</span>
                {item.result && <span className="stage-feed-result">{item.result}</span>}
              </span>
              {item.detail && <span className="stage-feed-detail">{item.detail}</span>}
            </span>
          </li>
          {cue && cue.length > 0 && <CueCard options={cue} onReact={onReact} />}
        </React.Fragment>
      );
    })}
  </ol>
);

export default ActorFeed;
