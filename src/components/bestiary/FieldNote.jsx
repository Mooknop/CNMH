import React, { useEffect, useState } from 'react';

// A party field note on a creature (#780). Read-only on the in-combat compact
// card; an editable parchment scrap on the full /bestiary entry. Renders nothing
// when there is no note and editing isn't offered. The note is free text — a
// player signs their own scribble inline ("…stop zapping it!! —Vex").
const FieldNote = ({ note = '', editable = false, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note);

  // Keep the draft in sync with external updates while not actively editing.
  useEffect(() => {
    if (!editing) setDraft(note);
  }, [note, editing]);

  // Read-only (compact card, or full entry without an editor): show or hide.
  if (!editable) {
    return note ? <div className="dex-note dex-note--ro">{note}</div> : null;
  }

  if (editing) {
    const commit = () => {
      onSave?.(draft);
      setEditing(false);
    };
    return (
      <div className="dex-note dex-note--edit">
        <textarea
          className="dex-note-input"
          aria-label="Field note"
          rows={2}
          maxLength={140}
          value={draft}
          placeholder="scribble a note…"
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
        />
        <div className="dex-note-actions">
          <button type="button" className="dex-note-save" onClick={commit}>Save</button>
          <button
            type="button"
            className="dex-note-cancel"
            onClick={() => { setDraft(note); setEditing(false); }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Display with an edit affordance — existing scrap, or an "add" prompt.
  return note ? (
    <button
      type="button"
      className="dex-note dex-note--scrap"
      onClick={() => setEditing(true)}
      aria-label="Edit field note"
    >
      {note}
    </button>
  ) : (
    <button
      type="button"
      className="dex-note dex-note--add"
      onClick={() => setEditing(true)}
    >
      + add field note
    </button>
  );
};

export default FieldNote;
