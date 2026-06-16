import React from 'react';
import { useDoors } from '../../hooks/useDoors';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useTurnState } from '../../hooks/useTurnState';
import { useEncounter } from '../../hooks/useEncounter';

// Encounter-mode "Interact: open/close a door" (#435). The bridge already returns
// only the doors within reach of the actor's token (foundry-bridge/doors.js), so
// this just renders whatever's nearby and charges a 1-action Interact on toggle.
// Re-detects after each confirmed move (cnmh_movedone). Renders nothing when no
// door is in reach (or the bridge is offline) — silent like ExplorationDoors.
//
// Reuses the .granted-actions-section / .btn-encounter-use look of the other
// bespoke encounter sections in ActionsList (global CSS — no own stylesheet).

const DOOR_GLYPH = { 0: '🚪', 1: '🔓', 2: '🔒' };
const DOOR_LABEL = { 0: 'Closed', 1: 'Open', 2: 'Locked' };

const EncounterDoors = ({ charId, characterName }) => {
  const { spendActions } = useTurnState(charId);
  const { appendLog } = useEncounter();
  // The move relay stamps a fresh reqTs on every confirmed step; use it to
  // re-scan for doors after the actor moves.
  const [moveDone] = useSyncedState(`cnmh_movedone_${charId}`, null);
  const { doors, interactDoor } = useDoors(charId, { refreshTs: moveDone?.reqTs });

  if (doors.length === 0) return null;

  const handle = (wallId, op) => {
    interactDoor(wallId, op);
    spendActions(1, 'Interact (door)');
    appendLog({
      type: 'action',
      charId,
      text: `${characterName} ${op === 'open' ? 'opened' : 'closed'} a door (Interact, 1 act)`,
    });
  };

  return (
    <div className="granted-actions-section" aria-label="Door interaction">
      <h3 className="granted-actions-title">Interact</h3>
      {doors.map((door) => (
        <div key={door.wallId} className="granted-action-row">
          <span className="granted-action-name">
            <span aria-hidden="true">{DOOR_GLYPH[door.state] ?? '🚪'}</span>{' '}
            {DOOR_LABEL[door.state] ?? 'Door'} Door
          </span>
          {door.state === 0 && (
            <button
              className="btn-encounter-use"
              aria-label="Open door"
              onClick={() => handle(door.wallId, 'open')}
            >
              Open (1 act)
            </button>
          )}
          {door.state === 1 && (
            <button
              className="btn-encounter-use"
              aria-label="Close door"
              onClick={() => handle(door.wallId, 'close')}
            >
              Close (1 act)
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

export default EncounterDoors;
