import React, { useRef, useEffect, useCallback } from 'react';
import { usePlayMode } from '../../hooks/usePlayMode';
import { useTokenMovement } from '../../hooks/useTokenMovement';
import MoveGridPicker from '../encounter/MoveGridPicker';
import './ExplorationMove.css';

// Exploration-mode token movement panel. When the GM enables movement and the
// effective mode is 'exploration', a player can move their Foundry token freely
// at full speed with no action cost. The grid opens automatically (no
// preliminary "Move Token" button): selecting a square auto-confirms the move
// and immediately refreshes the grid from the new origin so moves can chain in
// real time. Cancel re-requests a fresh grid rather than closing for good.

const ExplorationMove = ({ charId, onMoveDone }) => {
  const { mode, moveEnabled } = usePlayMode();

  // Use a ref so the internal callback can call requestMoveRefresh without a
  // circular dependency. Also calls the optional onMoveDone prop so parent
  // components (e.g. ExplorationTab) know when a move completes.
  const requestMoveRefreshRef = useRef(null);

  const handleMoveDone = useCallback((payload) => {
    requestMoveRefreshRef.current?.('stride');
    onMoveDone?.(payload);
  }, [onMoveDone]);

  const {
    stage,
    pickerOpts,
    isRefreshing,
    requestMove,
    requestMoveRefresh,
    confirmMove,
    cancelMove,
  } = useTokenMovement(charId, { onMoveDone: handleMoveDone });

  requestMoveRefreshRef.current = requestMoveRefresh;

  // Auto-open the grid whenever movement is idle — on mount and again after a
  // Cancel — so the controls are always open when player movement is enabled.
  // Gated on !isRefreshing so it never fires mid chain-refresh. requestMove is
  // recreated each render, so reach it through a ref to keep this effect keyed
  // only on the idle transition.
  const requestMoveRef = useRef(null);
  requestMoveRef.current = requestMove;
  const active = mode === 'exploration' && moveEnabled;
  useEffect(() => {
    if (active && stage === null && !isRefreshing) {
      requestMoveRef.current?.('stride');
    }
  }, [active, stage, isRefreshing]);

  if (!active) return null;

  return (
    <div className="em-panel">
      {stage === 'awaiting-opts' && !isRefreshing && (
        <div className="em-status">Calculating reachable squares…</div>
      )}

      {(stage === 'picking' || (isRefreshing && pickerOpts)) && (
        <>
          {isRefreshing && <div className="em-status em-status--refresh">Updating…</div>}
          <MoveGridPicker
            origin={pickerOpts.origin}
            reachable={pickerOpts.reachable}
            blocked={pickerOpts.blocked}
            maxFeet={pickerOpts.maxFeet}
            onSelect={confirmMove}
            onCancel={cancelMove}
          />
        </>
      )}

      {stage === 'awaiting-done' && (
        <div className="em-status">Moving…</div>
      )}
    </div>
  );
};

export default ExplorationMove;
