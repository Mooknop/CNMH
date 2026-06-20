import { useEncounter } from './useEncounter';
import { useSyncedState } from './useSyncedState';
import { useSession } from '../contexts/SessionContext';
import { usePlayModeOverride } from '../contexts/PlayModeOverrideContext';

// Derives the effective play mode from Foundry combat state + the GM-set
// non-combat mode. Encounter always wins when combat is active.
//
// Offline sandbox (#554): when the DO is up but Foundry is disconnected, a
// player's local-only override (if set) drives the mode so they can roam the
// app untethered from the GM. The override is ignored whenever live, so Foundry
// + the GM-set global key stay authoritative.
//
// Returns:
//   mode         — 'encounter' | 'exploration' | 'downtime' (effective, derived)
//   gmMode       — the stored non-combat mode (GM-controlled)
//   setGmMode    — setter for non-combat mode
//   moveEnabled  — boolean GM toggle for exploration token movement
//   setMoveEnabled — setter for the movement toggle
//   moveOverride — boolean GM override that forces the party past the
//                  exploration activity-ready check into the Movement state
//   setMoveOverride — setter for the override
//   sandbox      — true when offline (DO up, Foundry down): writes are frozen
//                  and the player override is active
//   localMode    — the player's local-only mode override (null when unset)
//   setLocalMode — setter for the local override

export function usePlayMode() {
  const { encounter } = useEncounter();
  const { connected, foundryConnected } = useSession();
  const { localMode, setLocalMode } = usePlayModeOverride();
  const [gmMode, setGmMode] = useSyncedState('cnmh_playmode_global', 'exploration');
  const [moveEnabled, setMoveEnabled] = useSyncedState('cnmh_exploremove_global', false);
  const [moveOverride, setMoveOverride] = useSyncedState('cnmh_exploreoverride_global', false);

  const sandbox = connected && !foundryConnected;

  const mode = encounter?.active
    ? 'encounter'
    : (sandbox && localMode) || gmMode || 'exploration';

  return {
    mode, gmMode, setGmMode, moveEnabled, setMoveEnabled, moveOverride, setMoveOverride,
    sandbox, localMode, setLocalMode,
  };
}
