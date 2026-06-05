import React, { useState, useCallback, useEffect, useRef } from 'react';
import { usePlayMode } from '../../hooks/usePlayMode';
import { useExplorationReady } from '../../hooks/useExplorationReady';
import { useSyncedState } from '../../hooks/useSyncedState';
import ExplorationList from './ExplorationList';
import ExplorationMove from './ExplorationMove';
import ExplorationDoors from './ExplorationDoors';
import './ExplorationTab.css';

// The Explore tab is a two-state, no-tabs flow gated by a party readiness
// check. Until every party PC has locked in an exploration activity (or the GM
// overrides), everyone sees the Activity picker. Once ready, the tab switches
// to Movement controls for all players. A player may peek back at the Activity
// picker for themselves without dropping the rest of the party.
// Downtime mode shows a placeholder.

const ExplorationTab = ({ character, characterColor }) => {
  const { mode, moveEnabled } = usePlayMode();
  const { ready } = useExplorationReady();
  const [peekActivity, setPeekActivity] = useState(false);
  const [moveDoneTs, setMoveDoneTs] = useState(null);
  const handleMoveDone = useCallback(() => setMoveDoneTs(Date.now()), []);
  const movementAllowed = mode === 'exploration' && moveEnabled;

  // Own-pick mirror — lets the tab clear this player's activity when a new
  // exploration beat begins. Stays in sync with ExplorationList's own copy of
  // the same key through the session's local subscriber fanout.
  const [, setOwnActivity] = useSyncedState(`cnmh_exploration_${character?.id}`, null);

  // Reset to the Activity state whenever exploration is (re)entered, so each
  // beat starts fresh. Seed prevMode with the current mode so a mid-beat mount
  // doesn't wipe an existing pick.
  const prevMode = useRef(mode);
  useEffect(() => {
    const was = prevMode.current;
    prevMode.current = mode;
    if (mode === 'exploration' && was !== 'exploration') {
      setOwnActivity(null);
      setPeekActivity(false);
    }
  }, [mode, setOwnActivity]);

  if (mode === 'downtime') {
    return (
      <div className="et-downtime">
        <span className="et-downtime-label">Downtime</span>
        <p className="et-downtime-sub">Downtime activities coming in a future update.</p>
      </div>
    );
  }

  const showActivity = !ready || peekActivity;

  return (
    <div className="et-wrap">
      {ready && (
        <div className="et-toggle-row">
          <button
            className="et-toggle"
            onClick={() => setPeekActivity((p) => !p)}
          >
            {peekActivity ? '← Back to movement' : 'Change activity'}
          </button>
        </div>
      )}

      {showActivity ? (
        <>
          <ExplorationList character={character} characterColor={characterColor} />
          {!ready && (
            <p className="et-waiting">Waiting for the party to choose activities…</p>
          )}
        </>
      ) : (
        movementAllowed ? (
          <>
            <ExplorationMove charId={character?.id} onMoveDone={handleMoveDone} />
            <ExplorationDoors charId={character?.id} moveDoneTs={moveDoneTs} />
          </>
        ) : (
          <div className="et-move-disabled">
            <p>Token movement is currently disabled by the GM.</p>
          </div>
        )
      )}
    </div>
  );
};

export default ExplorationTab;
