import { useSyncedState } from './useSyncedState';

// The GM-pinned "current room" for the dashboard's Current Room panel (#1077).
// Stored in a synced global key so the pin persists across reloads and is
// shared with any other GM device; the value is a room doc id (or null).
// Global scope (not GM-only) leaves room for a later player-facing reveal to
// read the same pin. Rooms are the live `room` collection from ContentContext.
export const useCurrentRoom = (rooms) => {
  const [pinnedId, setPinnedId] = useSyncedState('cnmh_pinnedroom_global', null);
  const room = (rooms || []).find((r) => r.id === pinnedId) || null;
  // If the pinned id no longer resolves (e.g. a re-import dropped it), treat it
  // as unpinned rather than surfacing a dangling reference.
  return {
    pinnedId: room ? pinnedId : null,
    room,
    pinRoom: (id) => setPinnedId(id || null),
    clearRoom: () => setPinnedId(null),
  };
};
