import { useEffect, useRef, useState } from 'react';
import { useSceneSnapshot } from './useSceneSnapshot';
import { MOVE_SNAP_TIMEOUT_MS } from '../utils/snapshotRelay';

// Map-mode snapshot state for the destination-tap movement flow (#1744 S4).
// A thin state machine over useSceneSnapshot's mover-centered request, so
// MoveActionSheet (and future map-mode surfaces, #1744 S7) don't each
// reimplement the entering/loading/timeout/broadcast-adoption dance.
//
//   const { status, snapshot } = useMoverMapSurface(charId, { active, radiusFeet });
//
// status: 'idle' | 'loading' | 'ready' | 'unavailable'
//
// `active` is the caller's "map surface is the one currently shown" flag —
// a fresh `snapreq` fires every time it flips false→true ("on entering", per
// the epic's design sketch), not on every render. `radiusFeet` should be
// 1.5× the caller's best-known Speed (undefined lets the bridge default to
// 1.5× the actor's own Speed instead — see snapshotRelay.js).
//
// Two independent paths feed `snapshot`/`status`:
//   1. The correlated reply to OUR OWN request (settles the promise below).
//   2. Any later ack naming this `moverId` while `active` — covers the
//      bridge's unsolicited post-movedone rebroadcast, which carries no
//      request id path 1 could ever correlate against (see snapshotRelay.js).
// Both are harmless to run together: an ack that satisfies path 1 also
// satisfies path 2, so the second effect below just re-applies the same
// state redundantly in that case.
//
// Never strands the caller: `ok:false`, a timeout, or an unavailable bridge
// all resolve to 'unavailable' — the caller's job is to fall back to the
// abstract grid, exactly as MoveActionSheet does.
export function useMoverMapSurface(charId, { active = false, radiusFeet } = {}) {
  const { request, cancel, ack } = useSceneSnapshot();
  const [status, setStatus] = useState('idle');
  const [snapshot, setSnapshot] = useState(null);
  const wasActiveRef = useRef(false);

  useEffect(() => {
    const entering = !!active && !wasActiveRef.current;
    wasActiveRef.current = !!active;
    if (!entering || !charId) return undefined;

    let settled = false;
    setStatus('loading');
    setSnapshot(null);

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      setStatus('unavailable');
    }, MOVE_SNAP_TIMEOUT_MS);

    request({ moverId: charId, radiusFeet }).then((snap) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (snap) {
        setSnapshot(snap);
        setStatus('ready');
      } else {
        setStatus('unavailable');
      }
    });

    return () => {
      // The player left map mode (or the sheet closed) before the GM client
      // answered: cancel() frees useSceneSnapshot's one-in-flight slot so
      // the NEXT entry's request() isn't silently swallowed by "already
      // pending" — see useSceneSnapshot's doc comment.
      if (!settled) cancel();
      settled = true;
      clearTimeout(timer);
    };
  }, [active, charId, radiusFeet, request, cancel]);

  useEffect(() => {
    if (!active || !ack || ack.moverId !== charId || !ack.ok) return;
    setSnapshot(ack);
    setStatus('ready');
  }, [active, ack, charId]);

  return { status, snapshot };
}

export default useMoverMapSurface;
