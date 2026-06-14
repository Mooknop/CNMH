import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import { minionTurnId } from '../utils/minionUtils';

// Minion ↔ Foundry actor links (#362). The Foundry bridge derives which
// companion/familiar actor belongs to which PC (by shared ownership) and pushes a
// read-only map the app never writes:
//   cnmh_minionactors_global = { "<ownerCharId>-<role>":
//     { foundryActorId, name, role, ownerCharId, onScene } }
// `spawn` asks the bridge to place the linked minion's token on the active scene
// next to its owner via a request key (GM or the owning player can trigger it):
//   cnmh_spawnminion_global = { ownerCharId, role, ts }

const EMPTY_LINKS = {};

export const useMinionActors = () => {
  const [links] = useSyncedState('cnmh_minionactors_global', EMPTY_LINKS);
  const [, setSpawnReq] = useSyncedState('cnmh_spawnminion_global', null);

  // The link for a given owner/role, or null when the minion isn't linked to a
  // Foundry actor (e.g. no matching actor / ownership in Foundry yet).
  const linkFor = useCallback(
    (ownerId, role) => (links || EMPTY_LINKS)[minionTurnId(ownerId, role)] || null,
    [links]
  );

  const spawn = useCallback(
    (ownerId, role) => setSpawnReq({ ownerCharId: ownerId, role, ts: Date.now() }),
    [setSpawnReq]
  );

  return { links: links || EMPTY_LINKS, linkFor, spawn };
};

export default useMinionActors;
