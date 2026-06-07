import React, { useState } from 'react';

// Shared two-column master/detail shell for page-level GM content editors.
// Left pane: searchable list + "New" button. Right pane: the selected entry's
// form (or a blank form for a new entry). Form bodies are passed via renderDetail
// and remain completely unchanged — same aria-labels, same save/delete/history.
//
// Props:
//   entries       – array of content objects from useContent (pre-sorted by parent)
//   nameOf(e)     – display name for a list row
//   idOf(e)       – unique id (default: e => e.id)
//   noun          – singular noun for hints, e.g. 'quest', 'item'
//   addLabel      – "New" button text
//   renderDetail(entry | null, isNew, { onSaved, onRestored }) – form body
//   emptyHint     – right-pane text when nothing is selected
//   header        – optional ReactNode above the list (e.g. GmLore category tabs)
//   filterEntry(e, query) – optional custom filter; default checks nameOf only
const PageEditorShell = ({
  entries = [],
  nameOf = (e) => e.name || e.title || e.id,
  idOf = (e) => e.id,
  noun = 'entry',
  addLabel,
  renderDetail,
  emptyHint,
  header,
  filterEntry,
}) => {
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [flash, setFlash] = useState(null);

  const isNew = selectedId === '__new__';
  const selectedEntry = isNew ? null : entries.find((e) => idOf(e) === selectedId) ?? null;
  const showDetail = selectedId != null && (isNew || selectedEntry != null);

  const onSaved = (wasNew) => {
    if (wasNew) setSelectedId(null);
    setFlash('Saved. Changes are live for every connected player.');
  };
  const onRestored = () =>
    setFlash('Restored. Changes are live for every connected player.');

  const q = query.trim().toLowerCase();
  const displayed = !q
    ? entries
    : filterEntry
    ? entries.filter((e) => filterEntry(e, q))
    : entries.filter((e) => String(nameOf(e) || '').toLowerCase().includes(q));

  return (
    <div className="gm-ped">
      {flash && (
        <p className="gm-ok" role="status">
          {flash}
        </p>
      )}
      <div className="gm-ped-body">
        <div className="gm-ped-master">
          {header}
          <button
            type="button"
            className="btn-primary btn-small gm-ped-add"
            onClick={() => setSelectedId('__new__')}
          >
            {addLabel ?? `+ New ${noun}`}
          </button>
          <input
            type="text"
            className="gm-ped-search"
            aria-label="filter"
            placeholder={`Search ${entries.length} ${noun}s…`}
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
          />
          <ul className="gm-ped-items" aria-label={`${noun} list`}>
            {entries.length === 0 && (
              <li className="gm-count gm-ped-hint">No {noun}s yet.</li>
            )}
            {entries.length > 0 && displayed.length === 0 && (
              <li className="gm-count gm-ped-hint">No matches.</li>
            )}
            {displayed.map((e) => {
              const id = idOf(e);
              return (
                <li key={id} className="gm-ped-row">
                  <button
                    type="button"
                    className={`gm-ped-item${id === selectedId ? ' active' : ''}`}
                    aria-pressed={id === selectedId}
                    onClick={() => setSelectedId(id)}
                  >
                    {nameOf(e)}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="gm-count">
            Showing {displayed.length} of {entries.length}
          </p>
        </div>
        <div className="gm-ped-detail">
          {showDetail ? (
            <React.Fragment key={selectedId}>
              {renderDetail(selectedEntry, isNew, { onSaved, onRestored })}
            </React.Fragment>
          ) : (
            <p className="gm-count gm-ped-hint">
              {emptyHint ?? `Select a ${noun} to edit it, or add one.`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default PageEditorShell;
