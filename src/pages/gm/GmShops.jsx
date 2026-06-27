import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useShops } from '../../hooks/useShops';
import { itemCatalogMap, runeCatalogMap } from '../../utils/contentUtils';
import { isSetUp } from '../../utils/shopUtils';
import './gm.css';

// GM shop authoring (#696 S2, reworked in #822). Shops are app-managed, not vault
// content: each Location lore entry can be declared a shop in the synced
// `cnmh_shops_global` store, with shop-level meta (keeper/open/revealed, #822 S1)
// plus a wares list. Declaring a shop is an explicit step ("Set up as shop"), and
// the entry's presence — not its ware count — is what makes a location a shop
// (isSetUp). No saveDocument / no raw-JSON box (#248).
//
// S3 (#825) added the Workspace shell (set-up, meta, Save & publish). S4 (#826)
// added the two-pane catalog→shelf surface. S5 (#827) replaces the old
// PageEditorShell location list with the Command finder (ShopFinder): an empty
// canvas with a hero search + grouped results + "your shops" quick-chips. The
// page is now finder ⇄ workspace, keyed on the selected location.

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

// Unified catalog of shelvable things: every item + every rune (as a Runestone).
// Each card carries the shape the catalog/shelf need plus the `kind` that the
// add-to-shelf and shelf-row logic dispatch on (item | rune). This is the seam
// a future generative spell-item offering (#819) plugs into: add a third kind
// and a matching shelf row, leaving items/runes untouched.
const buildCatalog = (items, runes) => {
  const itemCards = (Array.isArray(items) ? items : [])
    .filter((it) => it && it.id != null)
    .map((it) => {
      const variants = Array.isArray(it.variants) ? it.variants : [];
      const vcount = variants.length;
      const price = vcount
        ? Math.min(...variants.map((v) => Number(v.price) || 0))
        : typeof it.price === 'number'
        ? it.price
        : null;
      return {
        kind: 'item',
        id: it.id,
        key: String(it.id),
        name: it.name || it.id,
        price,
        from: vcount > 0,
        vcount,
        level: it.level,
        traits: Array.isArray(it.traits) ? it.traits : [],
      };
    });
  const runeCards = (Array.isArray(runes) ? runes : [])
    .filter((r) => r && r.id != null)
    .map((r) => ({
      kind: 'rune',
      id: r.id,
      key: `runestone@${r.id}`,
      name: `${r.name || r.id} Runestone`,
      price: 3 + (Number(r.price) || 0),
      from: false,
      vcount: 0,
      level: r.level,
      traits: [...(Array.isArray(r.traits) ? r.traits : []), 'Rune'],
    }));
  return [...itemCards, ...runeCards];
};

