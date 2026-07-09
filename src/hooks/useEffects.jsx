import { useCallback, useMemo } from 'react';
import { useSyncedState } from './useSyncedState';
import { RELAY, APP, syncKey } from '../sync/keys';

export const useEffects = (charId) => {
  const [effects, setEffects] = useSyncedState(syncKey(APP.EFFECTS, charId), []);
  // Foundry-sourced effects (#455) — the bridge owns this key outright (full-list
  // replace on every effect-item change), so it never collides with the app's own
  // cnmh_effects store. Merged read-only into the returned list so the EffectsPanel
  // and the computeEffectBonuses pipeline (StatsBlock / rollResolution) treat a
  // Foundry-applied buff exactly like an app-applied one.
  const [foundryEffects] = useSyncedState(syncKey(RELAY.FOUNDRYEFFECTS, charId), []);

  const removeEffect = useCallback(
    // Only app-owned entries are removable; Foundry-sourced ones carry no × in the
    // panel, and the filter targets the app store regardless of what the merged
    // view contains.
    (uid) => setEffects((cur) => (cur || []).filter((e) => e.id !== uid)),
    [setEffects]
  );

  const merged = useMemo(
    () => [...(effects || []), ...(foundryEffects || []).map((e) => ({ ...e, fromFoundry: true }))],
    [effects, foundryEffects]
  );

  return {
    effects: merged,
    removeEffect,
  };
};

export default useEffects;
