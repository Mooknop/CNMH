import { useEffect, useRef } from 'react';
import { useAura } from './useAura';
import { useSession } from '../contexts/SessionContext';
import { useBridgeStatus } from './useBridgeStatus';
import { useGmAuth } from './useGmAuth';
import { RELAY } from '../sync/keys';
import { AURA_PROTOCOL, buildAuraSet } from '../utils/auraRelay';
import { auraProfile } from '../utils/kineticAura';

// Mirrors a kineticist's app-only aura activation (`useAura`,
// `cnmh_aura_<charId>`) to Foundry as `auraset` (#1733 S1 app half). A
// mirror observer rather than per-call-site sends: EVERY writer of the
// app-only aura key — Channel Elements on cast-confirm (`useAuraGate`),
// Dismiss (StatsBlock / TurnTrackerPanel), the KO sweep (`useAuraKoSweep`),
// a GM toggle via `liveStateRegistry`, GM CharacterStateModal's
// clear-combat — mutates that one key, so watching it here covers all of
// them, including future writers, with no call-site audit.
//
// GM-only writer (mirrors `useAuraKoSweep`) so exactly one device mirrors;
// gated on `foundryConnected` + bridge protocol >= AURA_PROTOCOL, exactly
// the `useSceneSnapshot` idiom. No authored radius (`auraProfile` returns
// null) means this NEVER sends — #1733 ruling 2, no fallback radius — the
// app-only key stays the only thing that changes.
//
// Sends only on an actual transition (rising edge / feet change / falling
// edge), not on every render, tracked via `lastSentRef`. The gate itself
// re-arms that memory: dropping below protocol (or Foundry disconnecting)
// clears it, so the NEXT time the gate opens — a bridge reconnect, a
// protocol catch-up — the current state resends unconditionally. That is
// what re-syncs a bridge restart mid-aura, per the README's `auraset` row.
export function useAuraRegionSync(character) {
  const charId = character?.id || 'none';
  const { active } = useAura(charId);
  const { sendUpdate, foundryConnected } = useSession();
  const { protocol } = useBridgeStatus();
  const { isGm } = useGmAuth();

  const profile = auraProfile(character);
  const ready = !!isGm && !!foundryConnected && (protocol ?? 0) >= AURA_PROTOCOL;

  // What we last mirrored: { active, feet } | null. Reset whenever the gate
  // closes so the next open resends from scratch rather than trusting stale
  // memory of a state Foundry never actually received (or received from a
  // bridge instance that has since restarted).
  const lastSentRef = useRef(null);

  useEffect(() => {
    if (!ready) {
      lastSentRef.current = null;
      return;
    }
    // No authored size — never send, active or not (#1733 ruling 2).
    if (!profile) return;

    const desired = active ? { active: true, feet: profile.feet } : { active: false, feet: null };
    const last = lastSentRef.current;
    const unchanged = !!last
      && last.active === desired.active
      && (!desired.active || last.feet === desired.feet);
    if (unchanged) return;

    sendUpdate(charId, RELAY.AURASET, buildAuraSet({
      active: desired.active,
      feet: desired.active ? profile.feet : undefined,
      label: profile.label,
    }));
    lastSentRef.current = desired;
    // `profile` is a fresh object every render (auraProfile isn't memoized) —
    // depending on it re-runs the effect each render, but the `unchanged`
    // check above makes that a no-op whenever feet/label/active actually
    // agree with what was last sent, so this stays a correctness dependency
    // rather than a resend-storm.
  }, [ready, active, profile, charId, sendUpdate]);
}

export default useAuraRegionSync;
