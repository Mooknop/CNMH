import React, { useMemo, useState } from 'react';
import TraitTag from '../shared/TraitTag';
import { formatBulk } from '../../utils/InventoryUtils';
import './CatalogPicker.css';

// Read-only detail preview for the focused catalog item. Mirrors the fields
// ItemModal surfaces (name, traits, price, Bulk, description, kind flags) so
// the GM can confirm what they're adding before committing it to the row list.
const CatalogItemPreview = ({ item }) => {
  if (!item) {
    return (
      <p className="gm-count catalog-preview-empty">
        Select an item on the left to preview its details.
      </p>
    );
  }
  return (
    <div className="catalog-preview" data-testid="catalog-preview">
      <h3>{item.name || item.id}</h3>
      {Array.isArray(item.traits) && item.traits.length > 0 && (
        <div className="item-traits">
          {item.traits.map((t, i) => (
            <TraitTag key={i} trait={t} />
          ))}
        </div>
      )}
      <div className="catalog-preview-meta">
        <span>Price {item.price != null ? item.price : 0}</span>
        <span>Bulk {formatBulk(item.weight || 0)}</span>
        {item.container ? <span>Container</span> : null}
        {item.scroll ? <span>Scroll</span> : null}
        {item.wand ? <span>Wand</span> : null}
      </div>
      {item.description && <p className="catalog-preview-desc">{item.description}</p>}
    </div>
  );
};

/**
 * Searchable catalog item picker *body* — chrome-free, so it can render inline
 * on a page (GM Shops) or inside a Modal (CatalogPickerModal); the wrapper
 * supplies the surrounding frame. Mounts fresh each time it's shown, so its
 * transient selection state resets without an open-effect.
 *
 * Props:
 *   catalog     – array of catalog item docs
 *   onSelect    – called with the array of chosen catalog items on "Add selected"
 *   onCancel    – called when the GM dismisses without selecting
 *   multiSelect – when true, several items can be checked and added at once;
 *                 when false (e.g. re-pointing a row) only one can be chosen
 */
const CatalogPicker = ({ catalog, onSelect, onCancel, multiSelect = false }) => {
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [focusId, setFocusId] = useState(null);

  const list = useMemo(() => (Array.isArray(catalog) ? catalog : []), [catalog]);
  const results = useMemo(() => {
    const sorted = [...list].sort((a, b) =>
      String(a.name || a.id)
        .toLowerCase()
        .localeCompare(String(b.name || b.id).toLowerCase())
    );
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (c) =>
        String(c.name || '').toLowerCase().includes(q) ||
        String(c.id || '').toLowerCase().includes(q)
    );
  }, [list, query]);

  const isSelected = (id) => selectedIds.some((x) => String(x) === String(id));

  const choose = (id) => {
    setFocusId(id);
    if (multiSelect) {
      setSelectedIds((prev) =>
        prev.some((x) => String(x) === String(id))
          ? prev.filter((x) => String(x) !== String(id))
          : [...prev, id]
      );
    } else {
      setSelectedIds([id]);
    }
  };

  const selectedItems = selectedIds
    .map((id) => list.find((c) => String(c.id) === String(id)))
    .filter(Boolean);
  const focused = list.find((c) => String(c.id) === String(focusId)) || null;

  const submit = () => {
    if (selectedItems.length === 0) return;
    onSelect(selectedItems);
  };

  return (
    <>
      <div className="catalog-picker">
        <div className="catalog-picker-list">
          <input
            type="text"
            className="catalog-picker-search"
            aria-label="catalog search"
            placeholder="Search items…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="catalog-picker-results" aria-label="catalog results">
            {results.length === 0 && (
              <li className="gm-count">No matching catalog items.</li>
            )}
            {results.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`catalog-picker-option${isSelected(c.id) ? ' active' : ''}`}
                  aria-pressed={isSelected(c.id)}
                  onClick={() => choose(c.id)}
                >
                  {multiSelect && (
                    <span aria-hidden="true" className="catalog-picker-check">
                      {isSelected(c.id) ? '☑' : '☐'}
                    </span>
                  )}
                  {c.name || c.id}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="catalog-picker-preview">
          <CatalogItemPreview item={focused} />
        </div>
      </div>
      <div className="gm-actions catalog-picker-actions">
        {multiSelect && (
          <span className="gm-count catalog-picker-count" aria-live="polite">
            {selectedItems.length} selected
          </span>
        )}
        <button
          type="button"
          className="btn-primary"
          aria-label="Add selected"
          disabled={selectedItems.length === 0}
          onClick={submit}
        >
          Add selected
          {multiSelect && selectedItems.length > 0 ? ` (${selectedItems.length})` : ''}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </>
  );
};

export default CatalogPicker;
