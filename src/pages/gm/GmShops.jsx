import React, { useMemo, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useShops } from '../../hooks/useShops';
import { itemCatalogMap, runeCatalogMap } from '../../utils/contentUtils';
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

// A ware row is local form state until Save: { ref, level (string), runeRef
// (string), price (string), stock (string) }. `level` pins a variant of a
// multi-level item (#798); '' means none. A rune sold as a Runestone (#801) is
// a row with ref 'runestone' + a `runeRef`.
const toRows = (wares) =>
  (Array.isArray(wares) ? wares : []).map((w) => ({
    ref: w.ref,
    level: w.level != null ? String(w.level) : '',
    runeRef: w.runeRef != null ? String(w.runeRef) : '',
    price: w.price != null ? String(w.price) : '',
    stock: w.stock != null ? String(w.stock) : '',
  }));

// Stable per-row key: `runestone@runeRef` for a rune ware, `ref@level` for a
// pinned variant, else the bare ref — mirrors resolveShopWares' wareKey so a
// shop can stock several variants/runes of the same ref without colliding.
const rowKey = (r) => {
  if (r.ref === 'runestone') return r.runeRef ? `runestone@${r.runeRef}` : 'runestone';
  return r.level !== '' && r.level != null ? `${r.ref}@${r.level}` : String(r.ref);
};

// Form state → stored wares: keep `level` (variant) or `runeRef` (runestone);
// drop blank overrides so resolveShopWares falls back to the variant/catalog/
// rune price; keep stock only when a non-negative integer is given.
const fromRows = (rows) =>
  rows
    .filter((r) => r.ref)
    .map((r) => {
      const w = { ref: r.ref };
      if (r.ref === 'runestone') {
        if (r.runeRef) w.runeRef = r.runeRef;
      } else {
        const level = parseInt(r.level, 10);
        if (!Number.isNaN(level)) w.level = level;
      }
      const price = parseFloat(r.price);
      if (!Number.isNaN(price)) w.price = price;
      const stock = parseInt(r.stock, 10);
      if (!Number.isNaN(stock) && stock >= 0) w.stock = stock;
      return w;
    });

const ShopWaresForm = ({ location, shops, items, runes, catalogMap, runeMap, setWares, onSaved }) => {
  const loreId = location.id;
  const [rows, setRows] = useState(() => toRows(shops[loreId]?.wares));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [runePickerOpen, setRunePickerOpen] = useState(false);

  const setRow = (i, patch) =>
    setRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i) => setRows((cur) => cur.filter((_, idx) => idx !== i));

  // Append picked rows, skipping any whose row key already exists. `make` turns a
  // picked entry into a blank ware row.
  const addRows = (picked, make) => {
    setRows((cur) => {
      const have = new Set(cur.map((r) => rowKey(r)));
      const adds = (picked || [])
        .filter((it) => it && it.id != null)
        .map(make)
        .filter((r) => !have.has(rowKey(r)));
      return [...cur, ...adds];
    });
  };

  // Catalog items → unleveled rows (the GM pins a variant via the row select).
  const addItems = (picked) =>
    addRows(picked, (it) => ({ ref: it.id, level: '', runeRef: '', price: '', stock: '' }));
  // Catalog runes → runestone rows (#801): sold as a Runestone of that rune.
  const addRunes = (picked) =>
    addRows(picked, (it) => ({ ref: 'runestone', level: '', runeRef: it.id, price: '', stock: '' }));

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
        <div className="gm-shop-head-actions">
          <button
            type="button"
            className="btn-small btn-secondary"
            aria-expanded={pickerOpen}
            onClick={() => { setPickerOpen((o) => !o); setRunePickerOpen(false); }}
          >
            + Add items
          </button>
          <button
            type="button"
            className="btn-small btn-secondary"
            aria-expanded={runePickerOpen}
            onClick={() => { setRunePickerOpen((o) => !o); setPickerOpen(false); }}
          >
            + Add rune
          </button>
        </div>
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

      {runePickerOpen && (
        <div className="gm-shop-picker" data-testid="shop-rune-picker">
          <CatalogPicker
            catalog={runes}
            multiSelect
            onSelect={(picked) => {
              addRunes(picked);
              setRunePickerOpen(false);
            }}
            onCancel={() => setRunePickerOpen(false)}
          />
        </div>
      )}

      {rows.length > 0 && (
        <ul className="gm-shop-wares" aria-label="wares">
          {rows.map((r, i) => {
            const isRune = r.ref === 'runestone';
            const rune = isRune && r.runeRef ? runeMap.get(String(r.runeRef)) : null;
            const item = !isRune ? catalogMap.get(String(r.ref)) : null;
            const variants = Array.isArray(item?.variants) ? item.variants : [];
            const variant = variants.find((v) => String(v.level) === String(r.level));
            const key = rowKey(r);
            // Runestone → "<Rune> Runestone"; variant → its name; else base item.
            const name = isRune
              ? rune ? `${rune.name} Runestone` : `Runestone (unknown: ${r.runeRef})`
              : variant ? variant.name || item.name : item ? item.name : `(unknown: ${r.ref})`;
            const placeholderPrice = isRune
              ? rune ? 3 + (Number(rune.price) || 0) : 3
              : variant ? variant.price : item?.price;
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
  const { allLoreEntries, items, runes } = useContent();
  const { shops, setWares } = useShops();
  const catalogMap = useMemo(() => itemCatalogMap(items), [items]);
  const runeMap = useMemo(() => runeCatalogMap(runes), [runes]);

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
            runes={runes}
            catalogMap={catalogMap}
            runeMap={runeMap}
            setWares={setWares}
            onSaved={onSaved}
          />
        )}
      />
    </div>
  );
};

export default GmShops;
