import { useEffect, useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import { useSession } from '../contexts/SessionContext';
import { RELAY, syncKey } from '../sync/keys';

// Shared door relay for both the exploration door panel and the encounter
// Interact action (#435). The bridge (`foundry-bridge/doors.js`) answers a
// `doorreq` with the doors within ~1.5 grid squares of the actor's token — that
// server-side proximity filter is the reach gate, so callers just render whatever
// comes back. Mode-agnostic: works in exploration and encounter alike.
//
//   app → bridge:  cnmh_doorreq_<charId>      = { ts }
//   bridge → app:  cnmh_dooropts_<charId>     = { doors:[{ wallId, state, x, y }], reqTs }
//   app → bridge:  cnmh_doorinteract_<charId> = { wallId, op:'open'|'close', ts }
//
// @param charId
// @param {Object} [opts]
// @param {number|string} [opts.refreshTs] - re-send a doorreq whenever this changes
//        (e.g. after a confirmed move, so the door list tracks the new position).
// @returns {{ doors: Array, interactDoor: (wallId, op) => void }}
export const useDoors = (charId, { refreshTs } = {}) => {
  const { sendUpdate } = useSession();
  const [doorOpts] = useSyncedState(syncKey(RELAY.DOOROPTS, charId), null);

  const detect = useCallback(() => {
    sendUpdate(charId, RELAY.DOORREQ, { ts: Date.now() });
  }, [charId, sendUpdate]);

  // Detect on mount and again whenever the refresh signal changes.
  useEffect(() => {
    detect();
  }, [detect, refreshTs]);

  const interactDoor = useCallback(
    (wallId, op) => sendUpdate(charId, RELAY.DOORINTERACT, { wallId, op, ts: Date.now() }),
    [charId, sendUpdate]
  );

  return { doors: doorOpts?.doors ?? [], interactDoor };
};

export default useDoors;
