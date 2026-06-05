import React, { useContext, useEffect, useRef } from 'react';
import { usePlayMode } from '../../hooks/usePlayMode';
import { useExplorationReady } from '../../hooks/useExplorationReady';
import { CharacterContext } from '../../contexts/CharacterContext';
import { useSession } from '../../contexts/SessionContext';
import './PlayModeControl.css';

// GM control for the non-combat play mode (Exploration / Downtime) and the
// exploration movement toggle. Locked to "Encounter" when Foundry combat is
// active. Also owns the exploration activity-ready override and the
// authoritative reset of party picks each time exploration is (re)entered.

const PlayModeControl = () => {
  const { mode, gmMode, setGmMode, moveEnabled, setMoveEnabled, setMoveOverride } = usePlayMode();
  const { allChosen } = useExplorationReady();
  const { characters } = useContext(CharacterContext) || {};
  const { sendUpdate } = useSession();
  const isEncounter = mode === 'encounter';

  // Authoritative reset: whenever exploration is (re)entered, clear every
  // party PC's pick and drop the override. This covers offline players' stale
  // picks; per-client tabs also clear their own pick for snappiness. Writing
  // null is idempotent, so the two paths race harmlessly. Seed prevMode with
  // the current mode so a mid-beat GM mount doesn't wipe live picks.
  const prevMode = useRef(mode);
  useEffect(() => {
    const was = prevMode.current;
    prevMode.current = mode;
    if (mode === 'exploration' && was !== 'exploration') {
      setMoveOverride(false);
      (characters || []).forEach((c) => sendUpdate(c.id, 'exploration', null));
    }
  }, [mode, characters, sendUpdate, setMoveOverride]);

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

      {!isEncounter && gmMode === 'exploration' && !allChosen && (
        <div className="pmc-row pmc-row--override">
          <span className="pmc-override-hint">Waiting for the party to choose activities…</span>
          <button className="pmc-override-btn" onClick={() => setMoveOverride(true)}>
            Start movement
          </button>
        </div>
      )}
    </div>
  );
};

export default PlayModeControl;
