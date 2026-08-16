import { useMemo } from 'react';
import { useDevicePref } from './useDevicePref';
import { useMoverMapSurface } from './useMoverMapSurface';
import { usePathPreview } from './usePathPreview';
import { MAP_MOVE_PROTOCOL, MOVE_SURFACE_PREF } from '../utils/movement';

// Shared map-mode wiring for every movement surface (#1744 S7 — mirrors
// #1743's rollout of the tap flow itself). Every surface that offers the
// grid/map toggle (MoveActionSheet, ExplorationMove, MinionMove,
// DockEnemyPane's foe Move tab) needs the exact same three things: the
// device-sticky surface preference (ONE preference, MOVE_SURFACE_PREF, for
// every surface — OQ-4 ruling), the mover-centered snapshot request
// (useMoverMapSurface), and other movers' route ghosts filtered to the
// captured scene and excluding the mover's own id (usePathPreview). This
// hook just centralizes that wiring; each caller keeps its own plan/confirm
// state and MoveGridPicker/MoveConfirmBar rendering untouched.
//
//   const {
//     surfacePref, setSurfacePref, mapEligible, useMapSurface,
//     mapStatus, mapSnapshot, ghostEntries,
//   } = useMoveMapMode({
//     moverId, tapFlowEligible, protocol, knownSpeed,
//     ghostAudience: 'player' | 'gm',
//   });
//
// `moverId` is whatever id useTokenMovement is already keyed on for this
// surface — a PC charId, a minion's `<ownerCharId>-<role>`, or a combat
// entryId; resolveToken (foundry-bridge/snapshots.js) and resolveMoverId
// (foundry-bridge/movement.js) both already handle all three forms, so no
// per-surface branching is needed here.
//
// `ghostAudience` picks the pathpreview channel per OQ-2's render-gate
// contract: 'player' on every player-facing surface (MoveActionSheet,
// ExplorationMove, MinionMove — usePathPreview's PUBLIC, filtered channel),
// 'gm' ONLY on the GM dock's own surface (DockEnemyPane — the unfiltered
// channel, consistent with DockRoutePreviews). Never let a player-facing
// surface pass 'gm'.
export function useMoveMapMode({
  moverId,
  tapFlowEligible,
  protocol,
  knownSpeed,
  ghostAudience,
} = {}) {
  const [surfacePref, setSurfacePref] = useDevicePref(MOVE_SURFACE_PREF, 'grid');
  const mapEligible = !!tapFlowEligible && (protocol ?? 0) >= MAP_MOVE_PROTOCOL;
  const useMapSurface = mapEligible && surfacePref === 'map';

  const { status: mapStatus, snapshot: mapSnapshot } = useMoverMapSurface(moverId, {
    active: useMapSurface,
    radiusFeet: knownSpeed ? knownSpeed * 1.5 : undefined,
  });

  const { entries: pathPreviewEntries } = usePathPreview({ audience: ghostAudience });
  const snapshotSceneId = mapSnapshot?.capture?.sceneId || null;
  const ghostEntries = useMemo(() => {
    if (!useMapSurface || !mapSnapshot) return [];
    return pathPreviewEntries.filter((entry) => {
      if (entry.id === moverId) return false;
      if (snapshotSceneId && entry.sceneId && entry.sceneId !== snapshotSceneId) return false;
      return true;
    });
  }, [pathPreviewEntries, useMapSurface, mapSnapshot, snapshotSceneId, moverId]);

  return {
    surfacePref, setSurfacePref, mapEligible, useMapSurface, mapStatus, mapSnapshot, ghostEntries,
  };
}

export default useMoveMapMode;
