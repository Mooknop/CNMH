import React, { useState, useCallback } from 'react';
import { usePlayMode } from '../../hooks/usePlayMode';
import ExplorationList from './ExplorationList';
import ExplorationMove from './ExplorationMove';
import ExplorationDoors from './ExplorationDoors';
import './ExplorationTab.css';

// Wrapper for the Explore tab. Shows Activity / Movement subtabs when in
// exploration mode. Shows a placeholder when in downtime mode.

const ExplorationTab = ({ character, characterColor }) => {
  const { mode } = usePlayMode();
  const [subtab, setSubtab] = useState('activity');
  const [moveDoneTs, setMoveDoneTs] = useState(null);
  const handleMoveDone = useCallback(() => setMoveDoneTs(Date.now()), []);

  if (mode === 'downtime') {
    return (
      <div className="et-downtime">
        <span className="et-downtime-label">Downtime</span>
        <p className="et-downtime-sub">Downtime activities coming in a future update.</p>
      </div>
    );
  }

  return (
    <div className="et-wrap">
      <div className="et-pills" role="group" aria-label="Explore subtab">
        <button
          className={`et-pill${subtab === 'activity' ? ' et-pill--active' : ''}`}
          onClick={() => setSubtab('activity')}
          aria-pressed={subtab === 'activity'}
        >
          Activity
        </button>
        <button
          className={`et-pill${subtab === 'movement' ? ' et-pill--active' : ''}`}
          onClick={() => setSubtab('movement')}
          aria-pressed={subtab === 'movement'}
        >
          Movement
        </button>
      </div>

      {subtab === 'activity' && (
        <ExplorationList character={character} characterColor={characterColor} />
      )}
      {subtab === 'movement' && (
        <>
          <ExplorationMove charId={character?.id} onMoveDone={handleMoveDone} />
          <ExplorationDoors charId={character?.id} moveDoneTs={moveDoneTs} />
        </>
      )}
    </div>
  );
};

export default ExplorationTab;
