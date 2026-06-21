import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import { useSession } from '../contexts/SessionContext';
import { newEntryUid } from '../utils/uid';

// Player-to-player item push (#656, #657). The recipient receives a clean,
// freshly uid'd copy on their additive `cnmh_acquired_` overlay — stored inline
// (no catalog ref), so runes / scroll / variant data carry over verbatim even
// for non-catalog items. The giver loses the item: an acquired-overlay entry is
// spliced from its own array; an authored entry is masked via the
// `cnmh_removed_` overlay (authored inventory is immutable from the client);
// a consumable stack is depleted through the name-keyed `cnmh_consumed_`
// overlay. Always credit the recipient BEFORE removing from the giver so a
// mid-transfer failure can only duplicate (visible in the log), never destroy.

// Deep-clone for the recipient: strip live/loadout-only fields and mint fresh
// uids throughout (including a container's contents) so a gift can't collide
// with an entry the recipient already owns. The recipient's effective tree
// re-derives placement (container → Worn, contents → Stowed).
const reuid = (item) => {
  const { state, hand, ...rest } = item || {};
  const next = { ...rest, uid: newEntryUid() };
  if (next.container && Array.isArray(next.container.contents)) {
    next.container = {
      ...next.container,
      contents: next.container.contents.map((c) => reuid(c)),
    };
  }
  return next;
};

// Every uid in an item's subtree (the entry itself + any container contents) —
// the full set that must leave the giver when a container is handed over.
const subtreeUids = (item) => {
  const out = item?.uid != null ? [item.uid] : [];
  if (item?.container && Array.isArray(item.container.contents)) {
    item.container.contents.forEach((c) => out.push(...subtreeUids(c)));
  }
  return out;
};

export const useGiveItem = (giverId) => {
  const { getState, sendUpdate, connected, foundryConnected } = useSession();
  const [acquired, setAcquired] = useSyncedState(`cnmh_acquired_${giverId || 'none'}`, []);
  const [, setRemoved] = useSyncedState(`cnmh_removed_${giverId || 'none'}`, []);
  const [, setConsumed] = useSyncedState(`cnmh_consumed_${giverId || 'none'}`, {});

  const offline = connected && !foundryConnected;

  // Append a finished entry to the recipient's acquired overlay (read-modify-
  // write through the session — recipient varies at call time).
  const creditRecipient = useCallback(
    (recipientId, entry) => {
      const cur = getState(recipientId, 'acquired');
      const list = Array.isArray(cur) ? cur : [];
      sendUpdate(recipientId, 'acquired', [...list, entry]);
    },
    [getState, sendUpdate],
  );

  // Give a whole item (gear or a container with its contents). Every uid in the
  // subtree leaves the giver: acquired ones are spliced, authored ones masked.
  const give = useCallback(
    (recipientId, item) => {
      if (offline) return false;
      const uid = item?.uid;
      if (!giverId || !recipientId || recipientId === giverId || uid == null) return false;

      creditRecipient(recipientId, reuid(item));

      const uids = subtreeUids(item);
      const mine = Array.isArray(acquired) ? acquired : [];
      const acquiredUids = new Set(mine.map((e) => e && e.uid).filter((u) => u != null));
      const toSplice = uids.filter((u) => acquiredUids.has(u));
      const toMask = uids.filter((u) => !acquiredUids.has(u));

      if (toSplice.length) {
        setAcquired(mine.filter((e) => !(e && toSplice.includes(e.uid))));
      }
      if (toMask.length) {
        setRemoved((cur) => {
          const set = Array.isArray(cur) ? cur : [];
          const add = toMask.filter((u) => !set.includes(u));
          return add.length ? [...set, ...add] : set;
        });
      }
      return true;
    },
    [offline, giverId, acquired, creditRecipient, setAcquired, setRemoved],
  );

  // Give part (or all) of a consumable stack (#657). The recipient gets a
  // quantity-`count` copy; the giver depletes `count` through the name-keyed
  // consumed overlay (the same mechanism that tracks drinking/using), so it
  // works identically for authored and acquired stacks.
  const giveConsumable = useCallback(
    (recipientId, item, count) => {
      if (offline) return false;
      const uid = item?.uid;
      const remaining = item?.quantity ?? 1;
      const n = Math.floor(Number(count));
      if (!giverId || !recipientId || recipientId === giverId || uid == null) return false;
      if (!Number.isFinite(n) || n <= 0 || n > remaining) return false;

      creditRecipient(recipientId, { ...reuid(item), quantity: n });

      setConsumed((cur) => {
        const map = cur && typeof cur === 'object' ? cur : {};
        return { ...map, [item.name]: (map[item.name] || 0) + n };
      });
      return true;
    },
    [offline, giverId, creditRecipient, setConsumed],
  );

  return { give, giveConsumable };
};

export default useGiveItem;
