import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '../contexts/SessionContext';
import { useSyncedState } from './useSyncedState';
import { RELAY } from '../sync/keys';
import {
  GROUPMOVEDONE_KEY, GROUP_MOVE_TIMEOUT_MS, buildGroupMoveRequest,
} from '../utils/groupMoveRelay';

// Dispatch state machine for the exploration GROUP move rail (#1823/#1825,
// epic #1822) — the DockExplorationPane's twin of useTokenMovement's single-
// mover machine, sized for a request that has no picker/plan stages of its
// own: one dispatch, one correlated `groupmovedone`, done.
//
//   const { dispatch, inFlight, results, clearResults } = useGroupMove();
//   dispatch(moverIds, target); // fires cnmh_groupmovereq_global
//
// ONE REQUEST AT A TIME (mirrors useTokenMovement's "one active plan"
// ruling): `dispatch` is a no-op while a previous request is still
// in flight, so a stray extra destination tap can't fork a second group
// mid-settle. The caller is expected to gate the tap itself (protocol floor,
// exploremove) — this hook only owns correlation + the in-flight guard.
//
// `results` holds the last SETTLED ack's `results[]` array (or null before
// the first dispatch / after `clearResults`); it stays populated across
// dispatches until the caller clears it or a new dispatch overwrites it, so
// a GM has a moment to read the outcome chips before they're superseded —
// "transient but inspectable" per the issue, not a toast that vanishes on
// its own timer.
//
// TIMEOUT: a late or dead bridge resolves to `results: []` (not null) after
// GROUP_MOVE_TIMEOUT_MS, so `inFlight` never wedges the caller's tap-gate
// open forever. `id` correlation (not `ts`, like the single-move rail) is
// this channel's own convention — see foundry-bridge/groupMove.js.
export function useGroupMove() {
  const { sendUpdate } = useSession();
  const [ack] = useSyncedState(GROUPMOVEDONE_KEY, null);
  const [inFlight, setInFlight] = useState(false);
  const [results, setResults] = useState(null);
  const pendingIdRef = useRef(null);
  const timerRef = useRef(null);

  const settle = useCallback((settledResults) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingIdRef.current = null;
    setInFlight(false);
    setResults(settledResults);
  }, []);

  useEffect(() => {
    if (!pendingIdRef.current || ack?.id !== pendingIdRef.current) return;
    settle(Array.isArray(ack.results) ? ack.results : []);
  }, [ack, settle]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const dispatch = useCallback((moverIds, target) => {
    if (pendingIdRef.current || !Array.isArray(moverIds) || moverIds.length < 2 || !target) return null;
    const req = buildGroupMoveRequest({ moverIds, target });
    pendingIdRef.current = req.id;
    setInFlight(true);
    setResults(null);
    timerRef.current = setTimeout(() => settle([]), GROUP_MOVE_TIMEOUT_MS);
    sendUpdate('global', RELAY.GROUPMOVEREQ, req);
    return req.id;
  }, [sendUpdate, settle]);

  const clearResults = useCallback(() => setResults(null), []);

  return { dispatch, inFlight, results, clearResults };
}

export default useGroupMove;
