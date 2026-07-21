import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '../contexts/SessionContext';
import { useSyncedState } from './useSyncedState';
import { useBridgeStatus } from './useBridgeStatus';
import { RELAY } from '../sync/keys';
import {
  STRIKEDONE_KEY, STRIKE_PROTOCOL, STRIKE_TIMEOUT_MS, buildStrikeRequest,
} from '../utils/strikeRelay';

// Execute an NPC strike natively in Foundry (#1531 S3 — the dock's strike
// rail). Same promise/ack shape as useFoundryDice:
//
//   const { strike, striking, available } = useFoeStrike();
//   const ack = await strike({ entryId, actionIndex, variant, damage, targets });
//
// `strike` resolves with the matching cnmh_strikedone_global ack, or null
// (nack, timeout, unavailable, or a request already in flight) — null means
// "the roll may still have landed in Foundry chat; read it there". Correlation
// is by unique request id, so the persisted last-ack a mount hydrates with is
// inert. `available` gates on live Foundry presence AND the protocol that
// introduced the rail — an older module simply never grows buttons.
export function useFoeStrike() {
  const { sendUpdate, foundryConnected } = useSession();
  const { protocol } = useBridgeStatus();
  const [ack] = useSyncedState(STRIKEDONE_KEY, null);
  const [striking, setStriking] = useState(false);
  const pendingRef = useRef(null); // { id, resolve, timer }

  const available = !!foundryConnected && (protocol ?? 0) >= STRIKE_PROTOCOL;

  const settle = useCallback((result) => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    clearTimeout(pending.timer);
    setStriking(false);
    pending.resolve(result);
  }, []);

  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending || ack?.id !== pending.id) return;
    settle(ack.ok ? ack : null);
  }, [ack, settle]);

  // Unmount with a request in flight: resolve null so awaiters never hang.
  useEffect(() => () => settle(null), [settle]);

  const strike = useCallback((params) => {
    if (!available || pendingRef.current) return Promise.resolve(null);
    const req = buildStrikeRequest(params);
    setStriking(true);
    return new Promise((resolve) => {
      pendingRef.current = {
        id: req.id,
        resolve,
        timer: setTimeout(() => settle(null), STRIKE_TIMEOUT_MS),
      };
      sendUpdate('global', RELAY.STRIKEREQ, req);
    });
  }, [available, sendUpdate, settle]);

  return { strike, striking, available };
}

export default useFoeStrike;
