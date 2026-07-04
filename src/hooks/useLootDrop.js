import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import { useContent } from '../contexts/ContentContext';
import { useSessionLog } from './useSessionLog';
import { saveDocument } from '../utils/gmApi';
import { buildLootDrop, lootDropSummary } from '../utils/lootDrop';

// The treasure-distribution lifecycle (#1090, epic #1085 T4). One drop at a
// time, session-wide, on the synced global cnmh_lootdrop_global:
//
//   open   → GM writes a room's cache to the drop; players claim against it (T5)
//   cancel → drop discarded, nothing written to anyone
//   finalize → GM (single writer) stamps the room's distributedAt + clears the
//              drop. T5 layers the player overlay writes in here before the
//              stamp; T4 only handles drop creation, the stamp, and the log.
//
// The pin/finalize surface is GM-only (all GM pages sit behind useGmAuth in
// GmLayout), so no extra gating is needed here.
export const useLootDrop = () => {
  const { rooms = [], refresh } = useContent();
  const { appendEvent } = useSessionLog();
  const [drop, setDrop] = useSyncedState('cnmh_lootdrop_global', null);

  const isOpen = !!drop && drop.status === 'open';

  // Create a drop from a room's cache. No-op (returns null) when a drop is
  // already open — one at a time — or the room has nothing to distribute.
  const openDrop = useCallback(
    (room) => {
      if (isOpen) return null;
      const built = buildLootDrop(room);
      if (!built) return null;
      setDrop(built);
      return built;
    },
    [isOpen, setDrop],
  );

  // Discard the open drop. Nothing is written to any inventory or gold balance;
  // clearing the key closes the claim UI on every device.
  const cancelDrop = useCallback(() => {
    setDrop(null);
  }, [setDrop]);

  // Finalize: stamp the room's distributedAt (locks its cache read-only, T3) and
  // clear the drop. Throws if the doc save fails so the caller can surface it
  // WITHOUT clearing the drop. Returns true once committed.
  const finalizeDrop = useCallback(async () => {
    if (!drop) return false;
    const room = rooms.find((r) => r.id === drop.roomId);
    // T5 writes the claimed items/gold onto player overlays here, before the
    // stamp. A missing room (e.g. a re-import dropped it) can't be stamped, but
    // we still close out the drop so the GM isn't stuck on a dangling reference.
    if (room) {
      await saveDocument('room', room.id, { ...room, distributedAt: Date.now() });
      if (refresh) await refresh();
    }
    appendEvent({
      type: 'action',
      text: `Distributed ${drop.roomName} treasure — ${lootDropSummary(drop)}`,
    });
    setDrop(null);
    return true;
  }, [drop, rooms, refresh, appendEvent, setDrop]);

  return { drop, isOpen, openDrop, cancelDrop, finalizeDrop };
};

export default useLootDrop;
