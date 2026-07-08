// src/components/encounter/MoveActionSheet.jsx
// Command Sheet movement resolver (#415). Stride/Step are NOT dice actions — they
// drive the Foundry token via useTokenMovement + MoveGridPicker. Tapping a movement
// tile in the grid opens this bottom slide-up sheet (same Modal primitive the #412
// resolver uses) which mounts the real controller and charges actions exactly as
// the old TurnTrackerPanel Move UI did:
//   • Step   — one dedicated 5-ft action, then close.
//   • Stride — 1 action on the first step, +1 each time accumulated distance crosses
//              the character's Speed; the pad stays open to chain steps.
import React, { useState, useRef, useCallback, useEffect } from 'react';
import Modal from '../shared/Modal';
import MoveGridPicker from './MoveGridPicker';
import { useTokenMovement } from '../../hooks/useTokenMovement';
import { useTurnState } from '../../hooks/useTurnState';
import { useEncounter } from '../../hooks/useEncounter';
import { useCharacter } from '../../hooks/useCharacter';
import { needsNewStride } from '../../utils/movement';
import './MoveActionSheet.css';

const LABEL = { stride: 'Stride', step: 'Step' };

const MoveActionSheet = ({ character, moveType = 'stride', themeColor, onClose }) => {
  const charId = character.id;
  const { appendLog } = useEncounter();
  const { spendActions } = useTurnState(charId);

  // App-derived Speed (the SP1-SP3 spine, #1223). The app is AUTHORITATIVE for
  // the Stride budget: the Foundry actor doesn't model app-owned feats/gear
  // (worn-gear bonuses, armor Str waivers, Bulk encumbrance), so its speed is
  // only the fallback when the spine has nothing to derive (base-less docs).
  // Foundry stays authoritative for reachable squares; the parity note below
  // flags drift.
  const derivedSpeed = useCharacter(character)?.speed ?? null;

  // feetThisAction: distance walked under the current Stride action (resets each
  // time a new action is charged). Step ignores it.
  const [feetThisAction, setFeetThisAction] = useState(0);

  // requestMoveRefresh / cancelMove come from the hook below but are needed inside
  // onMoveDone (which the hook takes as input) — bridge via refs to break the cycle.
  const requestMoveRefreshRef = useRef(null);
  const cancelMoveRef = useRef(null);
  const speedRef = useRef(0);

  const handleMoveDone = useCallback((done) => {
    const stepFeet = done?.feetMoved ?? 5;
    appendLog({ type: 'action', charId, text: `${character.name} moved ${stepFeet} ft` });

    if (moveType === 'step') {
      spendActions(1, 'Step');
      cancelMoveRef.current?.();
      onClose?.();
      return;
    }

    // Stride: charge the 1st action on the 1st step, then one more each time the
    // running distance would cross the character's Speed. Budget precedence:
    // the app-derived total → Foundry's actor speed (via moveopts) → this step.
    const speed = derivedSpeed?.total || speedRef.current || stepFeet;
    const needNewAction = needsNewStride(feetThisAction, stepFeet, speed);
    if (needNewAction) {
      spendActions(1, 'Stride');
      setFeetThisAction(stepFeet);
    } else {
      setFeetThisAction(feetThisAction + stepFeet);
    }
    requestMoveRefreshRef.current?.('stride'); // keep the pad open to chain steps
  }, [feetThisAction, spendActions, appendLog, charId, character.name, moveType, onClose, derivedSpeed?.total]);

  const {
    stage,
    pickerOpts,
    requestMove,
    requestMoveRefresh,
    confirmMove,
    cancelMove,
  } = useTokenMovement(charId, { onMoveDone: handleMoveDone });

  requestMoveRefreshRef.current = requestMoveRefresh;
  cancelMoveRef.current = cancelMove;
  speedRef.current = pickerOpts?.speed || speedRef.current;

  // The tile already chose Stride vs Step, so request reachable squares on open.
  const startedRef = useRef(false);
  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      requestMove(moveType);
    }
  }, [requestMove, moveType]);

  const handleClose = () => {
    cancelMove();
    onClose?.();
  };

  return (
    <Modal
      isOpen
      onClose={handleClose}
      title={LABEL[moveType] || 'Move'}
      themeColor={themeColor}
      maxWidth="420px"
      placement="bottom"
      highZ
    >
      <div className="mas-body">
        {moveType === 'stride' && (
          <div className="mas-dist" aria-label="Stride distance">
            {feetThisAction}/{derivedSpeed?.total || pickerOpts?.speed || speedRef.current || 0} ft
          </div>
        )}

        {/* Parity check (#1223): Foundry's actor speed vs the app spine — a
            cheap drift detector. The sheet's number is what the pad charges
            against; the GM fixes the Foundry actor if it's the stale side. */}
        {pickerOpts?.speed != null &&
          derivedSpeed?.total != null &&
          derivedSpeed.total > 0 &&
          pickerOpts.speed !== derivedSpeed.total && (
          <div className="mas-parity" role="note" aria-label="Speed parity note">
            Using the sheet&apos;s {derivedSpeed.total} ft; Foundry&apos;s actor says {pickerOpts.speed} ft.
          </div>
        )}

        {stage === 'awaiting-opts' && (
          <div className="mas-status">Calculating reachable squares…</div>
        )}

        {stage === 'picking' && pickerOpts && (
          <MoveGridPicker
            origin={pickerOpts.origin}
            reachable={pickerOpts.reachable}
            blocked={pickerOpts.blocked}
            radius={1}
            stepMode
            cancelLabel="Done"
            cancelDisabled={pickerOpts.originOccupied}
            cancelHint="Step off your ally's square to stop."
            onSelect={confirmMove}
            onCancel={handleClose}
          />
        )}

        {stage === 'awaiting-done' && <div className="mas-status">Moving…</div>}
      </div>
    </Modal>
  );
};

export default MoveActionSheet;
