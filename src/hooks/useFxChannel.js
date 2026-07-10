import { useCallback, useEffect, useRef, useState } from 'react';
import { useSyncedState } from './useSyncedState';
import { FX_FLASH_MS } from './useValueFlash';
import { newEntryUid } from '../utils/uid';
import { APP, globalKey } from '../sync/keys';

// Juice event channel (#1346, epic #1343). cnmh_fx_global holds a small ring
// buffer of structured one-shot events `{ id, kind, charId, ts }` — "ability
// used" and friends aren't legible state transitions on remote screens, so
// they broadcast here. Structured payloads on purpose: the session log is
// prose and stays un-parsed.
//
// Fire-and-forget by contract: a dropped or late event costs a glow, never
// correctness — nothing may gate on this channel. Event kinds stay small and
// enumerated ('ability' today).

export const FX_BUFFER_CAP = 10;
// Tighter than useRelayEvent's window: a bloom is a "right now" cue — an
// event even a few seconds old (reconnect replay, slow tab resume) reads as
// a ghost, not feedback.
export const FX_EVENT_FRESH_MS = 5_000;

// Subscribe to the channel (and get the emitter). `onEvent(evt)` fires at
// most once per event id per hook instance, for FRESH events only — the same
// guard discipline as useRelayEvent, applied per buffer entry:
//   - the buffer hydrated at mount (localStorage / FULL_STATE) is history;
//   - re-delivered ids (reconnect) are skipped;
//   - unseen-but-stale entries are consumed silently.
// The emitter's own device receives its event through the local subscriber
// notification like any peer — self-suppression is a non-goal (your own card
// blooming is fine).
export function useFxChannel(onEvent) {
  const [buffer, setBuffer] = useSyncedState(globalKey(APP.FX), []);
  const seenRef = useRef(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  // First render: every id already in the buffer is baseline, not an event.
  if (seenRef.current === null) {
    seenRef.current = new Set(
      (Array.isArray(buffer) ? buffer : []).map((e) => e?.id).filter(Boolean)
    );
  }

  useEffect(() => {
    for (const evt of Array.isArray(buffer) ? buffer : []) {
      if (!evt?.id || seenRef.current.has(evt.id)) continue;
      seenRef.current.add(evt.id);
      if (typeof evt.ts !== 'number' || Date.now() - evt.ts > FX_EVENT_FRESH_MS) continue;
      onEventRef.current?.(evt);
    }
    if (seenRef.current.size > 64) {
      seenRef.current = new Set([...seenRef.current].slice(-32));
    }
  }, [buffer]);

  const emitFx = useCallback(
    (event) => {
      setBuffer((cur) => [
        ...(Array.isArray(cur) ? cur : []).slice(-(FX_BUFFER_CAP - 1)),
        { id: newEntryUid(), ts: Date.now(), ...event },
      ]);
    },
    [setBuffer]
  );

  return { emitFx };
}

// Receiver helper: a short-lived bloom descriptor when a fresh 'ability'
// event lands for this character. Returns `{ key }` (key = event id — React-key
// the animated node so rapid re-uses restart the animation) and self-clears
// after FX_FLASH_MS. Consume as data-fx="bloom" (fx.css, accent recipe).
// null/undefined charId never matches (enemy portraits and the like).
export function useFxBloom(charId) {
  const [bloom, setBloom] = useState(null);
  const timerRef = useRef(null);

  useFxChannel(
    useCallback(
      (evt) => {
        if (!charId || evt.kind !== 'ability' || evt.charId !== charId) return;
        setBloom({ key: evt.id });
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setBloom(null), FX_FLASH_MS);
      },
      [charId]
    )
  );

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return bloom;
}

export default useFxChannel;
