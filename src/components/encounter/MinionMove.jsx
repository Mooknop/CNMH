import React, { useRef, useCallback, useState } from 'react';
import { useTokenMovement } from '../../hooks/useTokenMovement';
import { useMinionActors } from '../../hooks/useMinionActors';
import { minionTurnId } from '../../utils/minionUtils';
import MoveGridPicker from './MoveGridPicker';
import './MinionMove.css';

// Minion token movement (#362). Reuses the same movereq→moveopts→moveconfirm→
// movedone state machine as PCs (useTokenMovement) and exploration movement
// (ExplorationMove), keyed to the minion's `<ownerId>-<role>` id. The bridge
// resolves that id to the companion/familiar's own Foundry token.
//
// Lives in the minion's modal, so it opens on an explicit "Move" button rather
// than auto-opening like the always-on exploration pad. Tapping a direction
// auto-confirms a 5-ft step and re-probes the neighbours so steps chain; a
// running distance tally is shown and "Done" closes the pad.
//
// No action accounting yet: in PF2e a minion moves on actions it was granted via
// Command an Animal. That granted-action economy is a separate ticket/epic; when
// it lands, charge the minion's Stride here in handleMoveDone (see #362).
const MinionMove = ({ ownerId, role }) => {
  const { linkFor } = useMinionActors();
  const link = linkFor(ownerId, role);

  const [feetTotal, setFeetTotal] = useState(0);

  // Ref so the move-done callback can re-probe without a circular dependency.
  const requestMoveRefreshRef = useRef(null);

  const handleMoveDone = useCallback((payload) => {
    const feet = payload?.feetMoved ?? 0;
    setFeetTotal((f) => f + feet);
    requestMoveRefreshRef.current?.('stride'); // keep the pad open to chain steps
  }, []);

  const {
    stage,
    pickerOpts,
    isRefreshing,
    requestMove,
    requestMoveRefresh,
    confirmMove,
    cancelMove,
  } = useTokenMovement(minionTurnId(ownerId, role), { onMoveDone: handleMoveDone });

  requestMoveRefreshRef.current = requestMoveRefresh;

  const handleDone = useCallback(() => {
    setFeetTotal(0);
    cancelMove();
  }, [cancelMove]);

  // Only the owning player/GM can move a minion that's linked and on the scene.
  if (!link || !link.onScene) return null;

  const idle = stage === null;

  return (
    <div className="mm-panel">
      {idle && (
        <button
          type="button"
          className="btn-secondary mm-move-btn"
          onClick={() => requestMove('stride')}
          aria-label={`Move ${link.name}`}
          title={`Move ${link.name}`}
        >
          Move
        </button>
      )}

      {stage === 'awaiting-opts' && !isRefreshing && (
        <div className="mm-status">Calculating reachable squares…</div>
      )}

      {(stage === 'picking' || (isRefreshing && pickerOpts)) && (
        <>
          {feetTotal > 0 && (
            <div className="mm-distance" aria-label="Distance moved">
              Moved <strong>{feetTotal} ft</strong>
            </div>
          )}
          {isRefreshing && <div className="mm-status mm-status--refresh">Updating…</div>}
          <MoveGridPicker
            origin={pickerOpts.origin}
            reachable={pickerOpts.reachable}
            blocked={pickerOpts.blocked}
            radius={1}
            stepMode
            cancelLabel="Done"
            onSelect={confirmMove}
            onCancel={handleDone}
          />
        </>
      )}

      {stage === 'awaiting-done' && <div className="mm-status">Moving…</div>}
    </div>
  );
};

export default MinionMove;
