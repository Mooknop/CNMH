import React, { useMemo, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useCurrentRoom } from '../../hooks/useCurrentRoom';
import { groupRoomsBySite, roomMatches } from '../../utils/rooms';
import RoomDetail from '../../components/gm/RoomDetail';
import GmIcon from './GmIcon';
import './gm.css';

// World → Rooms: the read-only adventure-room browser (#1077). Site rail on the
// left, room detail on the right, plus a "Pin to dashboard" action that sets the
// GM's Current Room (useCurrentRoom). Rooms are the live `room` collection,
// imported via scripts/importAdventureRooms.js — empty until then.
const GmRooms = () => {
  const { rooms } = useContent();
  const { pinnedId, pinRoom } = useCurrentRoom(rooms);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const groups = useMemo(() => groupRoomsBySite(rooms), [rooms]);

  // Filtered view: keep a site only if it has a matching room/features doc.
  const visibleGroups = useMemo(() => {
    if (!search) return groups;
    return groups
      .map((g) => ({
        ...g,
        features: g.features && roomMatches(g.features, search) ? g.features : null,
        rooms: g.rooms.filter((r) => roomMatches(r, search)),
      }))
      .filter((g) => g.features || g.rooms.length);
  }, [groups, search]);

  // Default selection: the pinned room, else the first actual room in book
  // order (not a site Features doc). allDocs also backs id lookup, so it keeps
  // Features docs in.
  const allDocs = useMemo(
    () => groups.flatMap((g) => [g.features, ...g.rooms].filter(Boolean)),
    [groups],
  );
  const firstRoomId = useMemo(() => groups.flatMap((g) => g.rooms)[0]?.id || allDocs[0]?.id || null, [groups, allDocs]);
  const effectiveId = selectedId || pinnedId || firstRoomId;
  const selected = allDocs.find((d) => d.id === effectiveId) || null;

  if (!rooms.length) {
    return (
      <div className="gm-rooms gm-rooms-empty">
        <h1>Rooms</h1>
        <p className="gm-help">
          No adventure rooms imported yet. Export the module journals with
          <code> scripts/exportAdventureJournals.foundryMacro.js</code>, then run
          <code> node scripts/importAdventureRooms.js &lt;dump&gt; --post &lt;baseUrl&gt;</code>
          {' '}to load them into the live store.
        </p>
      </div>
    );
  }

  return (
    <div className="gm-rooms">
      <aside className="gm-rooms-rail" aria-label="Rooms by site">
        <input
          type="search"
          className="gm-rooms-search"
          placeholder="Search rooms…"
          aria-label="Search rooms"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {visibleGroups.map((g) => (
          <div key={g.site} className="gm-rooms-site">
            <div className="gm-rooms-site-name">{g.site}</div>
            {g.features && (
              <button
                type="button"
                className={`gm-rooms-link is-features ${effectiveId === g.features.id ? 'active' : ''}`}
                onClick={() => setSelectedId(g.features.id)}
              >
                Features
              </button>
            )}
            {g.rooms.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`gm-rooms-link ${effectiveId === r.id ? 'active' : ''}`}
                onClick={() => setSelectedId(r.id)}
              >
                {r.code && <span className="gm-rooms-code">{r.code}</span>}
                <span className="gm-rooms-name">{r.name}</span>
                {pinnedId === r.id && <GmIcon name="flag" className="gm-rooms-pinned" />}
              </button>
            ))}
          </div>
        ))}
        {!visibleGroups.length && <p className="gm-help">No rooms match “{search}”.</p>}
      </aside>

      <main className="gm-rooms-detail">
        {selected ? (
          <>
            <div className="gm-rooms-detail-bar">
              <span className="gm-rooms-detail-site">{selected.site}</span>
              {!selected.isFeatures && (
                <button
                  type="button"
                  className={pinnedId === selected.id ? 'btn-secondary' : 'btn-primary'}
                  onClick={() => pinRoom(pinnedId === selected.id ? null : selected.id)}
                >
                  <GmIcon name="flag" /> {pinnedId === selected.id ? 'Pinned to dashboard' : 'Pin to dashboard'}
                </button>
              )}
            </div>
            <RoomDetail room={selected} />
          </>
        ) : (
          <p className="gm-help">Select a room.</p>
        )}
      </main>
    </div>
  );
};

export default GmRooms;
