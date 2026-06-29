import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useShops } from '../../hooks/useShops';
import { itemCatalogMap, runeCatalogMap } from '../../utils/contentUtils';
import { isSetUp, isSpellItemWare, eligibleSpellItems, shopOffersSpellcasting, shopOffersRunes } from '../../utils/shopUtils';
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

// A ware row is local form state until Save. Three shapes:
//   • flat item:     { ref, price, stock }
//   • runestone:     { ref:'runestone', runeRef, price, stock }   (#801)
//   • variant item:  { ref, forms: [{ level, price, stock }] }    (#889)
// A multi-level item (#798) is authored as ONE row whose `forms` hold the chosen
// variants (a sub-row per selected level). Strings throughout (form inputs);
// blanks mean "fall back to the catalog/variant price / unlimited stock".
const str = (v) => (v != null ? String(v) : '');

const toRows = (wares) => {
  // Generative spell-item offerings (#819) are authored in their own section
  // (toOfferings), not as catalog rows — they carry no `ref`.
  const list = (Array.isArray(wares) ? wares : []).filter((w) => !isSpellItemWare(w));
  const rows = [];
  const variantRow = new Map(); // ref -> the collapsed variant row
  list.forEach((w) => {
    if (w.ref === 'runestone') {
      rows.push({ ref: 'runestone', runeRef: str(w.runeRef), price: str(w.price), stock: str(w.stock) });
    } else if (w.level != null) {
      let row = variantRow.get(w.ref);
      if (!row) { row = { ref: w.ref, forms: [] }; variantRow.set(w.ref, row); rows.push(row); }
      row.forms.push({ level: str(w.level), price: str(w.price), stock: str(w.stock) });
    } else {
      rows.push({ ref: w.ref, price: str(w.price), stock: str(w.stock) });
    }
  });
  return rows;
};

// Stable per-row key: `runestone@runeRef` for a rune ware, else the bare ref —
// one row per item now (variants live in `forms`), so the ref is unique.
const rowKey = (r) => {
  if (r.ref === 'runestone') return r.runeRef ? `runestone@${r.runeRef}` : 'runestone';
  return String(r.ref);
};

// Set price/stock on a stored ware from form strings (drop blanks; stock must be
// a non-negative integer).
const applyPriceStock = (w, price, stock) => {
  const p = parseFloat(price);
  if (!Number.isNaN(p)) w.price = p;
  const s = parseInt(stock, 10);
  if (!Number.isNaN(s) && s >= 0) w.stock = s;
  return w;
};

// Form rows → stored wares. A variant row EXPANDS to one `{ ref, level }` per
// selected form (so resolveShopWares + the storage shape are unchanged, #889);
// an empty variant row (no forms chosen) stocks nothing.
const fromRows = (rows) => {
  const out = [];
  rows.filter((r) => r.ref).forEach((r) => {
    if (r.ref === 'runestone') {
      const w = { ref: 'runestone' };
      if (r.runeRef) w.runeRef = r.runeRef;
      out.push(applyPriceStock(w, r.price, r.stock));
    } else if (Array.isArray(r.forms)) {
      r.forms.forEach((f) => {
        const w = { ref: r.ref };
        const level = parseInt(f.level, 10);
        if (!Number.isNaN(level)) w.level = level;
        out.push(applyPriceStock(w, f.price, f.stock));
      });
    } else {
      out.push(applyPriceStock({ ref: r.ref }, r.price, r.stock));
    }
  });
  return out;
};

// ── Generative spell-item offerings (#819) ──────────────────────────────────
// A shop can also sell Scrolls/Wands of ANY catalog spell up to a rank, filtered
// by tradition + rarity (the S6 model in shopUtils). These are authored as a
// separate ware shape — `{ spellItem, maxRank, traditions?, rarities?,
// priceMod? }` — in their own "Spellcasting services" section, since they're a
// generative spec rather than a single catalog ref.

const ALL_TRADITIONS = ['arcane', 'divine', 'occult', 'primal'];
const ALL_RARITIES = ['common', 'uncommon', 'rare'];
// Base-template tables top out here (a rank-10 spell can't go in a wand).
const SPELL_ITEM_MAX_RANK = { scroll: 10, wand: 9 };

