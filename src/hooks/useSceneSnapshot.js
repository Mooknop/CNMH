import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '../contexts/SessionContext';
import { useSyncedState } from './useSyncedState';
import { useBridgeStatus } from './useBridgeStatus';
import { RELAY } from '../sync/keys';
import {
  SNAPDONE_KEY, SNAP_PROTOCOL, PING_PROTOCOL, SNAP_TIMEOUT_MS,
  buildSnapshotRequest, buildPingPoint,
} from '../utils/snapshotRelay';

// Ask the GM's Foundry client to photograph the battlefield (#1573 B1/B2):
//
//   const { request, requesting, available, canPing, ping } = useSceneSnapshot();
//   const snap = await request();          // { url, capture, worldRect, gridSize } | null
//   ping({ x, y, sceneId: snap.capture.sceneId });
//
// `request` resolves with the ack payload, or null (nack, timeout, unavailable,
// or a request already in flight) — null means "tell the player no snapshot is
// available". Correlation is by unique request id, so the persisted last ack a
// mount hydrates with is inert.
//
// `available` gates on live Foundry presence AND the capture protocol; `canPing`
// additionally needs the ping channel (protocol 12) — a protocol-11 bridge can
// still show a snapshot, just not place the pulse.
export function useSceneSnapshot() {
  const { sendUpdate, foundryConnected } = useSession();
  const { protocol } = useBridgeStatus();
  const [ack] = useSyncedState(SNAPDONE_KEY, null);
  const [requesting, setRequesting] = useState(false);
  const pendingRef = useRef(null); // { id, resolve, timer }

  const available = !!foundryConnected && (protocol ?? 0) >= SNAP_PROTOCOL;
  const canPing = !!foundryConnected && (protocol ?? 0) >= PING_PROTOCOL;

  const settle = useCallback((result) => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    clearTimeout(pending.timer);
    setRequesting(false);
    pending.resolve(result);
  }, []);

  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending || ack?.id !== pending.id) return;
    settle(ack.ok ? ack : null);
  }, [ack, settle]);

  // Unmount with a request in flight: resolve null so awaiters never hang.
  useEffect(() => () => settle(null), [settle]);

  const request = useCallback(() => {
    if (!available || pendingRef.current) return Promise.resolve(null);
    const req = buildSnapshotRequest();
    setRequesting(true);
    return new Promise((resolve) => {
      pendingRef.current = {
        id: req.id,
        resolve,
        timer: setTimeout(() => settle(null), SNAP_TIMEOUT_MS),
      };
      sendUpdate('global', RELAY.SNAPREQ, req);
    });
  }, [available, sendUpdate, settle]);

  // Fire-and-forget: Foundry broadcasts the pulse, so there's no ack to await.
  const ping = useCallback((point) => {
    if (!canPing) return false;
    sendUpdate('global', RELAY.PINGPOINT, buildPingPoint(point));
    return true;
  }, [canPing, sendUpdate]);

  return { request, requesting, available, canPing, ping };
}

export default useSceneSnapshot;
