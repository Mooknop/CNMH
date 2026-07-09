import React, { useRef, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { importRooms, importEvents } from '../../utils/gmApi';
// Explicit .mjs: vite.config.js overrides resolve.extensions without '.mjs',
// so the extensionless specifier would not resolve.
import { transformDump, mergeGmFields } from '../../../scripts/importAdventureRooms.mjs';

// One-click import of a Foundry adventure-module export (#1074/#1112). The GM
// picks the raw journal dump downloaded by
// scripts/exportAdventureJournals.foundryMacro.js; the transform runs in the
// browser (the same pure parser the CLI uses), GM notes/tracking already in the
// store are preserved, and both rooms and chapter events upload to the live DO
// via the Access-gated endpoint — no command line, no service token.
const RoomsImportButton = ({ label = 'Import rooms from Foundry export' }) => {
  const { rooms, events, refresh } = useContent();
  const fileRef = useRef(null);
  const [state, setState] = useState('idle'); // idle | working | done | error
  const [message, setMessage] = useState(null);

  const onPick = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (fileRef.current) fileRef.current.value = ''; // allow re-picking the same file
    if (!file) return;

    setState('working');
    setMessage(null);
    try {
      const dump = JSON.parse(await file.text());
      const { rooms: parsedRooms, features, events: parsedEvents } = transformDump(dump);
      // Rooms and events are distinct capture-only collections — merge and post
      // each against its own existing docs so GM notes (rooms) and tracking
      // progress (events) are preserved per collection on a re-import.
      const roomDocs = mergeGmFields([...features, ...parsedRooms], rooms);
      const eventDocs = mergeGmFields(parsedEvents, events);
      if (!roomDocs.length && !eventDocs.length) {
        setState('error');
        setMessage('That file has no adventure rooms or events in it — is it the journal dump from the export macro?');
        return;
      }
      const roomRes = roomDocs.length ? await importRooms(roomDocs) : { created: 0, updated: 0, unchanged: 0 };
      const eventRes = eventDocs.length ? await importEvents(eventDocs) : { created: 0, updated: 0, unchanged: 0 };
      await refresh();
      setState('done');
      setMessage(
        `Imported ${roomDocs.length} rooms (${roomRes.created} new, ${roomRes.updated} updated, ${roomRes.unchanged} unchanged) ` +
          `and ${eventDocs.length} events (${eventRes.created} new, ${eventRes.updated} updated, ${eventRes.unchanged} unchanged).`,
      );
    } catch (err) {
      setState('error');
      setMessage(
        err instanceof SyntaxError
          ? "Couldn't read that file — make sure it's the .json the export macro downloaded."
          : `Import failed: ${err.message}`,
      );
    }
  };

  return (
    <div className="gm-rooms-import">
      <button
        type="button"
        className="btn-primary"
        disabled={state === 'working'}
        onClick={() => fileRef.current && fileRef.current.click()}
      >
        {state === 'working' ? 'Importing…' : label}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        aria-label="Adventure journal dump file"
        className="gm-rooms-import-file"
        onChange={onPick}
      />
      {message && (
        <p className={state === 'error' ? 'gm-warn' : 'gm-ok'} role="status">{message}</p>
      )}
    </div>
  );
};

export default RoomsImportButton;
