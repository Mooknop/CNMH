import React, { useMemo, useState } from 'react';
import './EntryListEditor.css';

// Generic master-detail editor for a GM array section: a searchable picker
// list on the left, the structured editor for the selected entry on the right.
// Modeled on CatalogPickerModal's two-pane layout, but the right pane is an
// editable subform (via `renderDetail`) instead of a read-only preview, and it
// lives inline in a tab rather than in a modal. State (entries, selection) is
// lifted to the parent CharacterForm — this component only renders it.
//
// Props:
//   label        – section noun, e.g. "Strikes"
//   idPrefix     – testid/aria namespace, e.g. "strikes"
//   entries      – the form-shaped entries array
//   selectedIndex – index into `entries` of the open entry, or null
//   onSelect(i)  – open entry i
//   onAdd()      – append a blank entry (parent selects it)
//   onRemove(i)  – drop entry i
//   nameOf(e)    – display name for an entry (may be empty)
//   addLabel     – text for the add button (defaults from `label`)
//   emptyHint    – right-pane text when nothing is selected
//   renderDetail(entry, i) – the editor for the selected entry
const EntryListEditor = ({
  label,
  idPrefix,
  entries,
  selectedIndex,
  onSelect,
  onAdd,
  onRemove,
  nameOf,
  addLabel,
  emptyHint,
  renderDetail,
}) => {
  const [query, setQuery] = useState('');

  const display = (e) => {
    const n = nameOf ? nameOf(e) : e && e.name;
    return n && String(n).trim() ? String(n) : '(unnamed)';
  };

  // Keep each row's ORIGINAL index so select/remove stay correct under filter.
  const rows = useMemo(() => {
    const all = entries.map((e, i) => ({ e, i }));
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(({ e }) => display(e).toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, query]);

  const selected =
    selectedIndex != null && selectedIndex >= 0 && selectedIndex < entries.length
      ? entries[selectedIndex]
      : null;

  return (
    <div className="form-group">
      <label>{label}</label>
      <div className="gm-md">
        <div className="gm-md-list">
          <input
            type="text"
            className="gm-md-search"
            aria-label={`${idPrefix}-search`}
            placeholder={`Search ${label.toLowerCase()}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="gm-md-results" aria-label={`${idPrefix} list`}>
            {entries.length === 0 && (
              <li className="gm-count gm-md-empty-list">
                No {label.toLowerCase()} yet. Use “{addLabel || `Add ${label.toLowerCase()} entry`}”.
              </li>
            )}
            {entries.length > 0 && rows.length === 0 && (
              <li className="gm-count gm-md-empty-list">No matches.</li>
            )}
            {rows.map(({ e, i }) => (
              <li key={i} className="gm-md-row">
                <button
                  type="button"
                  className={`gm-md-option${i === selectedIndex ? ' active' : ''}`}
                  data-testid={`${idPrefix}-list-${i}`}
                  aria-pressed={i === selectedIndex}
                  onClick={() => onSelect(i)}
                >
                  {display(e)}
                </button>
                <button
                  type="button"
                  className="gm-md-remove"
                  data-testid={`${idPrefix}-list-${i}-remove`}
                  aria-label={`remove ${idPrefix} ${i}`}
                  onClick={() => onRemove(i)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn-small btn-secondary"
            data-testid={`${idPrefix}-add`}
            onClick={onAdd}
          >
            {addLabel || `Add ${label.toLowerCase()} entry`}
          </button>
        </div>
        <div className="gm-md-detail" data-testid={`${idPrefix}-detail`}>
          {selected ? (
            renderDetail(selected, selectedIndex)
          ) : (
            <p className="gm-count gm-md-empty">
              {emptyHint || `Select a ${label.toLowerCase()} entry to edit it, or add one.`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default EntryListEditor;
