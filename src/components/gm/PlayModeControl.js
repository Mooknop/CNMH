import React from 'react';
import { usePlayMode } from '../../hooks/usePlayMode';
import './PlayModeControl.css';

// GM control for the non-combat play mode (Exploration / Downtime) and the
// exploration movement toggle. Locked to "Encounter" when Foundry combat is active.

const PlayModeControl = () => {
  const { mode, gmMode, setGmMode, moveEnabled, setMoveEnabled } = usePlayMode();
  const isEncounter = mode === 'encounter';

  return (
    <div className="pmc">
      <div className="pmc-row">
        <span className="pmc-label">Play Mode</span>
        <div className="pmc-pills" role="group" aria-label="Play mode">
          {isEncounter ? (
            <span className="pmc-pill pmc-pill--active pmc-pill--locked" aria-current="true">
              Encounter
            </span>
          ) : (
            <>
              <button
                className={`pmc-pill${gmMode === 'exploration' ? ' pmc-pill--active' : ''}`}
                onClick={() => setGmMode('exploration')}
                aria-pressed={gmMode === 'exploration'}
              >
                Exploration
              </button>
              <button
                className={`pmc-pill${gmMode === 'downtime' ? ' pmc-pill--active' : ''}`}
                onClick={() => setGmMode('downtime')}
                aria-pressed={gmMode === 'downtime'}
              >
                Downtime
              </button>
            </>
          )}
        </div>
      </div>

      {!isEncounter && gmMode === 'exploration' && (
        <div className="pmc-row pmc-row--toggle">
          <label className="pmc-toggle-label" htmlFor="pmc-move-toggle">
            Allow token movement
          </label>
          <button
            id="pmc-move-toggle"
            className={`pmc-toggle${moveEnabled ? ' pmc-toggle--on' : ''}`}
            onClick={() => setMoveEnabled(!moveEnabled)}
            aria-pressed={moveEnabled}
          >
            {moveEnabled ? 'On' : 'Off'}
          </button>
        </div>
      )}
    </div>
  );
};

export default PlayModeControl;