let OFFERING_SEQ = 0;
const newOfferingKey = () => `off-${OFFERING_SEQ++}`;

// Stored spell-item wares → local form rows. Each keeps a synthetic `key` so
// React/inputs stay stable across add/remove (the spec carries no natural id).
const toOfferings = (wares) =>
  (Array.isArray(wares) ? wares : [])
    .filter(isSpellItemWare)
    .map((w) => ({
      key: newOfferingKey(),
      spellItem: w.spellItem,
      maxRank: w.maxRank != null ? String(w.maxRank) : '',
      traditions: Array.isArray(w.traditions) ? w.traditions.filter(Boolean) : [],
      rarities: Array.isArray(w.rarities) ? w.rarities.filter(Boolean) : [],
      priceMod: w.priceMod != null ? String(w.priceMod) : '',
    }));

// Form rows → minimal stored specs. Defaults are OMITTED so stored specs stay
// clean and round-trip with the S6 selectors: traditions unset = all four
// (so drop an empty OR all-four selection); rarities unset = common only (so
// drop an empty OR exactly-common selection); priceMod unset = ×1.
const fromOfferings = (offerings) =>
  (Array.isArray(offerings) ? offerings : [])
    .filter((o) => o.spellItem === 'scroll' || o.spellItem === 'wand')
    .map((o) => {
      const kind = o.spellItem;
      const cap = SPELL_ITEM_MAX_RANK[kind];
      let rank = parseInt(o.maxRank, 10);
      if (Number.isNaN(rank)) rank = 1;
      rank = Math.max(1, Math.min(cap, rank));
      const w = { spellItem: kind, maxRank: rank };

      const trads = (o.traditions || []).filter(Boolean);
      if (trads.length > 0 && trads.length < ALL_TRADITIONS.length) w.traditions = trads;

      const rars = (o.rarities || []).filter(Boolean);
      if (!(rars.length === 0 || (rars.length === 1 && rars[0] === 'common'))) w.rarities = rars;

      const mod = parseFloat(o.priceMod);
      if (!Number.isNaN(mod) && mod > 0 && mod !== 1) w.priceMod = mod;
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

// Compact price + stock inputs, keyed by `idKey` (the row ref, or `ref@level`
// for a variant sub-row). `placeholderPrice` is the catalog/variant fallback.
const PriceStock = ({ idKey, price, stock, placeholderPrice, onChange }) => (
  <>
    <div className="form-group gm-shop-ware-field">
      <label htmlFor={`price-${idKey}`}>price (gp)</label>
      <input id={`price-${idKey}`} aria-label={`price-${idKey}`} type="number" min="0"
        placeholder={placeholderPrice != null ? String(placeholderPrice) : 'catalog'}
        value={price} onChange={(e) => onChange({ price: e.target.value })} />
    </div>
    <div className="form-group gm-shop-ware-field">
      <label htmlFor={`stock-${idKey}`}>stock</label>
      <input id={`stock-${idKey}`} aria-label={`stock-${idKey}`} type="number" min="0"
        placeholder="∞" value={stock} onChange={(e) => onChange({ stock: e.target.value })} />
    </div>
  </>
);

// One stocked ware row. A variant item (#889) is a single row: the catalog item
// picked once, with a checkbox per variant choosing which forms it sells and a
// price/stock line for each chosen form. Flat items + runestones keep a single
// price/stock.
const ShelfRow = ({ row, catalogMap, runeMap, onChange, onRemove }) => {
  const isRune = row.ref === 'runestone';
  const rune = isRune && row.runeRef ? runeMap.get(String(row.runeRef)) : null;
  const item = !isRune ? catalogMap.get(String(row.ref)) : null;
  const variants = Array.isArray(item?.variants) ? item.variants : [];
  const isVariantItem = !isRune && variants.length > 0;
  const key = rowKey(row);
  const name = isRune
    ? rune ? `${rune.name} Runestone` : `Runestone (unknown: ${row.runeRef})`
    : item ? item.name : `(unknown: ${row.ref})`;
  const traits = isRune
    ? [...(Array.isArray(rune?.traits) ? rune.traits : []), 'Rune']
    : Array.isArray(item?.traits) ? item.traits : [];

  const forms = Array.isArray(row.forms) ? row.forms : [];
  const selected = new Set(forms.map((f) => String(f.level)));
  const toggleVariant = (v) => {
    const lvl = String(v.level);
    if (selected.has(lvl)) onChange({ forms: forms.filter((f) => String(f.level) !== lvl) });
    else onChange({ forms: [...forms, { level: lvl, price: '', stock: '' }] });
  };
  const setForm = (lvl, patch) =>
    onChange({ forms: forms.map((f) => (String(f.level) === String(lvl) ? { ...f, ...patch } : f)) });

  return (
    <li className="gm-row gm-shop-ware-row gm-shop-shelf-row">
      <div className="gm-shop-ware-top">
        <span className="gm-shop-ware-name">{name}</span>
        {traits.slice(0, 3).length > 0 && (
          <span className="gm-shop-ware-tr">{traits.slice(0, 3).join(' · ').toLowerCase()}</span>
        )}
        <button type="button" className="btn-small btn-danger gm-shop-ware-x"
          aria-label={`remove-${key}`} onClick={onRemove}>✕</button>
      </div>

      {isVariantItem ? (
        <div className="gm-shop-ware-variants">
          <span className="gm-shop-meta-label">Variants sold</span>
          <div className="gm-shop-ware-vopts" role="group" aria-label={`variants-${key}`}>
            {variants.map((v) => {
              const lvl = String(v.level);
              return (
                <label key={lvl} className="gm-shop-ware-vopt">
                  <input type="checkbox" aria-label={`variant-${row.ref}@${lvl}`}
                    checked={selected.has(lvl)} onChange={() => toggleVariant(v)} />
                  {v.label || v.name || `Level ${v.level}`} (L{v.level})
                </label>
              );
            })}
          </div>
          {forms.map((f) => {
            const v = variants.find((x) => String(x.level) === String(f.level));
            return (
              <div key={f.level} className="gm-shop-ware-form">
                <span className="gm-shop-ware-form-name">{v ? v.label || v.name || `L${f.level}` : `L${f.level}`}</span>
                <div className="gm-shop-ware-fields">
                  <PriceStock idKey={`${row.ref}@${f.level}`} price={f.price} stock={f.stock}
                    placeholderPrice={v?.price} onChange={(patch) => setForm(f.level, patch)} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="gm-shop-ware-fields">
          <PriceStock idKey={key} price={row.price} stock={row.stock}
            placeholderPrice={isRune ? (rune ? 3 + (Number(rune.price) || 0) : 3) : item?.price}
            onChange={onChange} />
        </div>
      )}
    </li>
  );
};

// Shelf (stock) pane: the stocked wares + the pinned Save & publish footer.
const ShelfPane = ({ rows, catalogMap, runeMap, setRow, removeRow, dirty, justSaved, onSave }) => {
  const hasStock = (s) => s !== '' && s != null;
  const limited = rows.reduce(
    (n, r) => n + (Array.isArray(r.forms) ? r.forms.filter((f) => hasStock(f.stock)).length : (hasStock(r.stock) ? 1 : 0)),
    0
  );
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

// A labelled set of toggle chips (multiselect). `selected` is the current array;
// toggling calls `onToggle(value)`. `hint` annotates what an empty selection
// means (e.g. "all" / "common only") so the asymmetric defaults are legible.
const ChipMulti = ({ label, options, selected, onToggle, idBase, hint }) => (
  <div className="form-group gm-shop-offer-field">
    <span className="gm-shop-offer-label">
      {label}
      {hint && <span className="gm-shop-offer-hint"> · {hint}</span>}
    </span>
    <div className="gm-shop-chips" role="group" aria-label={label}>
      {options.map((opt) => {
        const on = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            className={`gm-shop-chip${on ? ' is-on' : ''}`}
            aria-pressed={on}
            aria-label={`${idBase}-${opt}`}
            onClick={() => onToggle(opt)}
          >
            {opt}
          </button>
        );
      })}
    </div>
  </div>
);

// One generative spell-item offering row. Live-resolves its eligible-spell count
// + coverage summary off the S6 selector so the GM sees what the spec covers as
// they tune it. `traditions` empty = all four; `rarities` empty = common only —
// matching the stored-spec defaults exactly.
const OfferingRow = ({ row, index, spells, onChange, onRemove }) => {
  const kind = row.spellItem === 'wand' ? 'wand' : 'scroll';
  const cap = SPELL_ITEM_MAX_RANK[kind];

  const spec = useMemo(
    () => ({
      spellItem: kind,
      maxRank: parseInt(row.maxRank, 10) || 0,
      traditions: row.traditions,
      rarities: row.rarities,
      priceMod: parseFloat(row.priceMod) || undefined,
    }),
    [kind, row.maxRank, row.traditions, row.rarities, row.priceMod]
  );
  const eligible = useMemo(() => eligibleSpellItems(spec, spells), [spec, spells]);

  const trads = row.traditions.length ? row.traditions : ALL_TRADITIONS;
  const rars = row.rarities.length ? row.rarities : ['common'];
  const cappedRank = Math.max(1, Math.min(cap, parseInt(row.maxRank, 10) || 1));
  const tradLabel = trads.length === ALL_TRADITIONS.length ? 'all traditions' : [...trads].join('/');
  const summary = `${kind === 'scroll' ? 'Scrolls' : 'Wands'} · ${tradLabel} · ${[...rars].join('+')} · up to rank ${cappedRank} · ${eligible.length} eligible spell${eligible.length === 1 ? '' : 's'}`;

  const toggleIn = (field, value) => {
    const cur = row[field];
    onChange({ [field]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] });
  };

  return (
    <li className="gm-row gm-shop-ware-row gm-shop-offer-row">
      <div className="gm-shop-ware-top">
        <div className="form-group gm-shop-offer-kind">
          <label htmlFor={`offering-kind-${index}`}>type</label>
          <select
            id={`offering-kind-${index}`}
            aria-label={`offering-kind-${index}`}
            value={kind}
            onChange={(e) => onChange({ spellItem: e.target.value })}
          >
            <option value="scroll">Scrolls</option>
            <option value="wand">Wands</option>
          </select>
        </div>
        <div className="form-group gm-shop-offer-rank">
          <label htmlFor={`offering-maxrank-${index}`}>max rank</label>
          <input
            id={`offering-maxrank-${index}`}
            aria-label={`offering-maxrank-${index}`}
            type="number"
            min="1"
            max={String(cap)}
            value={row.maxRank}
            onChange={(e) => onChange({ maxRank: e.target.value })}
          />
        </div>
        <button
          type="button"
          className="btn-small btn-danger gm-shop-ware-x"
          aria-label={`remove-offering-${index}`}
          onClick={onRemove}
        >
          ✕
        </button>
      </div>
      <div className="gm-shop-offer-filters">
        <ChipMulti
          label="traditions"
          options={ALL_TRADITIONS}
          selected={row.traditions}
          onToggle={(v) => toggleIn('traditions', v)}
          idBase={`offering-${index}-trad`}
          hint="none = all"
        />
        <ChipMulti
          label="rarities"
          options={ALL_RARITIES}
          selected={row.rarities}
          onToggle={(v) => toggleIn('rarities', v)}
          idBase={`offering-${index}-rarity`}
          hint="none = common only"
        />
        <div className="form-group gm-shop-offer-field gm-shop-offer-mod">
          <label htmlFor={`offering-pricemod-${index}`}>price ×</label>
          <input
            id={`offering-pricemod-${index}`}
            aria-label={`offering-pricemod-${index}`}
            type="number"
            min="0"
            step="0.05"
            placeholder="1"
            value={row.priceMod}
            onChange={(e) => onChange({ priceMod: e.target.value })}
          />
        </div>
      </div>
      <p className="gm-shop-offer-summary" data-testid={`offering-summary-${index}`}>
        {summary}
      </p>
    </li>
  );
};

// The "Spellcasting services" section: generative scroll/wand offerings, each a
// rank/tradition/rarity spec rather than a single catalog item.
const OfferingsSection = ({ offerings, spells, addOffering, setOffering, removeOffering }) => (
  <div className="gm-shop-offers" data-testid="shop-offerings">
    <div className="gm-shop-offers-head">
      <div className="gm-shop-pane-title">
        Spellcasting services<span className="gm-shop-pane-count">{offerings.length}</span>
      </div>
      <button
        type="button"
        className="btn-small btn-secondary"
        onClick={addOffering}
      >
        Add spell-item offering
      </button>
    </div>
    {offerings.length === 0 ? (
      <p className="gm-count gm-shop-offers-empty">
        No scroll or wand offerings. Add one to sell Scrolls/Wands of any catalog spell up to a
        rank, filtered by tradition and rarity.
      </p>
    ) : (
      <ul className="gm-shop-wares" aria-label="spell-item offerings">
        {offerings.map((o, i) => (
          <OfferingRow
            key={o.key}
            row={o}
            index={i}
            spells={spells}
            onChange={(patch) => setOffering(i, patch)}
            onRemove={() => removeOffering(i)}
          />
        ))}
      </ul>
    )}
  </div>
);

// The per-location authoring surface. `onBack` is supplied only by finders that
// hide the list (the Command finder, S5); inside PageEditorShell the list stays
// visible, so no back button renders.
const Workspace = ({ location, shops, spells, catalog, chips, catalogMap, runeMap, setShop, removeShop, onBack }) => {
  const loreId = location.id;
  const entry = shops[loreId];
  const [setUp, setSetUp] = useState(() => isSetUp(loreId, shops));
  const [keeper, setKeeper] = useState(() => entry?.keeper || '');
  const [revealed, setRevealed] = useState(() => !!entry?.revealed);
  const [open, setOpen] = useState(() => entry?.open !== false);
  // Service offerings (#857 S1) — initialise to the EFFECTIVE value so the
  // toggle shows what players see (explicit flag, else derived from stock); the
  // first save freezes it explicit. See shopOffers* in shopUtils.
  const [offersSpellcasting, setOffersSpellcasting] = useState(() => shopOffersSpellcasting(loreId, shops));
  const [offersRunes, setOffersRunes] = useState(() => shopOffersRunes(loreId, shops));
  const [rows, setRows] = useState(() => toRows(entry?.wares));
  const [offerings, setOfferings] = useState(() => toOfferings(entry?.wares));
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

  const addOffering = () => {
    setOfferings((cur) => [
      ...cur,
      { key: newOfferingKey(), spellItem: 'scroll', maxRank: '1', traditions: [], rarities: [], priceMod: '' },
    ]);
    touch();
  };
  const setOffering = (i, patch) => {
    setOfferings((cur) => cur.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
    touch();
  };
  const removeOffering = (i) => {
    setOfferings((cur) => cur.filter((_, idx) => idx !== i));
    touch();
  };

  // Shelve a catalog card as ONE row, skipping a ref/rune already on the shelf.
  // A multi-variant item (#889) shelves with its first variant pre-selected (the
  // GM toggles the rest); a flat item / runestone is a single-form row.
  const addCard = (card) => {
    let make;
    if (card.kind === 'rune') {
      make = { ref: 'runestone', runeRef: card.id, price: '', stock: '' };
    } else {
      const variants = catalogMap.get(String(card.id))?.variants;
      make = Array.isArray(variants) && variants.length
        ? { ref: card.id, forms: [{ level: String(variants[0].level), price: '', stock: '' }] }
        : { ref: card.id, price: '', stock: '' };
    }
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
    setOfferings([]);
    setOffersSpellcasting(false);
    setOffersRunes(false);
    setDirty(false);
    setJustSaved(false);
  };

  const save = () => {
    setShop(loreId, {
      keeper,
      open,
      revealed,
      offersSpellcasting,
      offersRunes,
      wares: [...fromRows(rows), ...fromOfferings(offerings)],
    });
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
              <Segmented
                label="Spellcasting"
                value={offersSpellcasting}
                onChange={editMeta(setOffersSpellcasting)}
                onLabel="Offered"
                offLabel="None"
              />
              <Segmented
                label="Runesmithing"
                value={offersRunes}
                onChange={editMeta(setOffersRunes)}
                onLabel="Offered"
                offLabel="None"
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

          <OfferingsSection
            offerings={offerings}
            spells={spells}
            addOffering={addOffering}
            setOffering={setOffering}
            removeOffering={removeOffering}
          />
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
  const { allLoreEntries, items, runes, spells } = useContent();
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
            spells={spells}
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
