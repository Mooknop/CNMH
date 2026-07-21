import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '../contexts/SessionContext';
import { useSyncedState } from './useSyncedState';
import { useBridgeStatus } from './useBridgeStatus';
import { RELAY } from '../sync/keys';
import {
  CASTDONE_KEY, CAST_PROTOCOL, CAST_TIMEOUT_MS, buildCastRequest,
} from '../utils/castRelay';

// Cast an NPC spell natively in Foundry (#1531 S4 — the dock's cast rail).
// Same promise/ack shape as useFoeStrike/useFoundryDice:
//
//   const { cast, casting, available } = useFoeCast();
//   const ack = await cast({ entryId, entryItemId, spellId, rank });
//
// `cast` resolves with the matching cnmh_castdone_global ack, or null (nack,
// timeout, unavailable, in-flight) — null means "cast it from the Foundry
// sheet; the slot may or may not have been spent, check chat". `available`
// gates on live Foundry presence AND the protocol that introduced the rail.
export function useFoeCast() {
  const { sendUpdate, foundryConnected } = useSession();
  const { protocol } = useBridgeStatus();
  const [ack] = useSyncedState(CASTDONE_KEY, null);
  const [casting, setCasting] = useState(false);
  const pendingRef = useRef(null); // { id, resolve, timer }

  const available = !!foundryConnected && (protocol ?? 0) >= CAST_PROTOCOL;

  const settle = useCallback((result) => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    clearTimeout(pending.timer);
    setCasting(false);
    pending.resolve(result);
  }, []);

  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending || ack?.id !== pending.id) return;
    settle(ack.ok ? ack : null);
  }, [ack, settle]);

  // Unmount with a request in flight: resolve null so awaiters never hang.
  useEffect(() => () => settle(null), [settle]);

  const cast = useCallback((params) => {
    if (!available || pendingRef.current) return Promise.resolve(null);
    const req = buildCastRequest(params);
    setCasting(true);
    return new Promise((resolve) => {
      pendingRef.current = {
        id: req.id,
        resolve,
        timer: setTimeout(() => settle(null), CAST_TIMEOUT_MS),
      };
      sendUpdate('global', RELAY.CASTREQ, req);
    });
  }, [available, sendUpdate, settle]);

  return { cast, casting, available };
}

export default useFoeCast;
