import { useEffect, useRef } from 'react';
import { useSyncedState } from './useSyncedState';

// Only payloads stamped within this window count as live. Synced keys are
// persisted, so FULL_STATE on reconnect and localStorage rehydration re-deliver
// the LAST event ever sent — indistinguishable from a live one by id alone.
// (Same window as useDamageRelayAck: peers share a table/LAN, so clock skew is
// negligible next to 15s.)
export const RELAY_EVENT_FRESH_MS = 15_000;

// Event-consumption guard for event-shaped synced keys (#1354, shared with the
// #1346 fx channel): keys whose payload is a one-shot `{ id, ts, ... }` message
// (cnmh_dmgapply_global, cnmh_fx_global) rather than a state snapshot.
//
// Fires `onEvent(payload)` at most once per payload id, and only for payloads
// that are actually live:
//   - whatever hydrated synchronously at mount (bus state / localStorage) is
//     history, never an event — its id is consumed silently;
//   - later re-deliveries of a seen id (reconnect FULL_STATE) are skipped;
//   - unseen payloads older than RELAY_EVENT_FRESH_MS are consumed but not
//     fired (a stale event replayed onto a fresh mount).
//
// The latest `onEvent` is always called (ref-captured), so an inline closure
// over changing props is fine.
export function useRelayEvent(key, onEvent) {
  const [payload] = useSyncedState(key, null);
  const seenRef = useRef(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  // First render: the sync-hydrated value (if any) is baseline, not an event.
  if (seenRef.current === null) {
    seenRef.current = new Set(payload?.id ? [payload.id] : []);
  }

  useEffect(() => {
    if (!payload?.id || seenRef.current.has(payload.id)) return;
    seenRef.current.add(payload.id);
    if (seenRef.current.size > 32) {
      seenRef.current = new Set([...seenRef.current].slice(-16));
    }
    if (typeof payload.ts !== 'number' || Date.now() - payload.ts > RELAY_EVENT_FRESH_MS) return;
    onEventRef.current?.(payload);
  }, [payload]);
}

export default useRelayEvent;
