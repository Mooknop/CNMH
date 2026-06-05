import { useEncounter } from './useEncounter';
import { useSyncedState } from './useSyncedState';

// Derives the effective play mode from Foundry combat state + the GM-set
// non-combat mode. Encounter always wins when combat is active.
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

export function usePlayMode() {
  const { encounter } = useEncounter();
  const [gmMode, setGmMode] = useSyncedState('cnmh_playmode_global', 'exploration');
  const [moveEnabled, setMoveEnabled] = useSyncedState('cnmh_exploremove_global', false);
  const [moveOverride, setMoveOverride] = useSyncedState('cnmh_exploreoverride_global', false);

  const mode = encounter?.active ? 'encounter' : (gmMode || 'exploration');

  return { mode, gmMode, setGmMode, moveEnabled, setMoveEnabled, moveOverride, setMoveOverride };
}
