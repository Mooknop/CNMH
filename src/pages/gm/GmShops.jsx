import React, { useMemo, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useShops } from '../../hooks/useShops';
import { itemCatalogMap, runeCatalogMap } from '../../utils/contentUtils';
import { isSetUp } from '../../utils/shopUtils';
import PageEditorShell from '../../components/gm/PageEditorShell';
import CatalogPicker from '../../components/gm/CatalogPicker';
import './gm.css';

// GM shop authoring (#696 S2, reworked in #822). Shops are app-managed, not vault
// content: each Location lore entry can be declared a shop in the synced
// `cnmh_shops_global` store, with shop-level meta (keeper/open/revealed, #822 S1)
// plus a wares list. Declaring a shop is an explicit step ("Set up as shop"), and
// the entry's presence — not its ware count — is what makes a location a shop
// (isSetUp). No saveDocument / no raw-JSON box (#248): the catalog picker drives
// "which items," with optional per-ware price override and stock.
//
// S3 (#825) introduces the Workspace shell (set-up empty state, meta strip,
// remove, Save & publish). Stocking still uses the inline ware rows below; the
// two-pane catalog→shelf surface is S4 (#826) and the Command finder that
// replaces this PageEditorShell list is S5 (#827).

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

// A Revealed/Hidden or Open/Closed two-state segmented control. The "on" side
// (Revealed / Open) gets the verdant good-state tint when active.
const Segmented = ({ label, value, onChange, onLabel, offLabel }) => (
  <div className="gm-shop-seg-group">
    <span className="gm-shop-meta-label">{label}</span>
    <div className="gm-shop-seg" role="group" aria-label={label}>
      <button
        type="button"
        className={value ? 'is-on is-on--good' : ''}
        aria-pressed={value}
        onClick={() => onChange(true)}
      >
        {onLabel}
      </button>
      <button
        type="button"
        className={!value ? 'is-on' : ''}
        aria-pressed={!value}
        onClick={() => onChange(false)}
      >
        {offLabel}
      </button>
    </div>
  </div>
);

