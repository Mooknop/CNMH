import { useCallback, useMemo } from 'react';
import { useSyncedState } from './useSyncedState';
import { useSession } from '../contexts/SessionContext';
import { useContent } from '../contexts/ContentContext';
import { docGold } from '../utils/gold';

// Player-to-player gold push (#655). The giver's own balance is a live synced
// number (`cnmh_gold_<giverId>`); the recipient's balance is read + written
// straight through the session — recipient varies at call time, so it can't go
// through a per-recipient hook. Credit the recipient BEFORE debiting the giver
// so a mid-transfer failure can only duplicate gold (visible in the session
// log), never destroy it. Both balances default to the doc's gold (#670) so an
// unset overlay reflects the committed value rather than 0.
//
// Returns { myGold, give }. give(recipientId, amount) returns true when the
// transfer was applied, false when it was rejected (bad input, insufficient
// funds, self-send, or the offline write-gate).
export const useGiveGold = (giverId) => {
  const { getState, sendUpdate, connected, foundryConnected } = useSession();
  const { characters } = useContent();
  const byId = useMemo(
    () => Object.fromEntries((characters || []).map((c) => [c.id, c])),
    [characters],
  );
  const [myGold, setMyGold] = useSyncedState(`cnmh_gold_${giverId || 'none'}`, docGold(byId[giverId]));

  const give = useCallback(
    (recipientId, amount) => {
      // Offline sandbox (#553): the DO is up but Foundry isn't, so every
      // campaign write is frozen. Reject here so nothing gets logged as given
      // when neither balance actually moved. Matches useSyncedState's gate.
      if (connected && !foundryConnected) return false;

      const amt = Number(amount);
      if (!giverId || !recipientId || recipientId === giverId) return false;
      if (!Number.isFinite(amt) || amt <= 0 || amt > myGold) return false;

      // Recipient overlay value, falling back to their doc gold when unset (so a
      // transfer to a PC who hasn't loaded their sheet doesn't wipe their gold).
      const server = getState(recipientId, 'gold');
      const recipientGold = typeof server === 'number' ? server : docGold(byId[recipientId]);
      sendUpdate(recipientId, 'gold', recipientGold + amt); // credit first
      setMyGold(myGold - amt); // debit self
      return true;
    },
    [giverId, myGold, getState, sendUpdate, setMyGold, connected, foundryConnected, byId],
  );

  return { myGold, give };
};

export default useGiveGold;
