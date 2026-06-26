import React, { useMemo, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useShops } from '../../hooks/useShops';
import { itemCatalogMap } from '../../utils/contentUtils';
import { isShop } from '../../utils/shopUtils';
import PageEditorShell from '../../components/gm/PageEditorShell';
import CatalogPicker from '../../components/gm/CatalogPicker';
import './gm.css';

// GM wares editor (#696 S2). Shops are app-managed, not vault content: each
// Location lore entry can be given a wares list in the synced `cnmh_shops_global`
// store (#697). The master list is every Location entry; selecting one edits its
// wares through useShops.setWares. No saveDocument / no raw-JSON box (#248) — the
// catalog item picker drives "which items," with optional per-ware price override
// and stock.

// A ware row is local form state until Save: { ref, level (string), price
// (string), stock (string) }. `level` pins a variant of a multi-level item
// (#798); '' means none (a flat item, or the base of a variant item).
const toRows = (wares) =>
  (Array.isArray(wares) ? wares : []).map((w) => ({
    ref: w.ref,
    level: w.level != null ? String(w.level) : '',
    price: w.price != null ? String(w.price) : '',
    stock: w.stock != null ? String(w.stock) : '',
  }));

// Stable per-row key, unique per (ref, level): the bare ref for an unleveled
// row, `ref@level` for a pinned variant — mirrors resolveShopWares' wareKey so a
// shop can stock two variants of the same item without colliding on its id.
const rowKey = (r) => (r.level !== '' && r.level != null ? `${r.ref}@${r.level}` : String(r.ref));

// Form state → stored wares: keep `level` when a variant is pinned; drop blank
// overrides so resolveShopWares falls back to the variant/catalog price; keep
// stock only when a non-negative integer is given.
const fromRows = (rows) =>
  rows
    .filter((r) => r.ref)
    .map((r) => {
      const w = { ref: r.ref };
      const level = parseInt(r.level, 10);
      if (!Number.isNaN(level)) w.level = level;
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

  // Append the picked catalog items as new (unleveled) ware rows, skipping any
  // whose row key already exists. A multi-level item is added at level '' — the
  // GM then pins a variant via the row's level select; to stock a second variant
  // they add the item again (its unleveled row key is free once the first is set).
  const addItems = (picked) => {
    setRows((cur) => {
      const have = new Set(cur.map((r) => rowKey(r)));
      const adds = (picked || [])
        .filter((it) => it && it.id != null)
        .map((it) => ({ ref: it.id, level: '', price: '', stock: '' }))
        .filter((r) => !have.has(rowKey(r)));
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
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen((o) => !o)}
        >
          + Add items
        </button>
      </div>

      {pickerOpen && (
        <div className="gm-shop-picker" data-testid="shop-picker">
          <CatalogPicker
            catalog={items}
            multiSelect
            onSelect={(picked) => {
              addItems(picked);
              setPickerOpen(false);
            }}
            onCancel={() => setPickerOpen(false)}
          />
        </div>
      )}

      {rows.length > 0 && (
        <ul className="gm-shop-wares" aria-label="wares">
          {rows.map((r, i) => {
            const item = catalogMap.get(String(r.ref));
            const variants = Array.isArray(item?.variants) ? item.variants : [];
            const variant = variants.find((v) => String(v.level) === String(r.level));
            const key = rowKey(r);
            // Variant name when a level is pinned, else the base item name.
            const name = variant ? variant.name || item.name : item ? item.name : `(unknown: ${r.ref})`;
            const placeholderPrice = variant ? variant.price : item?.price;
            // Levels already claimed by OTHER rows of this same item — excluded
            // from the select so the GM can't author a duplicate (ref, level).
            const taken = new Set(
              rows
                .filter((x, idx) => idx !== i && x.ref === r.ref && x.level !== '')
                .map((x) => String(x.level))
            );
            return (
              <li key={key} className="gm-row gm-shop-ware-row">
                <span className="gm-shop-ware-name">{name}</span>
                {variants.length > 0 && (
                  <div className="form-group gm-shop-ware-field">
                    <label htmlFor={`level-${key}`}>variant</label>
                    <select
                      id={`level-${key}`}
                      aria-label={`level-${key}`}
                      value={r.level}
                      onChange={(e) => setRow(i, { level: e.target.value })}
                    >
                      <option value="">— select —</option>
                      {variants
                        .filter((v) => String(v.level) === String(r.level) || !taken.has(String(v.level)))
                        .map((v) => (
                          <option key={v.level} value={String(v.level)}>
                            {v.label || v.name || `Level ${v.level}`} (L{v.level})
                          </option>
                        ))}
                    </select>
                  </div>
                )}
                <div className="form-group gm-shop-ware-field">
                  <label htmlFor={`price-${key}`}>price (gp)</label>
                  <input
                    id={`price-${key}`}
                    aria-label={`price-${key}`}
                    type="number"
                    min="0"
                    placeholder={placeholderPrice != null ? String(placeholderPrice) : 'catalog'}
                    value={r.price}
                    onChange={(e) => setRow(i, { price: e.target.value })}
                  />
                </div>
                <div className="form-group gm-shop-ware-field">
                  <label htmlFor={`stock-${key}`}>stock</label>
                  <input
                    id={`stock-${key}`}
                    aria-label={`stock-${key}`}
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
                  aria-label={`remove-${key}`}
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