// The per-location authoring surface. `onBack` is supplied only by finders that
// hide the list (the Command finder, S5); inside PageEditorShell the list stays
// visible, so no back button renders.
const Workspace = ({ location, shops, items, runes, catalogMap, runeMap, setShop, removeShop, onBack }) => {
  const loreId = location.id;
  const entry = shops[loreId];
  const [setUp, setSetUp] = useState(() => isSetUp(loreId, shops));
  const [keeper, setKeeper] = useState(() => entry?.keeper || '');
  const [revealed, setRevealed] = useState(() => !!entry?.revealed);
  const [open, setOpen] = useState(() => entry?.open !== false);
  const [rows, setRows] = useState(() => toRows(entry?.wares));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [runePickerOpen, setRunePickerOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // Any edit to meta or wares marks the draft dirty and clears the saved flash.
  const touch = () => { setDirty(true); setJustSaved(false); };
  const editMeta = (setter) => (val) => { setter(val); touch(); };

  const setRow = (i, patch) => {
    setRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    touch();
  };
  const removeRow = (i) => {
    setRows((cur) => cur.filter((_, idx) => idx !== i));
    touch();
  };

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
    touch();
  };

  // Catalog items → unleveled rows (the GM pins a variant via the row select).
  const addItems = (picked) =>
    addRows(picked, (it) => ({ ref: it.id, level: '', runeRef: '', price: '', stock: '' }));
  // Catalog runes → runestone rows (#801): sold as a Runestone of that rune.
  const addRunes = (picked) =>
    addRows(picked, (it) => ({ ref: 'runestone', level: '', runeRef: it.id, price: '', stock: '' }));

  // Declare the location a shop on purpose (#822): commit a fresh entry now so it
  // persists and reads as a shop everywhere, then reveal the authoring surface.
  const setUpAsShop = () => {
    setShop(loreId, { keeper: '', open: true, revealed: false, wares: [] });
    setSetUp(true);
    setKeeper('');
    setRevealed(false);
    setOpen(true);
    setRows([]);
    setDirty(false);
    setJustSaved(false);
  };

  // Persist meta + wares together; live for players immediately.
  const save = () => {
    setShop(loreId, { keeper, open, revealed, wares: fromRows(rows) });
    setDirty(false);
    setJustSaved(true);
  };

  // Take the shop down: delete the entry and drop back to the not-a-shop state.
  const removeShopHere = () => {
    removeShop(loreId);
    setSetUp(false);
    setDirty(false);
    setJustSaved(false);
    if (onBack) onBack();
  };

  const limited = rows.filter((r) => r.stock !== '' && r.stock != null).length;

  return (
    <div className="gm-card gm-shop-workspace" data-testid={`shop-workspace-${loreId}`}>
      <div className="gm-row gm-shop-head">
        {onBack && (
          <button type="button" className="btn-small btn-secondary gm-shop-back" aria-label="Back" onClick={onBack}>
            ←
          </button>
        )}
        <div className="gm-shop-head-main">
          <div className="gm-shop-title-row">
            <h3 className="gm-shop-title">{location.title}</h3>
            <span className={`gm-shop-status${setUp ? ' is-shop' : ''}`}>
              {setUp ? 'Shop' : 'Not a shop'}
            </span>
            {location.kind && <span className="gm-shop-kind">{location.kind}</span>}
          </div>
          {location.summary && <p className="gm-shop-summary">{location.summary}</p>}
        </div>
        {setUp && (
          <div className="gm-shop-head-actions">
            <button type="button" className="btn-small btn-danger" onClick={removeShopHere}>
              Remove shop
            </button>
          </div>
        )}
      </div>

      {!setUp ? (
        <div className="gm-shop-setup" data-testid="shop-setup">
          <div className="gm-shop-setup-mark" aria-hidden="true">⌂</div>
          <p className="gm-shop-setup-head">
            <strong>{location.title}</strong> isn’t a shop yet
          </p>
          <p className="gm-shop-setup-sub">
            Make it one to start authoring the items the party can buy here. You can take it down
            again at any time — nothing shows to players until you publish.
          </p>
          <button type="button" className="btn-primary" onClick={setUpAsShop}>
            Set up as shop
          </button>
        </div>
      ) : (
        <>
          <div className="gm-shop-meta">
            <label className="gm-shop-meta-keeper">
              <span className="gm-shop-meta-label">Shopkeeper &amp; flavor</span>
              <textarea
                aria-label="keeper"
                rows={2}
                placeholder="Who runs this shop? A line of flavor the players see when they browse…"
                value={keeper}
                onChange={(e) => editMeta(setKeeper)(e.target.value)}
              />
            </label>
            <div className="gm-shop-meta-toggles">
              <Segmented
                label="Players can see it"
                value={revealed}
                onChange={editMeta(setRevealed)}
                onLabel="Revealed"
                offLabel="Hidden"
              />
              <Segmented
                label="Trading"
                value={open}
                onChange={editMeta(setOpen)}
                onLabel="Open"
                offLabel="Closed"
              />
            </div>
          </div>

          <div className="gm-row gm-shop-stock-head">
            <p className="gm-count">
              {rows.length === 0 ? 'Nothing stocked yet.' : `${rows.length} ware${rows.length === 1 ? '' : 's'}`}
            </p>
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

          <div className="gm-actions gm-shop-foot">
            <span className="gm-count gm-shop-tally">
              {rows.length} item{rows.length === 1 ? '' : 's'}
              {limited > 0 && ` · ${limited} limited stock`}
            </span>
            {justSaved && !dirty && (
              <span className="gm-shop-saveflash" role="status">Saved — live for players</span>
            )}
            <button type="button" className="btn-primary" disabled={!dirty} onClick={save}>
              {dirty ? 'Save & publish' : 'Saved'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

const GmShops = () => {
  const { allLoreEntries, items, runes } = useContent();
  const { shops, setShop, removeShop } = useShops();
  const catalogMap = useMemo(() => itemCatalogMap(items), [items]);
  const runeMap = useMemo(() => runeCatalogMap(runes), [runes]);

  // Master list: every Location lore entry, title-sorted. Set-up shops get a
  // "shop" badge via the name renderer so the GM can see at a glance which
  // locations are shops (entry presence, not ware count — an empty-but-set-up
  // shop still counts).
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
            {isSetUp(e.id, shops) && <span className="gm-shop-badge"> · shop</span>}
          </>
        )}
        noun="location"
        allowNew={false}
        emptyHint="Select a Location to set it up as a shop and author what it sells."
        filterEntry={(e, q) =>
          [e.title, e.summary].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
        }
        renderDetail={(entry) => (
          <Workspace
            location={entry}
            shops={shops}
            items={items}
            runes={runes}
            catalogMap={catalogMap}
            runeMap={runeMap}
            setShop={setShop}
            removeShop={removeShop}
          />
        )}
      />
    </div>
  );
};

export default GmShops;