// The chip set = the most common traits across the catalog (descending count,
// ties alphabetical), capped at `limit` so the filter row stays a single band.
const traitsByFrequency = (catalog, limit = 12) => {
  const counts = new Map();
  catalog.forEach((c) => (c.traits || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([t]) => t);
};

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

// Catalog (browse) pane: search + trait chips (AND filter) over the unified
// catalog; clicking a not-yet-stocked card shelves it. Stocked cards dim and
// disable, marked "In shop".
const CatalogPane = ({ catalog, chips, stockedKeys, onAdd }) => {
  const [query, setQuery] = useState('');
  const [traits, setTraits] = useState([]);

  const toggleTrait = (t) =>
    setTraits((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog
      .filter((c) => {
        if (q && !c.name.toLowerCase().includes(q) && !String(c.id).toLowerCase().includes(q)) return false;
        if (traits.length && !traits.every((t) => (c.traits || []).includes(t))) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [catalog, query, traits]);

  return (
    <div className="gm-shop-pane gm-shop-catalog">
      <div className="gm-shop-pane-head">
        <div className="gm-shop-pane-title">
          Catalog<span className="gm-shop-pane-count">{results.length}</span>
        </div>
        <input
          type="text"
          className="gm-shop-cat-search"
          aria-label="catalog search"
          placeholder={`Search ${catalog.length} items by name…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="gm-shop-chips">
          {chips.map((t) => (
            <button
              key={t}
              type="button"
              className={`gm-shop-chip${traits.includes(t) ? ' is-on' : ''}`}
              aria-pressed={traits.includes(t)}
              onClick={() => toggleTrait(t)}
            >
              {t}
            </button>
          ))}
          {traits.length > 0 && (
            <button type="button" className="gm-shop-chip-clear" onClick={() => setTraits([])}>
              clear
            </button>
          )}
        </div>
      </div>
      <ul className="gm-shop-cat-list" aria-label="catalog">
        {results.length === 0 && (
          <li className="gm-count gm-shop-cat-empty">
            No items match. Try fewer traits or a different search.
          </li>
        )}
        {results.map((c) => {
          const stocked = stockedKeys.has(c.key);
          return (
            <li key={c.key}>
              <button
                type="button"
                className={`gm-shop-cat-item${stocked ? ' is-stocked' : ''}`}
                data-testid={`cat-${c.key}`}
                aria-label={`add ${c.name}`}
                disabled={stocked}
                onClick={() => !stocked && onAdd(c)}
              >
                <span className="gm-shop-cat-main">
                  <span className="gm-shop-cat-name">{c.name}</span>
                  <span className="gm-shop-cat-meta">
                    {c.price != null && (
                      <span className="gm-shop-cat-price">
                        {c.from ? 'from ' : ''}
                        {c.price} gp
                      </span>
                    )}
                    {c.level != null && c.level > 0 && <span className="gm-shop-cat-lvl">L{c.level}</span>}
                    {c.vcount > 0 && <span className="gm-shop-cat-vtag">{c.vcount} variants</span>}
                    {(c.traits || []).slice(0, 2).length > 0 && (
                      <span className="gm-shop-cat-tr">
                        {(c.traits || []).slice(0, 2).join(' · ').toLowerCase()}
                      </span>
                    )}
                  </span>
                </span>
                <span className="gm-shop-cat-aff" aria-hidden="true">
                  {stocked ? 'In shop' : '+'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

// One stocked ware. Resolves its display name / variant options / placeholder
// price from the catalog by kind (runestone vs item/variant). A future
// spell-item offering (#819) adds a branch here.
const ShelfRow = ({ row, index, rows, catalogMap, runeMap, onChange, onRemove }) => {
  const isRune = row.ref === 'runestone';
  const rune = isRune && row.runeRef ? runeMap.get(String(row.runeRef)) : null;
  const item = !isRune ? catalogMap.get(String(row.ref)) : null;
  const variants = Array.isArray(item?.variants) ? item.variants : [];
  const variant = variants.find((v) => String(v.level) === String(row.level));
  const key = rowKey(row);
  const name = isRune
    ? rune ? `${rune.name} Runestone` : `Runestone (unknown: ${row.runeRef})`
    : variant ? variant.name || item.name : item ? item.name : `(unknown: ${row.ref})`;
  const placeholderPrice = isRune
    ? rune ? 3 + (Number(rune.price) || 0) : 3
    : variant ? variant.price : item?.price;
  const traits = isRune
    ? [...(Array.isArray(rune?.traits) ? rune.traits : []), 'Rune']
    : Array.isArray(item?.traits) ? item.traits : [];
  // Levels claimed by OTHER rows of this same item — excluded from the select so
  // the GM can't author a duplicate (ref, level).
  const taken = new Set(
    rows
      .filter((x, idx) => idx !== index && x.ref === row.ref && x.level !== '')
      .map((x) => String(x.level))
  );

  return (
    <li className="gm-row gm-shop-ware-row gm-shop-shelf-row">
      <div className="gm-shop-ware-top">
        <span className="gm-shop-ware-name">{name}</span>
        {traits.slice(0, 3).length > 0 && (
          <span className="gm-shop-ware-tr">{traits.slice(0, 3).join(' · ').toLowerCase()}</span>
        )}
        <button
          type="button"
          className="btn-small btn-danger gm-shop-ware-x"
          aria-label={`remove-${key}`}
          onClick={onRemove}
        >
          ✕
        </button>
      </div>
      <div className="gm-shop-ware-fields">
        {variants.length > 0 && (
          <div className="form-group gm-shop-ware-field">
            <label htmlFor={`level-${key}`}>variant</label>
            <select
              id={`level-${key}`}
              aria-label={`level-${key}`}
              value={row.level}
              onChange={(e) => onChange({ level: e.target.value })}
            >
              <option value="">— select —</option>
              {variants
                .filter((v) => String(v.level) === String(row.level) || !taken.has(String(v.level)))
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
            value={row.price}
            onChange={(e) => onChange({ price: e.target.value })}
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
            value={row.stock}
            onChange={(e) => onChange({ stock: e.target.value })}
          />
        </div>
      </div>
    </li>
  );
};

// Shelf (stock) pane: the stocked wares + the pinned Save & publish footer.
const ShelfPane = ({ rows, catalogMap, runeMap, setRow, removeRow, dirty, justSaved, onSave }) => {
  const limited = rows.filter((r) => r.stock !== '' && r.stock != null).length;
  return (
    <div className="gm-shop-pane gm-shop-shelf">
      <div className="gm-shop-pane-head">
        <div className="gm-shop-pane-title">
          On the shelf<span className="gm-shop-pane-count">{rows.length}</span>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="gm-shop-shelf-empty">
          <div className="gm-shop-shelf-empty-mark" aria-hidden="true">◇</div>
          <p>
            Nothing stocked yet. Click an item in the catalog to put it on the shelf, then set its
            price and stock.
          </p>
        </div>
      ) : (
        <ul className="gm-shop-wares" aria-label="wares">
          {rows.map((r, i) => (
            <ShelfRow
              key={rowKey(r)}
              row={r}
              index={i}
              rows={rows}
              catalogMap={catalogMap}
              runeMap={runeMap}
              onChange={(patch) => setRow(i, patch)}
              onRemove={() => removeRow(i)}
            />
          ))}
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
        <button type="button" className="btn-primary" disabled={!dirty} onClick={onSave}>
          {dirty ? 'Save & publish' : 'Saved'}
        </button>
      </div>
    </div>
  );
};

// The per-location authoring surface. `onBack` is supplied only by finders that
// hide the list (the Command finder, S5); inside PageEditorShell the list stays
// visible, so no back button renders.
const Workspace = ({ location, shops, catalog, chips, catalogMap, runeMap, setShop, removeShop, onBack }) => {
  const loreId = location.id;
  const entry = shops[loreId];
  const [setUp, setSetUp] = useState(() => isSetUp(loreId, shops));
  const [keeper, setKeeper] = useState(() => entry?.keeper || '');
  const [revealed, setRevealed] = useState(() => !!entry?.revealed);
  const [open, setOpen] = useState(() => entry?.open !== false);
  const [rows, setRows] = useState(() => toRows(entry?.wares));
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

  // Shelve a catalog card, skipping a kind+ref that's already stocked under the
  // same key. Items shelve unleveled (the GM pins a variant via the row select,
  // which keeps the bare ref free so a second variant can be shelved); runes
  // shelve as a Runestone of that rune (#801).
  const addCard = (card) => {
    const make = card.kind === 'rune'
      ? { ref: 'runestone', level: '', runeRef: card.id, price: '', stock: '' }
      : { ref: card.id, level: '', runeRef: '', price: '', stock: '' };
    setRows((cur) => (cur.some((r) => rowKey(r) === rowKey(make)) ? cur : [...cur, make]));
    touch();
  };

  const stockedKeys = useMemo(() => new Set(rows.map(rowKey)), [rows]);

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

  const save = () => {
    setShop(loreId, { keeper, open, revealed, wares: fromRows(rows) });
    setDirty(false);
    setJustSaved(true);
  };

  const removeShopHere = () => {
    removeShop(loreId);
    setSetUp(false);
    setDirty(false);
    setJustSaved(false);
    if (onBack) onBack();
  };

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

          <div className="gm-shop-panes">
            <CatalogPane catalog={catalog} chips={chips} stockedKeys={stockedKeys} onAdd={addCard} />
            <ShelfPane
              rows={rows}
              catalogMap={catalogMap}
              runeMap={runeMap}
              setRow={setRow}
              removeRow={removeRow}
              dirty={dirty}
              justSaved={justSaved}
              onSave={save}
            />
          </div>
        </>
      )}
    </div>
  );
};

// Geometric magnifier glyph (circle + handle) — no icon font in the app, so a
// minimal inline SVG, matching the prototype.
const Mag = ({ size = 16, className = '' }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <circle cx="10.5" cy="10.5" r="6.5" />
    <line x1="15.5" y1="15.5" x2="21" y2="21" />
  </svg>
);

// Command finder (#822 S5): pick a location to author from an empty canvas. A
// hero search whose results popover (shown only while the query is non-empty)
// groups set-up Shops first, then Locations (capped at 8); plus "your shops"
// quick-chips for one-click reopen. ⌘K / Ctrl+K focuses the search.
const ShopFinder = ({ locations, shops, onSelect }) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const q = query.trim().toLowerCase();
  const byTitle = (a, b) => String(a.title || '').localeCompare(String(b.title || ''));
  const match = (l) =>
    !q ||
    [l.title, l.kind, l.summary].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
  const filtered = locations.filter(match);
  const shopHits = filtered.filter((l) => isSetUp(l.id, shops)).sort(byTitle);
  const rest = filtered.filter((l) => !isSetUp(l.id, shops)).sort(byTitle);
  const allShops = locations.filter((l) => isSetUp(l.id, shops)).sort(byTitle);

  const Option = (l) => (
    <button key={l.id} type="button" role="option" className="gm-shop-opt" onClick={() => onSelect(l.id)}>
      <span className="gm-shop-opt-name">
        {l.title}
        {isSetUp(l.id, shops) && <span className="gm-shop-badge gm-shop-opt-badge">Shop</span>}
      </span>
      {(l.kind || l.summary) && (
        <span className="gm-shop-opt-sub">{[l.kind, l.summary].filter(Boolean).join(' · ')}</span>
      )}
    </button>
  );

  return (
    <div className="gm-shop-finder">
      <div className="gm-shop-finder-inner">
        <div className="gm-shop-kicker">
          GM Tools · Shops
          <span className="gm-shop-live">{allShops.length} live</span>
        </div>
        <h2 className="gm-shop-finder-head">Which location are you stocking?</h2>
        <p className="gm-shop-finder-sub">
          Find any location by name. Pick one to set it up as a shop and author what it sells.
        </p>

        <div className="gm-shop-combo">
          <Mag size={18} className="gm-shop-combo-mag" />
          <input
            ref={inputRef}
            className="gm-shop-combo-input"
            aria-label="location search"
            placeholder={`Search ${locations.length} locations…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {q.length > 0 && (
            <div className="gm-shop-pop" role="listbox" aria-label="search results">
              {shopHits.length === 0 && rest.length === 0 && (
                <div className="gm-shop-pop-empty">No location matches “{query}”.</div>
              )}
              {shopHits.length > 0 && <div className="gm-shop-pop-group">Shops</div>}
              {shopHits.map(Option)}
              {rest.length > 0 && <div className="gm-shop-pop-group">Locations</div>}
              {rest.slice(0, 8).map(Option)}
            </div>
          )}
        </div>

        <div className="gm-shop-quick">
          <div className="gm-shop-quick-h">Your shops</div>
          <div className="gm-shop-chiprow">
            {allShops.map((l) => (
              <button
                key={l.id}
                type="button"
                className="gm-shop-quickchip"
                onClick={() => onSelect(l.id)}
              >
                <span className="gm-shop-quickchip-dot" aria-hidden="true" />
                {l.title}
              </button>
            ))}
            {allShops.length === 0 && (
              <span className="gm-shop-finder-sub gm-shop-quick-empty">
                No shops yet — search above to set the first one up.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const GmShops = () => {
  const { allLoreEntries, items, runes } = useContent();
  const { shops, setShop, removeShop } = useShops();
  const catalogMap = useMemo(() => itemCatalogMap(items), [items]);
  const runeMap = useMemo(() => runeCatalogMap(runes), [runes]);
  const catalog = useMemo(() => buildCatalog(items, runes), [items, runes]);
  const chips = useMemo(() => traitsByFrequency(catalog), [catalog]);
  const [selectedId, setSelectedId] = useState(null);

  // Every Location lore entry, title-sorted — the finder's search/chip universe.
  const locations = useMemo(
    () =>
      (allLoreEntries || [])
        .filter((e) => (e.category || '').trim() === 'Location')
        .slice()
        .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''))),
    [allLoreEntries]
  );

  const selected = useMemo(
    () => locations.find((e) => e.id === selectedId) || null,
    [locations, selectedId]
  );

  return (
    <div className="gm-shops">
      {selected ? (
        <>
          <nav className="gm-shop-crumbs" aria-label="breadcrumb">
            GM Tools <span aria-hidden="true">/</span> Shops <span aria-hidden="true">/</span>{' '}
            <strong>{selected.title}</strong>
          </nav>
          <Workspace
            key={selected.id}
            location={selected}
            shops={shops}
            catalog={catalog}
            chips={chips}
            catalogMap={catalogMap}
            runeMap={runeMap}
            setShop={setShop}
            removeShop={removeShop}
            onBack={() => setSelectedId(null)}
          />
        </>
      ) : (
        <ShopFinder locations={locations} shops={shops} onSelect={setSelectedId} />
      )}
    </div>
  );
};

export default GmShops;
