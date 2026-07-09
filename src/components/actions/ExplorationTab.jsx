import React, { useState, useCallback, useEffect, useRef } from 'react';
import { usePlayMode } from '../../hooks/usePlayMode';
import { useExplorationReady } from '../../hooks/useExplorationReady';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useExplorationEffect } from '../../hooks/useExplorationEffect';
import { useTake10 } from '../../hooks/useTake10';
import { EXPLORATION_ACTIVITIES } from '../../data/explorationActivities';
import ExplorationList from './ExplorationList';
import ExplorationPartyBoard from './ExplorationPartyBoard';
import ExplorationMove from './ExplorationMove';
import ExplorationDoors from './ExplorationDoors';
import Take10Prompt from './Take10Prompt';
import DowntimeTab from './DowntimeTab';
import './ExplorationTab.css';
import { APP, syncKey, globalKey } from '../../sync/keys';

// The Explore tab is a two-state, no-tabs flow gated by a party readiness
// check. Until every party PC has locked in an exploration activity (or the GM
// overrides), everyone sees the Activity picker. Once ready, the tab switches
// to Movement controls for all players. A player may peek back at the Activity
// picker for themselves without dropping the rest of the party.
// Downtime mode shows a placeholder.

const ExplorationTab = ({ character, characterColor }) => {
  const { mode, moveEnabled } = usePlayMode();
  const { ready } = useExplorationReady();
  const { active: take10Active, start: startTake10 } = useTake10(character?.id);
  const [peekActivity, setPeekActivity] = useState(false);
  const [moveDoneTs, setMoveDoneTs] = useState(null);
  const handleMoveDone = useCallback(() => setMoveDoneTs(Date.now()), []);
  const movementAllowed = mode === 'exploration' && moveEnabled;

  // Own-pick mirror — lets the tab clear this player's activity when a new
  // exploration beat begins, and drives the activity-scoped self-buff. Stays in
  // sync with ExplorationList's own copy of the same key through the session's
  // local subscriber fanout.
  const [ownActivity, setOwnActivity] = useSyncedState(syncKey(APP.EXPLORATION, character?.id), null);

  // Apply/clear the active activity's self-buff (e.g. Defend's +2 Perception)
  // while in exploration. Cleared automatically when the pick changes, is
  // cleared, or the effective mode leaves exploration.
  const activeDef = EXPLORATION_ACTIVITIES.find((a) => a.name === ownActivity) || null;
  const desiredEffectId = mode === 'exploration' ? (activeDef?.mechanics?.effect || null) : null;
  useExplorationEffect(character?.id, desiredEffectId);

  // Scout: write this character's id to the global scout bonus key while active,
  // so InitiativeEntry can show the +1 reminder to the whole party.
  const [, setScoutBonus] = useSyncedState(globalKey(APP.SCOUTBONUS), null);
  const isScoutActive = mode === 'exploration' && ownActivity === 'Scout';
  useEffect(() => {
    setScoutBonus(isScoutActive ? (character?.id || null) : null);
  }, [isScoutActive, character?.id, setScoutBonus]);

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
    return <DowntimeTab character={character} characterColor={characterColor} />;
  }

  const showActivity = !ready || peekActivity;

  return (
    <div className="et-wrap">
      <Take10Prompt character={character} characterColor={characterColor} />

      {!take10Active && (
        <div className="et-toggle-row">
          <button className="et-toggle" onClick={() => startTake10()}>
            Take 10
          </button>
        </div>
      )}

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
          <ExplorationPartyBoard character={character} />
          <ExplorationList character={character} characterColor={characterColor} />
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
