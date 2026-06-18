// src/components/encounter/stage/ActorFeed.jsx
// The acting combatant's live action feed (#472a) — an ordered timeline of what
// they've done this turn, newest last. Entries are relayed from the bridge
// (#472b); this component just renders them. The trailing `pending` entry is the
// action the actor is mid-deciding.
import React from 'react';
import ActionSymbol from '../../shared/ActionSymbol';

// Feed costs use the compact 1|2|3|'r'|'f' form; map to ActionSymbol's vocabulary.
const COST_SYM = { r: 'reaction', f: 'free' };
const toSymCost = (cost) => COST_SYM[cost] ?? cost;

const ActorFeed = ({ feed }) => (
  <ol className="stage-feed-list">
    {feed.map((item) => (
      <li
        key={item.n}
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
    ))}
  </ol>
);

export default ActorFeed;
