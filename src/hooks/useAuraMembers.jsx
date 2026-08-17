import { useSyncedState } from './useSyncedState';
import { RELAY, syncKey } from '../sync/keys';

// Aura membership read-out (#1733 S2) — subscribes to the bridge's
// cnmh_auramembers_<charId> channel (RELAY.AURAMEMBERS, README "Relay keys":
// `{ inside: [{ entryId?, tokenId, name, disposition, hidden }], ts }`).
// Bridge-owned snapshot: recomputed and re-pushed on TOKEN_ENTER/EXIT, aura
// creation, and teardown (empty `inside: []`) — see foundry-bridge/README.md.
//
// Absent state (no bridge, pre-19 protocol, aura off, or simply no push yet)
// reads as UNKNOWN, not "0 inside" — `known` distinguishes the two so a
// display surface can show nothing rather than lying with a zero. This is
// the same shape as useAdjacency's `hasData` gate.
//
// disposition uses CONST.TOKEN_DISPOSITIONS: FRIENDLY 1 / NEUTRAL 0 /
// HOSTILE -1 / SECRET -2. Hidden entries ARE sent by the bridge (GM surfaces
// want the complete picture) — `visibleAllies` is the player-facing derived
// list: friendly (disposition > 0) AND not hidden, matching the
// `positions` / `encounter.hidden` filtering convention (#1749 OQ-5).
export const useAuraMembers = (charId) => {
  const [raw] = useSyncedState(syncKey(RELAY.AURAMEMBERS, charId || 'none'), null);

  const known = !!raw && Array.isArray(raw.inside);
  const inside = known ? raw.inside : [];

  // Player-facing: friendly and not hidden.
  const visibleAllies = inside.filter((m) => m?.disposition > 0 && !m?.hidden);

  return {
    known,
    inside,
    visibleAllies,
    insideCount: inside.length,
    visibleCount: visibleAllies.length,
  };
};

export default useAuraMembers;
