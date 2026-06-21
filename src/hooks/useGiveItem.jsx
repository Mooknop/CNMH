import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import { useSession } from '../contexts/SessionContext';
import { newEntryUid } from '../utils/uid';

// Player-to-player item push (#656). The recipient receives a clean, freshly
// uid'd copy on their additive `cnmh_acquired_` overlay — stored inline (no
// catalog ref), so runes / scroll / variant data carry over verbatim even for
// non-catalog items. The giver loses the item one of two ways: an
// acquired-overlay item is spliced from its own array; an authored item is
// masked via the `cnmh_removed_` overlay (authored inventory is immutable from
// the client). Credit the recipient BEFORE removing from the giver so a
// mid-transfer failure can only duplicate (visible in the log), never destroy.

// Strip live/loadout-only fields and mint a fresh uid so the gift can't collide
// with an entry the recipient already owns. The recipient's effective tree
// re-derives placement (defaults to Worn).
const toGift = (item) => {
  const { state, hand, ...rest } = item || {};
  return { ...rest, uid: newEntryUid() };
};

export const useGiveItem = (giverId) => {
  const { getState, sendUpdate, connected, foundryConnected } = useSession();
  const [acquired, setAcquired] = useSyncedState(`cnmh_acquired_${giverId || 'none'}`, []);
  const [, setRemoved] = useSyncedState(`cnmh_removed_${giverId || 'none'}`, []);

  const give = useCallback(
    (recipientId, item) => {
      // Offline sandbox (#553): campaign writes are frozen — reject so nothing
      // gets logged as given when neither side actually moved.
      if (connected && !foundryConnected) return false;

      const uid = item?.uid;
      if (!giverId || !recipientId || recipientId === giverId || uid == null) return false;

      // Credit the recipient first.
      const recipientAcquired = getState(recipientId, 'acquired');
      const list = Array.isArray(recipientAcquired) ? recipientAcquired : [];
      sendUpdate(recipientId, 'acquired', [...list, toGift(item)]);

      // Then remove from the giver — splice an acquired item, mask an authored one.
      const mine = Array.isArray(acquired) ? acquired : [];
      if (mine.some((e) => e && e.uid === uid)) {
        setAcquired(mine.filter((e) => !(e && e.uid === uid)));
      } else {
        setRemoved((cur) => {
          const set = Array.isArray(cur) ? cur : [];
          return set.includes(uid) ? set : [...set, uid];
        });
      }
      return true;
    },
    [giverId, acquired, getState, sendUpdate, setAcquired, setRemoved, connected, foundryConnected],
  );

  return { give };
};

export default useGiveItem;
