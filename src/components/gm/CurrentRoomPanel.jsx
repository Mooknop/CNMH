import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useContent } from '../../contexts/ContentContext';
import { useCurrentRoom } from '../../hooks/useCurrentRoom';
import { groupRoomsBySite } from '../../utils/rooms';
import RoomDetail from './RoomDetail';

// Dashboard "Current Room" panel (#1077): the at-the-table surface. The GM pins
// a room (here or from World → Rooms) and its read-aloud, hidden-check DCs, and
// creatures/hazards render inline so they don't have to leave the dashboard
// mid-encounter. The pin is a synced global (useCurrentRoom).
const CurrentRoomPanel = () => {
  const { rooms } = useContent();
  const { pinnedId, room, pinRoom } = useCurrentRoom(rooms);

  // Picker options grouped by site (rooms only — Features docs aren't a room).
  const groups = useMemo(
    () => groupRoomsBySite(rooms).map((g) => ({ site: g.site, rooms: g.rooms })).filter((g) => g.rooms.length),
    [rooms],
  );

  if (!rooms.length) return null; // nothing imported — keep the dashboard clean

  return (
    <section className="gm-dash-panel gm-current-room" aria-label="Current Room">
      <header className="gm-current-room-head">
        <h2>Current Room</h2>
        <div className="gm-current-room-controls">
          <select
            className="gm-current-room-select"
            aria-label="Pin current room"
            value={pinnedId || ''}
            onChange={(e) => pinRoom(e.target.value || null)}
          >
            <option value="">— none —</option>
            {groups.map((g) => (
              <optgroup key={g.site} label={g.site}>
                {g.rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code ? `${r.code}. ` : ''}{r.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <Link className="gm-current-room-browse" to="/gm/world/rooms">Browse</Link>
        </div>
      </header>

      {room ? (
        <RoomDetail room={room} />
      ) : (
        <p className="gm-help">
          No room pinned. Pick one above, or open <Link to="/gm/world/rooms">World → Rooms</Link> to browse.
        </p>
      )}
    </section>
  );
};

export default CurrentRoomPanel;
