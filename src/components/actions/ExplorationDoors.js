import React, { useEffect, useCallback } from 'react';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useSession } from '../../contexts/SessionContext';
import './ExplorationDoors.css';

const DOOR_STATE_LABEL = { 0: 'Closed', 1: 'Open', 2: 'Locked' };

// Renders nearby doors for a character in exploration mode. Sends a doorreq
// whenever it mounts and again when moveDoneTs changes (the player moved).
// Also exposes a manual "Detect Doors" refresh button.

const ExplorationDoors = ({ charId, moveDoneTs }) => {
  const { sendUpdate } = useSession();
  const [doorOpts] = useSyncedState(`cnmh_dooropts_${charId}`, null);

  const detect = useCallback(() => {
    sendUpdate(charId, 'doorreq', { ts: Date.now() });
  }, [charId, sendUpdate]);

  // Detect on mount.
  useEffect(() => {
    detect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-detect after each confirmed move.
  useEffect(() => {
    if (moveDoneTs == null) return;
    detect();
  }, [moveDoneTs, detect]);

  const interact = (wallId, op) => {
    sendUpdate(charId, 'doorinteract', { wallId, op, ts: Date.now() });
  };

  const doors = doorOpts?.doors ?? [];

  return (
    <div className="ed-panel">
      <div className="ed-header">
        <span className="ed-title">Nearby Doors</span>
        <button className="btn-secondary ed-detect-btn" onClick={detect}>
          Detect Doors
        </button>
      </div>

      {doors.length === 0 ? (
        <p className="ed-empty">No doors detected nearby.</p>
      ) : (
        <ul className="ed-list">
          {doors.map((door) => (
            <li key={door.wallId} className="ed-door">
              <span className={`ed-door-state ed-door-state--${door.state}`}>
                {DOOR_STATE_LABEL[door.state] ?? 'Unknown'}
              </span>
              <div className="ed-door-actions">
                {door.state === 0 && (
                  <button
                    className="btn-secondary ed-door-btn"
                    onClick={() => interact(door.wallId, 'open')}
                  >
                    Open
                  </button>
                )}
                {door.state === 1 && (
                  <button
                    className="btn-secondary ed-door-btn"
                    onClick={() => interact(door.wallId, 'close')}
                  >
                    Close
                  </button>
                )}
                {door.state === 2 && (
                  <span className="ed-door-locked">—</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ExplorationDoors;
