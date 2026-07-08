import React, { useRef, useEffect, useCallback, useState } from 'react';
import { usePlayMode } from '../../hooks/usePlayMode';
import { useGmAuth } from '../../hooks/useGmAuth';
import { useTokenMovement } from '../../hooks/useTokenMovement';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useCharacter } from '../../hooks/useCharacter';
import { useContent } from '../../contexts/ContentContext';
import { formatSpeedBreakdown } from '../../utils/speed';
import MoveGridPicker from '../encounter/MoveGridPicker';
import './ExplorationMove.css';

// Exploration-mode token movement panel. When the GM enables movement and the
// effective mode is 'exploration', a player walks their Foundry token one 5-ft
// step at a time via an 8-direction D-pad with no action cost. The pad opens
// automatically (no preliminary "Move Token" button): tapping a direction
// auto-confirms the step and immediately re-probes the 8 neighbours from the new
// position so steps chain in real time. A running total of distance walked is
// shown; "Done" resets it (the pad stays open while movement is enabled).

const ExplorationMove = ({ charId, onMoveDone }) => {
  const { mode, moveEnabled } = usePlayMode();
  const { isGm } = useGmAuth();
  const [feetTotal, setFeetTotal] = useState(0);
  const [, setExploreDist] = useSyncedState('cnmh_exploredist_global', 0);
  // App-derived Speed (#1223) — context for the walk (exploration steps carry
  // no action cost, but pacing math reads the character's real speed). The
  // grid itself stays Foundry-authoritative. Hidden when the roster has no
  // matching character (e.g. a bare charId in tests/sandbox setups).
  const { characters } = useContent();
  const character = (Array.isArray(characters) ? characters : []).find((c) => c.id === charId) || null;
  const derivedSpeed = useCharacter(character)?.speed ?? null;

  // Use a ref so the internal callback can call requestMoveRefresh without a
  // circular dependency. Also calls the optional onMoveDone prop so parent
  // components (e.g. ExplorationTab) know when a move completes.
  const requestMoveRefreshRef = useRef(null);

  const handleMoveDone = useCallback((payload) => {
    const feet = payload?.feetMoved ?? 0;
    setFeetTotal((f) => f + feet);
    if (isGm && feet > 0) setExploreDist((d) => d + feet);
    requestMoveRefreshRef.current?.('stride');
    onMoveDone?.(payload);
  }, [onMoveDone, isGm, setExploreDist]);

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

  // "Done" resets the local tally; the GM also zeroes the shared tally (the
  // ExplorationTimeControl's Apply does this too, but Done after not applying
  // a suggestion should also clean it up).
  const handleDone = useCallback(() => {
    setFeetTotal(0);
    if (isGm) setExploreDist(0);
    cancelMove();
  }, [cancelMove, isGm, setExploreDist]);

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
          {derivedSpeed && derivedSpeed.total > 0 && (
            <div
              className="em-speed"
              aria-label="Derived speed"
              title={formatSpeedBreakdown(derivedSpeed)}
            >
              Speed <strong>{derivedSpeed.total} ft</strong>
            </div>
          )}
          {feetTotal > 0 && (
            <div className="em-distance" aria-label="Distance walked">
              Moved <strong>{feetTotal} ft</strong>
            </div>
          )}
          {isRefreshing && <div className="em-status em-status--refresh">Updating…</div>}
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
            onCancel={handleDone}
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
