import React, { useMemo, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useCurrentRoom } from '../../hooks/useCurrentRoom';
import { groupRoomsBySite, roomMatches, roomTreasureCache } from '../../utils/rooms';
import { saveDocument } from '../../utils/gmApi';
import RoomDetail from '../../components/gm/RoomDetail';
import RoomTreasureEditor from '../../components/gm/RoomTreasureEditor';
import RoomDistributeControl from '../../components/gm/RoomDistributeControl';
import RoomsImportButton from '../../components/gm/RoomsImportButton';
import GmIcon from './GmIcon';
import './gm.css';

// Editable GM "campaign significance" note for one room (#1078). Saves the full
// room doc with the new notes via the single-doc PUT (archives the prior
// version). Remounted per room (key) so the draft resets when the GM switches
// rooms. The live re-import preserves this field, so authoring survives a
// re-run of the import script.
const RoomNotesEditor = ({ room }) => {
  const [notes, setNotes] = useState(room.notes || '');
  const [state, setState] = useState('idle'); // idle | saving | saved | error
  const dirty = notes !== (room.notes || '');

  const save = async () => {
    setState('saving');
    try {
      await saveDocument('room', room.id, { ...room, notes });
      setState('saved');
    } catch {
      setState('error');
    }
  };

  return (
    <div className="gm-room-notes-edit">
      <label htmlFor="gm-room-notes">Campaign significance (GM notes)</label>
      <textarea
        id="gm-room-notes"
        className="gm-room-notes-input"
        rows={4}
        placeholder="Private GM notes — significance, callbacks, reminders…"
        value={notes}
        onChange={(e) => { setNotes(e.target.value); setState('idle'); }}
      />
      <div className="gm-room-notes-actions">
        <button type="button" className="btn-primary" disabled={!dirty || state === 'saving'} onClick={save}>
          {state === 'saving' ? 'Saving…' : 'Save notes'}
        </button>
        {state === 'saved' && <span className="gm-ok">Saved.</span>}
        {state === 'error' && <span className="gm-warn">Save failed — try again.</span>}
      </div>
    </div>
  );
};

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
          No adventure rooms imported yet. In Foundry, run the export macro
          (<code>scripts/exportAdventureJournals.foundryMacro.js</code>) as GM to
          download the module&apos;s journal dump, then import that file here:
        </p>
        <RoomsImportButton />
      </div>
    );
  }

  return (
    <div className="gm-rooms">
      <aside className="gm-rooms-rail" aria-label="Rooms by site">
        <details className="gm-rooms-reimport">
          <summary>Import / update from Foundry export</summary>
          <RoomsImportButton label="Choose export file…" />
        </details>
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
                {roomTreasureCache(r) && (
                  <span
                    className={`gm-rooms-treasure${r.distributedAt ? ' is-distributed' : ''}`}
                    title={r.distributedAt ? 'Treasure distributed' : 'Has treasure cache'}
                  >
                    <GmIcon name="bag" />
                  </span>
                )}
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
            <RoomDetail room={selected} showNotes={false} showTreasure={false} />
            {!selected.isFeatures && <RoomTreasureEditor key={`treasure-${selected.id}`} room={selected} />}
            {!selected.isFeatures && <RoomDistributeControl key={`distribute-${selected.id}`} room={selected} />}
            <RoomNotesEditor key={`notes-${selected.id}`} room={selected} />
          </>
        ) : (
          <p className="gm-help">Select a room.</p>
        )}
      </main>
    </div>
  );
};

export default GmRooms;
