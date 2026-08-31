import React from 'react';
import { useValueFlash } from '../../../hooks/useValueFlash';
import { rankFor, ladderBounds, repTone, formatSignedRep } from '../../../utils/reputation';
import ReputationLadder from './ReputationLadder';

// One faction card in the #1855 Reputation grid. `rep` is the (possibly
// optimistic) current score; `onStep(delta)` is ReputationView's debounced
// stepper handler — this component owns no mutation logic of its own, only
// the derived rank/tone/marker values used to render it.
//
// `useValueFlash` watches the RANK NAME (not the raw score) so the brief
// highlight (data-fx="bloom", src/fx.css) fires only on a threshold crossing,
// never on every point of drift — the same "worth animating" moment the
// research tier reveal and training benchmark get elsewhere in the dock.
const FactionCard = ({ faction, rep, onStep }) => {
  const rank = rankFor(faction, rep);
  const { min, max } = ladderBounds(faction);
  const tone = repTone(rep);
  const flash = useValueFlash(rank ? rank.name : 'off-ladder', () => 'bloom');

  return (
    <div className="dock-dt-rep-card" data-testid={`dock-dt-faction-${faction.id}`}>
      <div className="dock-dt-rep-title-row">
        <span className="dock-dt-rep-name">{faction.name}</span>
        <span
          key={flash?.key}
          data-fx={flash?.fx}
          className={`dock-dt-rep-badge dock-dt-rep-badge--${tone}`}
        >
          {rank ? rank.name : 'Off ladder'}
        </span>
        <span className={`dock-dt-rep-score dock-dt-rep-score--${tone}`}>
          {formatSignedRep(rep)}
        </span>
      </div>

      <div className="dock-dt-rep-ladder-row">
        <button
          type="button"
          className="dock-dt-step"
          aria-label={`Lower ${faction.name} reputation`}
          disabled={rep <= min}
          onClick={() => onStep(-1)}
        >
          −
        </button>
        <ReputationLadder faction={faction} rep={rep} flashFx={flash?.fx} />
        <button
          type="button"
          className="dock-dt-step"
          aria-label={`Raise ${faction.name} reputation`}
          disabled={rep >= max}
          onClick={() => onStep(1)}
        >
          +
        </button>
      </div>

      <p className="dock-dt-rep-effect">
        {(rank && rank.effect) || 'No active effect at this rank.'}
      </p>
    </div>
  );
};

export default FactionCard;
