import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import { useSession } from '../contexts/SessionContext';

// Player-to-player gold push (#655). The giver's own balance is a live synced
// number (`cnmh_gold_<giverId>`); the recipient's balance is read + written
// straight through the session — recipient varies at call time, so it can't go
// through a per-recipient hook. Credit the recipient BEFORE debiting the giver
// so a mid-transfer failure can only duplicate gold (visible in the session
// log), never destroy it.
//
// Returns { myGold, give }. give(recipientId, amount) returns true when the
// transfer was applied, false when it was rejected (bad input, insufficient
// funds, self-send, or the offline write-gate).
export const useGiveGold = (giverId) => {
  const { getState, sendUpdate, connected, foundryConnected } = useSession();
  const [myGold, setMyGold] = useSyncedState(`cnmh_gold_${giverId || 'none'}`, 0);

  const give = useCallback(
    (recipientId, amount) => {
      // Offline sandbox (#553): the DO is up but Foundry isn't, so every
      // campaign write is frozen. Reject here so nothing gets logged as given
      // when neither balance actually moved. Matches useSyncedState's gate.
      if (connected && !foundryConnected) return false;

      const amt = Number(amount);
      if (!giverId || !recipientId || recipientId === giverId) return false;
      if (!Number.isFinite(amt) || amt <= 0 || amt > myGold) return false;

      const recipientGold = Number(getState(recipientId, 'gold')) || 0;
      sendUpdate(recipientId, 'gold', recipientGold + amt); // credit first
      setMyGold(myGold - amt); // debit self
      return true;
    },
    [giverId, myGold, getState, sendUpdate, setMyGold, connected, foundryConnected],
  );

  return { myGold, give };
};

export default useGiveGold;
