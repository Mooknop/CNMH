import { useEffect, useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import { useSession } from '../contexts/SessionContext';
import { useBridgeStatus } from './useBridgeStatus';
import { RELAY, GLOBAL_ID, globalKey, SCENE_DOORS_PROTOCOL } from '../sync/keys';

// Scene-wide door feed for the GM dock's door-glyph overlay (#1809, epic
// #1804 S5) — the global sibling of `useDoors` (per-char, proximity-filtered,
// #435/exploration panel). `cnmh_dooropts_global` carries EVERY door on the
// rendered scene regardless of distance (#1805, protocol >= SCENE_DOORS_PROTOCOL):
//
//   app → bridge:  cnmh_doorreq_global      = { ts }
//   bridge → app:  cnmh_dooropts_global     = { doors:[{ wallId, state, x, y, secret? }], sceneId, reqTs }
//   app → bridge:  cnmh_doorinteract_global = { wallId, op:'open'|'close', ts }
//
// NO POLLING: the bridge re-pushes `dooropts_global` unprompted (`reqTs:
// null`) on every door-state change — including ones this hook itself causes
// via `interactDoor` — from Foundry's own `updateWall` hook. So a single
// request on activation is enough; the overlay tracks doors opened natively
// in Foundry, by another client, or by this GM's own tap, for free.
//
// PROTOCOL GATE: mirrors `usePartyMapSurface`'s `eligible` shape rather than
// throwing — a bridge below SCENE_DOORS_PROTOCOL simply never gets a
// doorreq and `doors` stays empty, so the overlay quietly renders nothing
// instead of spamming a channel an old module doesn't answer. In practice the
// dock's exploration pane only mounts this once PARTY_MAP_PROTOCOL (21) is
// met, which is already above this floor (20) — the gate exists for
// robustness, not because the two are expected to disagree in the field.
//
// @returns {{ doors: Array, sceneId: string|null, eligible: boolean, interactDoor: (wallId, op) => void }}
export const useSceneDoors = () => {
  const { sendUpdate } = useSession();
  const { protocol } = useBridgeStatus();
  const [doorOpts] = useSyncedState(globalKey(RELAY.DOOROPTS), null);

  const eligible = (protocol ?? 0) >= SCENE_DOORS_PROTOCOL;

  const requestDoors = useCallback(() => {
    sendUpdate(GLOBAL_ID, RELAY.DOORREQ, { ts: Date.now() });
  }, [sendUpdate]);

  // Fires on mount, and again if the bridge becomes eligible after the pane
  // is already open (a mid-session Foundry connect) — same "activation, not
  // every render" shape `usePartyMapSurface` uses for its own request.
  useEffect(() => {
    if (!eligible) return;
    requestDoors();
  }, [eligible, requestDoors]);

  const interactDoor = useCallback(
    (wallId, op) => sendUpdate(GLOBAL_ID, RELAY.DOORINTERACT, { wallId, op, ts: Date.now() }),
    [sendUpdate]
  );

  return {
    doors: eligible ? (doorOpts?.doors ?? []) : [],
    sceneId: doorOpts?.sceneId ?? null,
    eligible,
    interactDoor,
  };
};

export default useSceneDoors;
