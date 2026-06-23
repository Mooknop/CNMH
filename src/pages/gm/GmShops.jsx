import React, { useMemo, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useShops } from '../../hooks/useShops';
import { itemCatalogMap } from '../../utils/contentUtils';
import { isShop } from '../../utils/shopUtils';
import PageEditorShell from '../../components/gm/PageEditorShell';
import CatalogPickerModal from '../../components/gm/CatalogPickerModal';
import './gm.css';

// GM wares editor (#696 S2). Shops are app-managed, not vault content: each
// Location lore entry can be given a wares list in the synced `cnmh_shops_global`
// store (#697). The master list is every Location entry; selecting one edits its
// wares through useShops.setWares. No saveDocument / no raw-JSON box (#248) — the
// catalog item picker drives "which items," with optional per-ware price override
// and stock.

// A ware row is local form state until Save: { ref, price (string), stock (string) }.
const toRows = (wares) =>
  (Array.isArray(wares) ? wares : []).map((w) => ({
    ref: w.ref,
    price: w.price != null ? String(w.price) : '',
    stock: w.stock != null ? String(w.stock) : '',
  }));

// Form state → stored wares: drop blank overrides so resolveShopWares falls back
// to the catalog price; keep stock only when a non-negative integer is given.
const fromRows = (rows) =>
  rows
    .filter((r) => r.ref)
    .map((r) => {
      const w = { ref: r.ref };
      const price = parseFloat(r.price);
      if (!Number.isNaN(price)) w.price = price;
      const stock = parseInt(r.stock, 10);
      if (!Number.isNaN(stock) && stock >= 0) w.stock = stock;
      return w;
    });

const ShopWaresForm = ({ location, shops, items, catalogMap, setWares, onSaved }) => {
  const loreId = location.id;
  const [rows, setRows] = useState(() => toRows(shops[loreId]?.wares));
  const [pickerOpen, setPickerOpen] = useState(false);

  const setRow = (i, patch) =>
    setRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i) => setRows((cur) => cur.filter((_, idx) => idx !== i));

  // Append the picked catalog items as new ware rows, skipping refs already listed.
  const addItems = (picked) => {
    setRows((cur) => {
      const have = new Set(cur.map((r) => String(r.ref)));
      const adds = (picked || [])
        .filter((it) => it && it.id != null && !have.has(String(it.id)))
        .map((it) => ({ ref: it.id, price: '', stock: '' }));
      return [...cur, ...adds];
    });
  };

  const save = () => {
    setWares(loreId, fromRows(rows));
    onSaved(false);
  };

  return (
    <div className="gm-card" data-testid={`shop-form-${loreId}`}>
      <div className="gm-row gm-shop-head">
        <div>
          <h3 className="gm-shop-title">{location.title}</h3>
          <p className="gm-count">
            {rows.length === 0
              ? 'No wares yet — this location is not a shop.'
              : `${rows.length} ware${rows.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <button
          type="button"
          className="btn-small btn-secondary"
          onClick={() => setPickerOpen(true)}
        >
          + Add items
        </button>
      </div>

      {rows.length > 0 && (
        <ul className="gm-shop-wares" aria-label="wares">
          {rows.map((r, i) => {
            const item = catalogMap.get(String(r.ref));
            return (
              <li key={r.ref} className="gm-row gm-shop-ware-row">
                <span className="gm-shop-ware-name">{item ? item.name : `(unknown: ${r.ref})`}</span>
                <div className="form-group gm-shop-ware-field">
                  <label htmlFor={`price-${r.ref}`}>price (gp)</label>
                  <input
                    id={`price-${r.ref}`}
                    aria-label={`price-${r.ref}`}
                    type="number"
                    min="0"
                    placeholder={item && item.price != null ? String(item.price) : 'catalog'}
                    value={r.price}
                    onChange={(e) => setRow(i, { price: e.target.value })}
                  />
                </div>
                <div className="form-group gm-shop-ware-field">
                  <label htmlFor={`stock-${r.ref}`}>stock</label>
                  <input
                    id={`stock-${r.ref}`}
                    aria-label={`stock-${r.ref}`}
                    type="number"
                    min="0"
                    placeholder="∞"
                    value={r.stock}
                    onChange={(e) => setRow(i, { stock: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  className="btn-small btn-danger"
                  aria-label={`remove-${r.ref}`}
                  onClick={() => removeRow(i)}
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="gm-actions">
        <button type="button" className="btn-primary" onClick={save}>
          Save wares
        </button>
      </div>

      <CatalogPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        catalog={items}
        multiSelect
        title={`Add wares to ${location.title}`}
        onSelect={addItems}
      />
    </div>
  );
};

const GmShops = () => {
  const { allLoreEntries, items } = useContent();
  const { shops, setWares } = useShops();
  const catalogMap = useMemo(() => itemCatalogMap(items), [items]);

  // Master list: every Location lore entry, title-sorted. Shops (those with
  // wares) get a "shop" badge via the name renderer so the GM can see at a glance
  // which locations already sell something.
  const locations = useMemo(
    () =>
      (allLoreEntries || [])
        .filter((e) => (e.category || '').trim() === 'Location')
        .slice()
        .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''))),
    [allLoreEntries]
  );

  return (
    <div className="gm-shops">
      <PageEditorShell
        entries={locations}
        nameOf={(e) => (
          <>
            {e.title}
            {isShop(e.id, shops) && <span className="gm-shop-badge"> · shop</span>}
          </>
        )}
        noun="location"
        allowNew={false}
        emptyHint="Select a Location to manage the items it sells."
        filterEntry={(e, q) =>
          [e.title, e.summary].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
        }
        renderDetail={(entry, _isNew, { onSaved }) => (
          <ShopWaresForm
            location={entry}
            shops={shops}
            items={items}
            catalogMap={catalogMap}
            setWares={setWares}
            onSaved={onSaved}
          />
        )}
      />
    </div>
  );
};

export default GmShops;
