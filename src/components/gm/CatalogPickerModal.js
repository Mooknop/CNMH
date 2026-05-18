import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../shared/Modal';
import TraitTag from '../shared/TraitTag';
import { formatBulk } from '../../utils/InventoryUtils';
import './CatalogPickerModal.css';

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
 * Searchable catalog item picker. The selection is local to this modal until
 * the GM presses "Add to character"; that calls onSelect(catalogItem) and the
 * caller appends it to the in-memory form (still saved only via the Save
 * button). Stacks above the item-edit modal via Modal's highZ.
 *
 * Props:
 *   isOpen   – visibility
 *   onClose  – close without selecting
 *   catalog  – array of catalog item docs
 *   onSelect – called with the chosen catalog item on submit
 *   title    – optional header text
 */
const CatalogPickerModal = ({ isOpen, onClose, catalog, onSelect, title }) => {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  // Reset transient state each time the picker opens (the instance stays
  // mounted while closed, mirroring HistoryModal's open-effect pattern).
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedId(null);
    }
  }, [isOpen]);

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

  const selected = list.find((c) => String(c.id) === String(selectedId)) || null;

  const submit = () => {
    if (!selected) return;
    onSelect(selected);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title || 'Add an item from the catalog'}
      maxWidth="760px"
      highZ
    >
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
          <ul
            className="catalog-picker-results"
            aria-label="catalog results"
          >
            {results.length === 0 && (
              <li className="gm-count">No matching catalog items.</li>
            )}
            {results.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`catalog-picker-option${
                    String(c.id) === String(selectedId) ? ' active' : ''
                  }`}
                  aria-pressed={String(c.id) === String(selectedId)}
                  onClick={() => setSelectedId(c.id)}
                >
                  {c.name || c.id}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="catalog-picker-preview">
          <CatalogItemPreview item={selected} />
        </div>
      </div>
      <div className="gm-actions catalog-picker-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={!selected}
          onClick={submit}
        >
          Add to character
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
};

export default CatalogPickerModal;
