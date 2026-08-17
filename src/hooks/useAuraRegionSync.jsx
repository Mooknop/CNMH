import { useEffect, useRef } from 'react';
import { useAura } from './useAura';
import { useEffects } from './useEffects';
import { useSession } from '../contexts/SessionContext';
import { useContent } from '../contexts/ContentContext';
import { useBridgeStatus } from './useBridgeStatus';
import { useGmAuth } from './useGmAuth';
import { RELAY } from '../sync/keys';
import { AURA_PROTOCOL, buildAuraSet } from '../utils/auraRelay';
import { classAuraProfile, resolveAuraSource } from '../utils/auraSources';

// Mirrors whatever aura a character currently projects to Foundry as
// `auraset` (#1733 S1 app half; multi-source since S3). A mirror observer
// rather than per-call-site sends: EVERY writer of the app-only aura key —
// Channel Elements on cast-confirm (`useAuraGate`), Dismiss (StatsBlock /
// TurnTrackerPanel), the KO sweep (`useAuraKoSweep`), a GM toggle via
// `liveStateRegistry`, GM CharacterStateModal's clear-combat — mutates that
// one key, so watching it here covers all of them, including future writers,
// with no call-site audit. The same holds for the effect-driven sources
// (#1733 S3): every path that grants or drops Courageous Anthem, app-applied
// or mirrored back from Foundry, lands in `useEffects`, so watching that one
// list covers them all.
//
// WHICH aura (a character can have several, and the bridge draws exactly one
// Region per charId) is `resolveAuraSource`'s call — see the priority rule
// documented in `utils/auraSources.js`.
//
// GM-only writer (mirrors `useAuraKoSweep`) so exactly one device mirrors;
// gated on `foundryConnected` + bridge protocol >= AURA_PROTOCOL, exactly
// the `useSceneSnapshot` idiom. No authored radius anywhere on the character
// means this NEVER sends — #1733 ruling 2, no fallback radius — the app-only
// key stays the only thing that changes.
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
  const { effects } = useEffects(charId);
  const { spells } = useContent();
  const { sendUpdate, foundryConnected } = useSession();
  const { protocol } = useBridgeStatus();
  const { isGm } = useGmAuth();

  const source = resolveAuraSource({ character, auraActive: active, effects, spells });
  // A class aura with an authored radius is "mirrorable" even while it is down
  // — that is what lets the mount/reconnect resync push its INACTIVE state, so
  // a bridge that restarted mid-aura learns the Region should be gone. An
  // effect aura has no such resting state: it exists only while it is up.
  const mirrorable = !!source || !!classAuraProfile(character);
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
    // No authored size anywhere — never send, active or not (#1733 ruling 2).
    // The `lastSentRef.current?.active` arm is the falling edge of a source
    // that has no resting state (an effect aura): once we told the bridge to
    // draw a Region we always owe it the teardown, even though the source that
    // justified the send has since evaporated.
    if (!mirrorable && !lastSentRef.current?.active) return;

    const desired = source
      ? { active: true, feet: source.feet, label: source.label }
      : { active: false, feet: null, label: null };
    const last = lastSentRef.current;
    const unchanged = !!last
      && last.active === desired.active
      && (!desired.active || (last.feet === desired.feet && last.label === desired.label));
    if (unchanged) return;

    sendUpdate(charId, RELAY.AURASET, buildAuraSet({
      active: desired.active,
      feet: desired.active ? desired.feet : undefined,
      label: desired.label || undefined,
    }));
    lastSentRef.current = desired;
    // `source` is a fresh object every render (nothing here is memoized) —
    // depending on it re-runs the effect each render, but the `unchanged`
    // check above makes that a no-op whenever feet/label/active actually
    // agree with what was last sent, so this stays a correctness dependency
    // rather than a resend-storm.
  }, [ready, mirrorable, source, charId, sendUpdate]);
}

export default useAuraRegionSync;
