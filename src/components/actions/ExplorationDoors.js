import React, { useEffect, useCallback } from 'react';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useSession } from '../../contexts/SessionContext';
import './ExplorationDoors.css';

const DOOR_STATE_LABEL = { 0: 'Closed', 1: 'Open', 2: 'Locked' };

// Per-state door glyph. Closed/locked share the solid door; open shows the ajar
// door. Kept as emoji so the separate Claude Design pass can swap in art freely.
const DOOR_GLYPH = { 0: '🚪', 1: '🔓', 2: '🔒' };

// Renders nearby doors for a character in exploration mode. Detection is silent:
// it sends a doorreq when it mounts and again when moveDoneTs changes (the
// player moved). No manual button — if we're connected to a token, adjacent
// doors just appear.

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
      </div>

      {doors.length === 0 ? (
        <p className="ed-empty">No doors detected nearby.</p>
      ) : (
        <ul className="ed-list">
          {doors.map((door) => (
            <li
              key={door.wallId}
              className={`ed-door ed-door--${door.state}`}
            >
              <span
                className="ed-door-icon"
                key={door.state}
                aria-hidden="true"
              >
                {DOOR_GLYPH[door.state] ?? '🚪'}
              </span>
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
