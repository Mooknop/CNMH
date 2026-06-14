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
//   allowNew      – show the "New" button + enable the create path (default true);
//                   false for read-only managers (e.g. GmLore reveal manager)
//   renderDetail(entry | null, isNew, { onSaved, onRestored }) – form body
//   emptyHint     – right-pane text when nothing is selected
//   header        – optional ReactNode above the list (e.g. GmLore category tabs)
//   filterEntry(e, query) – optional custom filter; default checks nameOf only
//   groupOf(e)    – optional group label; renders a heading row whenever the
//                   group of consecutive displayed entries changes (callers
//                   should pre-sort entries by group)
//   renderBulkPanel(selectedEntries, { clearSelection, onSaved }) – optional;
//                   enables a "Select" mode with row checkboxes. While ≥1 row
//                   is checked the detail pane shows this panel instead of the
//                   entry form. Select-all acts on the filtered list.
const PageEditorShell = ({
  entries = [],
  nameOf = (e) => e.name || e.title || e.id,
  idOf = (e) => e.id,
  noun = 'entry',
  addLabel,
  allowNew = true,
  renderDetail,
  emptyHint,
  header,
  filterEntry,
  groupOf,
  renderBulkPanel,
}) => {
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [flash, setFlash] = useState(null);
  const [selecting, setSelecting] = useState(false);
  const [checked, setChecked] = useState(() => new Set());

  const isNew = selectedId === '__new__';
  const selectedEntry = isNew ? null : entries.find((e) => idOf(e) === selectedId) ?? null;
  const showDetail = selectedId != null && (isNew || selectedEntry != null);

  // After creating an entry, keep its form open (reselect by saved id) so the GM
  // can keep editing what they just made instead of dropping back to the empty
  // hint. The form remounts on the saved entry once it lands in `entries` via
  // the content-sync broadcast. Callers that omit savedId (deletes, bulk panel)
  // fall back to deselect.
  const onSaved = (wasNew, savedId) => {
    if (wasNew) setSelectedId(savedId ?? null);
    setFlash('Saved. Changes are live for every connected player.');
  };
  const onRestored = () =>
    setFlash('Restored. Changes are live for every connected player.');

  const clearSelection = () => setChecked(new Set());
  const toggleSelecting = () => {
    setSelecting((cur) => !cur);
    clearSelection();
  };
  const toggleChecked = (id) =>
    setChecked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // Filter (not map) so ids checked under a stale filter/tab can't resurrect
  // entries that are no longer in the list.
  const checkedEntries = entries.filter((e) => checked.has(idOf(e)));
  const bulkActive = selecting && checkedEntries.length > 0;

  const q = query.trim().toLowerCase();
  const displayed = !q
    ? entries
    : filterEntry
    ? entries.filter((e) => filterEntry(e, q))
    : entries.filter((e) => String(nameOf(e) || '').toLowerCase().includes(q));

  return (
    <div className="gm-ped">
      {flash && (
        <p className="gm-live-note" role="status">
          <span className="dot" aria-hidden="true" />
          {flash}
        </p>
      )}
      <div className="gm-ped-body">
        <div className="gm-ped-master">
          {header}
          <div className="gm-ped-toolbar">
            {allowNew && (
              <button
                type="button"
                className="btn-primary btn-small gm-ped-add"
                disabled={selecting}
                onClick={() => setSelectedId('__new__')}
              >
                {addLabel ?? `+ New ${noun}`}
              </button>
            )}
            {renderBulkPanel && (
              <button
                type="button"
                className={`btn-secondary btn-small gm-ped-select-toggle${selecting ? ' active' : ''}`}
                aria-pressed={selecting}
                onClick={toggleSelecting}
              >
                {selecting ? 'Done' : 'Select'}
              </button>
            )}
          </div>
          {selecting && (
            <div className="gm-ped-selectbar">
              <span className="gm-count">{checked.size} selected</span>
              <button
                type="button"
                className="btn-secondary btn-small"
                onClick={() =>
                  setChecked(new Set(displayed.map((e) => idOf(e))))
                }
              >
                Select all
              </button>
              <button
                type="button"
                className="btn-secondary btn-small"
                disabled={checked.size === 0}
                onClick={clearSelection}
              >
                None
              </button>
            </div>
          )}
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
            {displayed.map((e, i) => {
              const id = idOf(e);
              const group = groupOf ? groupOf(e) : null;
              const newGroup =
                groupOf && (i === 0 || groupOf(displayed[i - 1]) !== group);
              return (
                <React.Fragment key={id}>
                  {newGroup && (
                    <li className="gm-ped-group" role="presentation">
                      {group}
                    </li>
                  )}
                  <li className="gm-ped-row">
                    {selecting ? (
                      <label className={`gm-ped-item gm-ped-checkrow${checked.has(id) ? ' active' : ''}`}>
                        <input
                          type="checkbox"
                          aria-label={`select ${id}`}
                          checked={checked.has(id)}
                          onChange={() => toggleChecked(id)}
                        />
                        <span className="gm-ped-checkrow-name">{nameOf(e)}</span>
                      </label>
                    ) : (
                      <button
                        type="button"
                        className={`gm-ped-item${id === selectedId ? ' active' : ''}`}
                        aria-pressed={id === selectedId}
                        onClick={() => setSelectedId(id)}
                      >
                        {nameOf(e)}
                      </button>
                    )}
                  </li>
                </React.Fragment>
              );
            })}
          </ul>
          <p className="gm-count">
            Showing {displayed.length} of {entries.length}
          </p>
        </div>
        <div className="gm-ped-detail">
          {bulkActive ? (
            renderBulkPanel(checkedEntries, { clearSelection, onSaved })
          ) : selecting ? (
            <p className="gm-count gm-ped-hint">
              Check {noun}s in the list to bulk-edit them.
            </p>
          ) : showDetail ? (
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
