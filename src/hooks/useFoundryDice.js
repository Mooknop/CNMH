import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '../contexts/SessionContext';
import { useSyncedState } from './useSyncedState';
import { useBridgeStatus } from './useBridgeStatus';
import { RELAY } from '../sync/keys';
import {
  ROLLDONE_KEY, ROLL_PROTOCOL, ROLL_TIMEOUT_MS, buildRollRequest,
} from '../utils/diceRelay';

// Delegate a raw dice roll to Foundry (#1490 S2 — the dice-tower rail).
//
//   const { roll, rolling, available } = useFoundryDice();
//   const ack = await roll({ formula: '1d20', flavor, charId });
//
// `roll` resolves with the matching cnmh_rolldone_global ack, or null when the
// roll can't be used (nack, timeout, unavailable, or a request already in
// flight) — null always means "fall back to manual entry". Correlation is by
// unique request id, so the persisted last-ack a mount hydrates with is inert,
// and no freshness window is needed.
//
// `available` gates on live Foundry presence AND the bridge protocol that
// introduced the rail — an older module keeps working everywhere else and
// simply never surfaces a roll button.
export function useFoundryDice() {
  const { sendUpdate, foundryConnected } = useSession();
  const { protocol } = useBridgeStatus();
  const [ack] = useSyncedState(ROLLDONE_KEY, null);
  const [rolling, setRolling] = useState(false);
  const pendingRef = useRef(null); // { id, resolve, timer }

  const available = !!foundryConnected && (protocol ?? 0) >= ROLL_PROTOCOL;

  const settle = useCallback((result) => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    clearTimeout(pending.timer);
    setRolling(false);
    pending.resolve(result);
  }, []);

  // Only the ack matching the in-flight id settles the promise; ok:false is an
  // explicit "roll in the app instead" nack from the bridge.
  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending || ack?.id !== pending.id) return;
    settle(ack.ok ? ack : null);
  }, [ack, settle]);

  // Unmount with a request in flight: resolve null so awaiters never hang.
  useEffect(() => () => settle(null), [settle]);

  const roll = useCallback(({ formula = '1d20', flavor = '', charId = null } = {}) => {
    if (!available || pendingRef.current) return Promise.resolve(null);
    const req = buildRollRequest({ charId, formula, flavor });
    setRolling(true);
    return new Promise((resolve) => {
      pendingRef.current = {
        id: req.id,
        resolve,
        timer: setTimeout(() => settle(null), ROLL_TIMEOUT_MS),
      };
      sendUpdate('global', RELAY.ROLLREQ, req);
    });
  }, [available, sendUpdate, settle]);

  return { roll, rolling, available };
}

export default useFoundryDice;
