import { useEffect, useRef } from 'react';
import { useSession } from '../contexts/SessionContext';
import { useBridgeStatus } from './useBridgeStatus';
import { RELAY } from '../sync/keys';
import { MAP_TARGET_PROTOCOL } from '../utils/movement';

// The write `cnmh_action_<charId>` has never sent (#1749 epic body — a full
// grep of origin/main turned up the consumer, `foundry-bridge/targeting.js`,
// and nothing that ever produced the payload it consumes). This hook is that
// producer, composed alongside `useTargeting` by a caller that knows the
// action's `kind`/`sourceUid`:
//
//   const { targets, toggleTarget } = useTargeting(charId, order, opts);
//   useActionTargetSync(charId, targets, { kind: 'strike', sourceUid: ability.id });
//
// It does NOT live inside useTargeting itself — useTargeting is shared by
// several non-attack flows (save prompts, familiar maneuvers, skill actions)
// that have no `kind`/`sourceUid` to report, and threading those through
// every one of useTargeting's eight call sites is wave-2 RollSheet wiring,
// not this foundation. Passing no `kind` here is a no-op, so composing this
// hook is opt-in per caller.
//
// Cadence (OQ-3 ruling: "debounced-on-toggle"): every relay UPDATE makes the
// worker read/mutate/put the WHOLE session-state blob and broadcast it (the
// cost #1744's OQ-6 priced for pathpreview), so firing on every single toggle
// mid-deliberation is wasteful; firing only at confirm is nearly free but
// arrives after the app has already resolved the roll, buying nothing except
// a correct-looking chat card. ACTION_SYNC_DEBOUNCE_MS settles the write
// ~half a second after the LAST toggle in a burst — long enough that rapid
// multi-target taps coalesce into one write, short enough that the GM's
// canvas highlights while the player is still visibly deliberating.
export const ACTION_SYNC_DEBOUNCE_MS = 500;

// Gate on OQ-3's ACTIVE-COMBATANT-ONLY ruling: the BRIDGE decides whether a
// write reaches Foundry's canvas (only the active combatant's write does;
// everyone else's is app-local and harmless), never this hook — sending for
// a non-active charId is fine and deliberately NOT replicated here.
export function useActionTargetSync(charId, targets, { kind, sourceUid, enabled = true } = {}) {
  const { sendUpdate } = useSession();
  const { protocol } = useBridgeStatus();
  const timerRef = useRef(null);
  const lastSentKeyRef = useRef(null);
  const latestRef = useRef({ targets, kind, sourceUid });
  latestRef.current = { targets, kind, sourceUid };

  const eligible = enabled && !!charId && !!kind && (protocol ?? 0) >= MAP_TARGET_PROTOCOL;
  // Stable string key so effect deps don't churn on a `targets` array that's
  // re-created (but content-identical) every render — useTargeting's
  // `validTargets` is a fresh useMemo array on most renders. Scoped by charId
  // too, so switching the acting character never dedupes-away a write purely
  // because the new character happens to share the previous one's target set.
  const targetsKey = (targets || []).join('|');
  const dedupeKey = `${charId}::${targetsKey}`;

  useEffect(() => {
    if (!eligible) return undefined;
    if (dedupeKey === lastSentKeyRef.current) return undefined;

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      lastSentKeyRef.current = dedupeKey;
      const { targets: liveTargets, kind: liveKind, sourceUid: liveSourceUid } = latestRef.current;
      sendUpdate(charId, RELAY.ACTION, {
        kind: liveKind,
        sourceUid: liveSourceUid ?? null,
        targets: [...(liveTargets || [])],
        ts: Date.now(),
      });
    }, ACTION_SYNC_DEBOUNCE_MS);

    return () => clearTimeout(timerRef.current);
    // dedupeKey is the reactive proxy for `targets`' content + charId;
    // kind/sourceUid changing mid-debounce is picked up via latestRef without
    // re-arming the timer on their identity alone.
  }, [eligible, dedupeKey, charId, sendUpdate]);

  useEffect(() => () => clearTimeout(timerRef.current), []);
}

export default useActionTargetSync;
