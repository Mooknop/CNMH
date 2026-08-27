import { useCallback, useEffect, useRef, useState } from 'react';
import { useSceneSnapshot } from './useSceneSnapshot';
import { useBridgeStatus } from './useBridgeStatus';
import { MOVE_SNAP_TIMEOUT_MS, PARTY_MAP_PROTOCOL } from '../utils/snapshotRelay';

// Party-framed snapshot state for the GM dock's exploration pane (#1808) —
// the sibling of `useMoverMapSurface` for the OTHER capture shape the bridge
// serves (#1807, protocol 21). Same three-state machine, same
// request/timeout/broadcast-adoption dance; only the request flag and the
// adoption predicate differ.
//
//   const { status, snapshot, tokens, eligible, refresh } =
//     usePartyMapSurface({ active });
//
// status: 'idle' | 'loading' | 'ready' | 'unavailable'
//
// WHY A SIBLING RATHER THAN A FLAG ON useMoverMapSurface: that hook keys its
// whole contract on a `moverId` — it requests one, and adopts a later ack only
// when `ack.moverId === charId`. A party ack carries `moverId: null` by
// design (that null, plus a present `tokens[]`, IS how the three capture
// shapes are told apart — see utils/snapshotRelay.js). Threading "sometimes
// there is no mover" through every branch there would have made the
// mover-centered path harder to read for zero shared code; the two hooks are
// each ~40 lines of their own state machine over the same primitive.
//
// ADOPTION: while `active`, ANY ok ack carrying `tokens` is adopted — our own
// correlated reply and, crucially, the bridge's unsolicited post-`movedone`
// rebroadcast, which is party-framed while the play mode is 'exploration' with
// no combat active. That broadcast carries no request id a promise could ever
// settle against, so watching the raw synced value is the only way to see it —
// and it is what makes the dock's map self-heal as the party walks, with no
// re-request per move.
//
// `active` is the caller's "this surface is the one on screen" flag: a fresh
// `snapreq { party: true }` fires every time it flips false→true, not on every
// render. The same effect re-fires when the bridge becomes eligible while the
// pane is already open (a mid-session Foundry connect), so the GM never has to
// leave and re-enter the pane to get a map.
//
// Never strands the caller: `ok:false`, a timeout, an unavailable bridge, or a
// protocol below PARTY_MAP_PROTOCOL all resolve to 'unavailable' with
// `eligible` saying which of those it was — there is deliberately NO abstract-
// grid fallback for the party view (epic #1804: per-PC grids defeat the point
// of one shared control surface), so the pane just says the bridge is needed.
export function usePartyMapSurface({ active = false } = {}) {
  const { request, cancel, ack, available } = useSceneSnapshot();
  const { protocol } = useBridgeStatus();
  const [status, setStatus] = useState('idle');
  const [snapshot, setSnapshot] = useState(null);
  const wasReadyRef = useRef(false);
  // Guards useSceneSnapshot's ONE-in-flight slot: a second request() while one
  // is outstanding is silently a no-op, so an explicit refresh cancels first
  // (see useSceneSnapshot's doc comment).
  const inFlightRef = useRef(false);

  const eligible = !!available && (protocol ?? 0) >= PARTY_MAP_PROTOCOL;

  const capture = useCallback(() => {
    if (inFlightRef.current) cancel();
    let settled = false;
    inFlightRef.current = true;
    setStatus('loading');

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      inFlightRef.current = false;
      setStatus('unavailable');
    }, MOVE_SNAP_TIMEOUT_MS);

    request({ party: true }).then((snap) => {
      if (settled) return;
      settled = true;
      inFlightRef.current = false;
      clearTimeout(timer);
      if (snap) {
        setSnapshot(snap);
        setStatus('ready');
      } else {
        setStatus('unavailable');
      }
    });

    return () => {
      // The pane closed (or the GM re-requested) before the answer landed:
      // free the in-flight slot so the NEXT request isn't swallowed.
      if (!settled) {
        settled = true;
        inFlightRef.current = false;
        cancel();
      }
      clearTimeout(timer);
    };
  }, [request, cancel]);

  // Fires on entry (false→true) and on the bridge becoming eligible while
  // already open. `capture` is stable as long as useSceneSnapshot's callbacks
  // are, so this is not a per-render request.
  const ready = !!active && eligible;
  useEffect(() => {
    const entering = ready && !wasReadyRef.current;
    wasReadyRef.current = ready;
    if (!entering) return undefined;
    return capture();
  }, [ready, capture]);

  // Not eligible at all — say so instead of spinning forever on 'idle'.
  useEffect(() => {
    if (active && !eligible) setStatus('unavailable');
  }, [active, eligible]);

  // Adopt any party-shaped ack while active (see ADOPTION above). `tokens`
  // present is the discriminator: a mover-centered or legacy GM-view ack
  // landing on the same channel must never replace the party frame.
  useEffect(() => {
    if (!ready || !ack?.ok || !Array.isArray(ack.tokens)) return;
    setSnapshot(ack);
    setStatus('ready');
  }, [ready, ack]);

  // The last frame is deliberately NOT cleared while a new capture is in
  // flight: the map IS the pane, and blanking it on every refresh would
  // flicker the whole surface. The caller shows a 'loading' note over the
  // stale frame instead.
  const refresh = useCallback(() => { capture(); }, [capture]);

  return {
    status,
    snapshot,
    tokens: Array.isArray(snapshot?.tokens) ? snapshot.tokens : [],
    eligible,
    refresh,
  };
}

export default usePartyMapSurface;
