import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useShops } from '../../hooks/useShops';
import { itemCatalogMap, runeCatalogMap } from '../../utils/contentUtils';
import {
  isSetUp,
  isSpellItemWare,
  spellOfferingSummary,
  shopOffersSpellcasting,
  shopOffersRunes,
  isRuneServiceWare,
  isDragonbreathWare,
  runeOfferingSummary,
  eligibleHostItems,
  maxLevelForTarget,
  shopHostKind,
  RUNE_TARGETS,
} from '../../utils/shopUtils';
import {
  DRAGON_KINDS,
  DRAGONBREATH_TIER_ORDER,
  dragonbreathName,
  dragonbreathBreath,
  dragonbreathTierPrice,
  dragonbreathTierLevel,
} from '../../utils/dragonbreath';
import {
  rollSaleShelf,
  resolveSaleWares,
  buildRuneSaleItem,
  buildScrollPackWare,
  rerollSaleItem,
  saleRuneEditOptions,
  saleScrollPackOptions,
} from '../../utils/saleShelf';
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
  // Generative spell-item (#819) and rune-service (#982 G2) offerings are authored
  // in their own sections, not as catalog rows — they carry no `ref`. Dragonbreath
  // weapons (#1210 M4g) carry a `ref` but are authored in their own section too.
  const list = (Array.isArray(wares) ? wares : []).filter(
    (w) => !isSpellItemWare(w) && !isRuneServiceWare(w) && !isDragonbreathWare(w)
  );
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

// ── Dragonbreath weapons (#1210 M4g) ────────────────────────────────────────
// A shop can stock specific dragonbreath weapons: a base weapon carrying a
// `{ tier, dragonType }` template (the resolveShopWares attach model). Authored
// as their own rows — base weapon + tier + dragon type + optional price/stock —
// since each is a discrete templated item, not a generative spec. Stored as
// `{ ref, dragonbreath: { tier, dragonType }, price?, stock? }` wares.
const DRAGON_KIND_KEYS = Object.keys(DRAGON_KINDS).sort();
const capKind = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const toDragonbreathRows = (wares) =>
  (Array.isArray(wares) ? wares : []).filter(isDragonbreathWare).map((w) => ({
    ref: String(w.ref),
    tier: String(w.dragonbreath.tier || 'base').toLowerCase(),
    dragonType: w.dragonbreath.dragonType ? String(w.dragonbreath.dragonType) : '',
    price: str(w.price),
    stock: str(w.stock),
  }));

const fromDragonbreathRows = (rows) =>
  (Array.isArray(rows) ? rows : []).filter((r) => r.ref).map((r) => {
    const w = { ref: r.ref, dragonbreath: { tier: r.tier || 'base', dragonType: (r.dragonType || '').trim() } };
    return applyPriceStock(w, r.price, r.stock);
  });

// ── Generative spell-item offerings (#819) ──────────────────────────────────
// A shop can also sell Scrolls/Wands of ANY catalog spell up to an ITEM LEVEL,
// filtered by tradition + rarity (the S6 model in shopUtils). These are authored
// as a separate ware shape — `{ spellItem, maxLevel, traditions?, rarities?,
// priceMod? }` — in their own "Spellcasting services" section, since they're a
// generative spec rather than a single catalog ref. The cap is the item level
// (not the spell rank) so it prices consistently across scrolls and wands.

const ALL_TRADITIONS = ['arcane', 'divine', 'occult', 'primal'];
const ALL_RARITIES = ['common', 'uncommon', 'rare'];
// Scroll/wand base-template tables top out at item level 19 (rank 10 / rank 9).
const SPELL_ITEM_MAX_LEVEL = 19;

// Stored spell-item wares → the unified by-tradition config (#884). One config
// drives BOTH scrolls and wands rather than a row per kind (#819). Existing
// per-kind offerings collapse into it — kinds present, traditions/rarities
// unioned, maxLevel the max, first priceMod — which is the in-app backfill for
// shops set up under the old model (no migration; re-saving normalises them).
const toSpellConfig = (wares) => {
  const offerings = (Array.isArray(wares) ? wares : []).filter(isSpellItemWare);
  const config = { scroll: false, wand: false, maxLevel: '1', traditions: [], rarities: [], priceMod: '', salePacks: '' };
  let maxLevel = 0;
  const trads = new Set();
  const rars = new Set();
  offerings.forEach((o) => {
    if (o.spellItem === 'scroll') config.scroll = true;
    if (o.spellItem === 'wand') config.wand = true;
    const lvl = parseInt(o.maxLevel, 10);
    if (!Number.isNaN(lvl)) maxLevel = Math.max(maxLevel, lvl);
    (Array.isArray(o.traditions) ? o.traditions : []).filter(Boolean).forEach((t) => trads.add(t));
    (Array.isArray(o.rarities) ? o.rarities : []).filter(Boolean).forEach((x) => rars.add(x));
    if (config.priceMod === '' && o.priceMod != null) config.priceMod = String(o.priceMod);
    // Sale Shelf pack count (#1136) rides the scroll offering only.
    if (o.spellItem === 'scroll' && o.salePacks != null) config.salePacks = String(o.salePacks);
  });
  if (maxLevel > 0) config.maxLevel = String(maxLevel);
  config.traditions = [...trads];
  config.rarities = [...rars];
  return config;
};

// One config + a kind → its stored spec. Defaults are OMITTED so specs stay clean
// and round-trip with the S6 selectors: traditions unset = all four; rarities
// unset = common only; priceMod unset = ×1.
const offeringWare = (kind, config) => {
  let level = parseInt(config.maxLevel, 10);
  if (Number.isNaN(level)) level = 1;
  level = Math.max(1, Math.min(SPELL_ITEM_MAX_LEVEL, level));
  const w = { spellItem: kind, maxLevel: level };
  const trads = (config.traditions || []).filter(Boolean);
  if (trads.length > 0 && trads.length < ALL_TRADITIONS.length) w.traditions = trads;
  const rars = (config.rarities || []).filter(Boolean);
  if (!(rars.length === 0 || (rars.length === 1 && rars[0] === 'common'))) w.rarities = rars;
  const mod = parseFloat(config.priceMod);
  if (!Number.isNaN(mod) && mod > 0 && mod !== 1) w.priceMod = mod;
  return w;
};

// Unified config → stored spell-item wares: one per enabled kind (#884). The
// Sale Shelf pack count (#1136) is stored on the scroll offering only (packs are
// always scrolls); omitted when 0 so specs stay clean.
const fromSpellConfig = (config) => {
  const out = [];
  if (config.scroll) {
    const w = offeringWare('scroll', config);
    const packs = parseInt(config.salePacks, 10);
    if (!Number.isNaN(packs) && packs > 0) w.salePacks = packs;
    out.push(w);
  }
  if (config.wand) out.push(offeringWare('wand', config));
  return out;
};

// ── Generative rune-service offerings (#982 G2) ─────────────────────────────
// A shop can also sell runes for a TARGET (weapon | armor | ring | accessory)
// up to a max rune LEVEL, filtered by rarity — the G1 model in shopUtils.
// Authored as one `{ runeService, targets?, maxLevel, rarities? }` ware in its
// own "Runesmithing services" section, mirroring the spellcasting editor.
const RUNE_TARGET_LABELS = [['weapon', 'Weapon'], ['armor', 'Armor'], ['shield', 'Shield'], ['ring', 'Ring'], ['accessory', 'Accessory']];
// Property runes cap out at item level 19 (ring runes reach 18); allow 20 headroom.
const RUNE_MAX_LEVEL = 20;

// Stored rune-service ware → the editor config. At most one runeService ware per
// shop. Targets unset ⇒ all (mirrors offeringTargets); each selected target
// carries its own max-level cap (from a scalar or per-target maxLevel).
const toRuneConfig = (wares) => {
  const off = (Array.isArray(wares) ? wares : []).find(isRuneServiceWare);
  // Sale Shelf (#1136) rides the rune offering: `saleCount` items at a stored
  // `saleDiscount` FRACTION, surfaced here as a whole-number percent.
  const config = { levels: {}, rarities: [], saleCount: '', saleDiscount: '' };
  RUNE_TARGETS.forEach((t) => { config[t] = false; config.levels[t] = ''; });
  if (!off) return config;
  const targets = Array.isArray(off.targets) && off.targets.length
    ? off.targets.map((t) => String(t).toLowerCase())
    : [...RUNE_TARGETS];
  RUNE_TARGETS.forEach((t) => {
    if (!targets.includes(t)) return;
    config[t] = true;
    const cap = maxLevelForTarget(off, t);
    if (cap > 0) config.levels[t] = String(cap);
  });
  config.rarities = (Array.isArray(off.rarities) ? off.rarities : []).filter(Boolean);
  if (off.saleCount != null) config.saleCount = String(off.saleCount);
  if (off.saleDiscount != null) config.saleDiscount = String(Math.round(Number(off.saleDiscount) * 100));
  return config;
};

// Editor config → stored rune-service ware (an array of 0 or 1). Defaults are
// OMITTED so specs stay clean + round-trip with the G1 selectors: targets unset =
// all; a uniform cap collapses to a scalar maxLevel, else per-target object;
// rarities unset = common only.
const fromRuneConfig = (config) => {
  const selected = RUNE_TARGETS.filter((t) => config[t]);
  if (selected.length === 0) return [];
  const capOf = (t) => {
    let n = parseInt(config.levels?.[t], 10);
    if (Number.isNaN(n)) n = 1;
    return Math.max(1, Math.min(RUNE_MAX_LEVEL, n));
  };
  const caps = {};
  selected.forEach((t) => { caps[t] = capOf(t); });
  const w = { runeService: true };
  if (selected.length < RUNE_TARGETS.length) w.targets = selected;
  const uniq = [...new Set(selected.map((t) => caps[t]))];
  w.maxLevel = uniq.length === 1 ? uniq[0] : caps;
  const rars = (config.rarities || []).filter(Boolean);
  if (!(rars.length === 0 || (rars.length === 1 && rars[0] === 'common'))) w.rarities = rars;
  // Sale Shelf config (#1136): omitted when unset so specs round-trip clean; the
  // percent input is stored back as a [0,0.99] fraction the roller reads.
  const saleCount = parseInt(config.saleCount, 10);
  if (!Number.isNaN(saleCount) && saleCount > 0) w.saleCount = saleCount;
  const pct = parseFloat(config.saleDiscount);
  if (!Number.isNaN(pct) && pct > 0) w.saleDiscount = Math.min(99, pct) / 100;
  return [w];
};

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

// The "Spellcasting services" section (#884): ONE by-tradition config driving
// both scrolls and wands, instead of a row per kind. The GM picks which kinds to
// sell + the shared tradition/rarity/level/price filters; a live summary per
// enabled kind shows coverage (off the S6 selector). The cap is an ITEM LEVEL, so
// each kind derives its own top rank (a rank-2 wand is item level 5 but a rank-2
// scroll only 3). `traditions` empty = all four; `rarities` empty = common only.
const SpellcastingSection = ({ config, spells, onChange }) => {
  const setField = (patch) => onChange({ ...config, ...patch });
  const toggleIn = (field, value) => {
    const cur = config[field] || [];
    setField({ [field]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] });
  };
  const enabled = [['scroll', 'Scrolls'], ['wand', 'Wands']].filter(([k]) => config[k]);

  return (
    <div className="gm-shop-offers" data-testid="shop-offerings">
      <div className="gm-shop-offers-head">
        <div className="gm-shop-pane-title">Spellcasting services</div>
      </div>
      <p className="gm-count gm-shop-offers-intro">
        Scribe Scrolls/Wands of any catalog spell up to an item level, by tradition and rarity.
      </p>
      <div className="gm-shop-offer-filters">
        <div className="form-group gm-shop-offer-field">
          <span className="gm-shop-offer-label">sells</span>
          <div className="gm-shop-chips" role="group" aria-label="sells">
            {[['scroll', 'Scrolls'], ['wand', 'Wands']].map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                className={`gm-shop-chip${config[k] ? ' is-on' : ''}`}
                aria-pressed={!!config[k]}
                aria-label={`spell-kind-${k}`}
                onClick={() => setField({ [k]: !config[k] })}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
        <div className="form-group gm-shop-offer-rank">
          <label htmlFor="spell-maxlevel">max item level</label>
          <input
            id="spell-maxlevel"
            aria-label="spell-maxlevel"
            type="number"
            min="1"
            max="19"
            value={config.maxLevel}
            onChange={(e) => setField({ maxLevel: e.target.value })}
          />
        </div>
        <ChipMulti
          label="traditions"
          options={ALL_TRADITIONS}
          selected={config.traditions}
          onToggle={(v) => toggleIn('traditions', v)}
          idBase="spell-trad"
          hint="none = all"
        />
        <ChipMulti
          label="rarities"
          options={ALL_RARITIES}
          selected={config.rarities}
          onToggle={(v) => toggleIn('rarities', v)}
          idBase="spell-rarity"
          hint="none = common only"
        />
        <div className="form-group gm-shop-offer-field gm-shop-offer-mod">
          <label htmlFor="spell-pricemod">price ×</label>
          <input
            id="spell-pricemod"
            aria-label="spell-pricemod"
            type="number"
            min="0"
            step="0.05"
            placeholder="1"
            value={config.priceMod}
            onChange={(e) => setField({ priceMod: e.target.value })}
          />
        </div>
      </div>
      {enabled.length === 0 ? (
        <p className="gm-count gm-shop-offers-empty">
          Not selling scrolls or wands. Choose Scrolls or Wands above to offer spellcasting services.
        </p>
      ) : (
        enabled.map(([k]) => {
          const s = spellOfferingSummary(
            { spellItem: k, maxLevel: parseInt(config.maxLevel, 10) || 1, traditions: config.traditions, rarities: config.rarities },
            spells
          );
          return (
            <p key={k} className="gm-shop-offer-summary" data-testid={`spell-summary-${k}`}>{s.text}</p>
          );
        })
      )}
    </div>
  );
};

// The "Runesmithing services" section (#982 G2): the GM picks which rune targets
// to sell (weapon/armor/ring/accessory), a max rune level per selected target,
// and allowed rarities; a live summary shows coverage (off the G1 selector).
// Targets empty = none (unlike traditions, a rune offering needs ≥1 target);
// rarities empty = common only.
const RunesmithingSection = ({ config, runes, items, onChange }) => {
  const setField = (patch) => onChange({ ...config, ...patch });
  const toggleTarget = (t) => setField({ [t]: !config[t] });
  const setLevel = (t, v) => setField({ levels: { ...config.levels, [t]: v } });
  const toggleRarity = (v) => {
    const cur = config.rarities || [];
    setField({ rarities: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] });
  };
  const enabled = RUNE_TARGET_LABELS.filter(([t]) => config[t]);

  // The live coverage summary + the base gear this offering auto-stocks in the
  // player storefront (#1044 — specific-target services only; the all-target
  // general runesmith expands to none).
  const { summary, hosts } = useMemo(() => {
    if (enabled.length === 0) return { summary: null, hosts: [] };
    const ware = {
      runeService: true,
      targets: enabled.map(([t]) => t),
      maxLevel: Object.fromEntries(enabled.map(([t]) => [t, parseInt(config.levels?.[t], 10) || 1])),
      rarities: config.rarities,
    };
    return { summary: runeOfferingSummary(ware, runes), hosts: eligibleHostItems(ware, items, runes) };
  }, [enabled, config, runes, items]);

  return (
    <div className="gm-shop-offers" data-testid="rune-offerings">
      <div className="gm-shop-offers-head">
        <div className="gm-shop-pane-title">Runesmithing services</div>
      </div>
      <p className="gm-count gm-shop-offers-intro">
        Etch any catalog rune onto a runestone, by target and rune level. Most
        accessory runes are Uncommon — opt into the Uncommon rarity to stock them.
      </p>
      <div className="gm-shop-offer-filters">
        <div className="form-group gm-shop-offer-field">
          <span className="gm-shop-offer-label">targets</span>
          <div className="gm-shop-chips" role="group" aria-label="targets">
            {RUNE_TARGET_LABELS.map(([t, lbl]) => (
              <button
                key={t}
                type="button"
                className={`gm-shop-chip${config[t] ? ' is-on' : ''}`}
                aria-pressed={!!config[t]}
                aria-label={`rune-target-${t}`}
                onClick={() => toggleTarget(t)}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
        {enabled.map(([t, lbl]) => (
          <div key={t} className="form-group gm-shop-offer-rank">
            <label htmlFor={`rune-maxlevel-${t}`}>{lbl} max level</label>
            <input
              id={`rune-maxlevel-${t}`}
              aria-label={`rune-maxlevel-${t}`}
              type="number"
              min="1"
              max={String(RUNE_MAX_LEVEL)}
              value={config.levels?.[t] ?? ''}
              onChange={(e) => setLevel(t, e.target.value)}
            />
          </div>
        ))}
        <ChipMulti
          label="rarities"
          options={ALL_RARITIES}
          selected={config.rarities}
          onToggle={toggleRarity}
          idBase="rune-rarity"
          hint="none = common only"
        />
      </div>
      {enabled.length === 0 ? (
        <p className="gm-count gm-shop-offers-empty">
          Not selling runes. Choose a target above to offer runesmithing services.
        </p>
      ) : (
        <>
          <p className="gm-shop-offer-summary" data-testid="rune-summary">{summary.text}</p>
          {hosts.length > 0 ? (
            <p className="gm-count gm-shop-offer-hosts" data-testid="rune-host-summary">
              Also auto-stocks {hosts.length} base gear item{hosts.length === 1 ? '' : 's'} these runes etch onto (shown in the player Wares tab).
            </p>
          ) : enabled.length === RUNE_TARGET_LABELS.length ? (
            <p className="gm-count gm-shop-offer-hosts" data-testid="rune-host-summary">
              General runesmith (every target) — base gear is not auto-stocked.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
};

// The "Dragonbreath weapons" section (#1210 M4g): the GM stocks specific
// templated weapons — each a base weapon + tier + free-form dragon type (the
// pack invites GM-curated kinds; the authored DRAGON_KINDS are suggestions) with
// an optional price/stock override. A live preview per row shows the derived name
// + breath line off the spine, mirroring the GM → Characters authoring surface.
const DragonbreathSection = ({ rows, weapons, catalogMap, onChange }) => {
  const setRow = (i, patch) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () =>
    onChange([...rows, { ref: weapons[0] ? String(weapons[0].id) : '', tier: 'base', dragonType: '', price: '', stock: '' }]);
  const removeRow = (i) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <div className="gm-shop-offers" data-testid="dragonbreath-offerings">
      <div className="gm-shop-offers-head">
        <div className="gm-shop-pane-title">Dragonbreath weapons</div>
      </div>
      <p className="gm-count gm-shop-offers-intro">
        Stock a specific dragonbreath weapon — a base weapon carrying a tier and a dragon type. It
        sells as loot-grade gear; the buyer can etch property runes and upgrade its tier later.
      </p>
      {weapons.length === 0 ? (
        <p className="gm-count gm-shop-offers-empty">No base weapons in the catalog to template.</p>
      ) : rows.length === 0 ? (
        <p className="gm-count gm-shop-offers-empty" data-testid="dragonbreath-empty">
          No dragonbreath weapons stocked. Add one below.
        </p>
      ) : (
        <ul className="gm-shop-wares" aria-label="dragonbreath weapons">
          {rows.map((r, i) => {
            const base = catalogMap.get(String(r.ref));
            const baseName = base ? base.name : '(pick a weapon)';
            const preview = dragonbreathName({ tier: r.tier, dragonType: r.dragonType, base: baseName });
            const breath = dragonbreathBreath({ dragonbreath: { tier: r.tier, dragonType: r.dragonType } });
            const defPrice = dragonbreathTierPrice(r.tier) + (Number(base?.price) || 0);
            return (
              <li key={i} className="gm-row gm-shop-ware-row" data-testid={`db-row-${i}`}>
                <div className="gm-shop-ware-top">
                  <span className="gm-shop-ware-name">{preview}</span>
                  <button type="button" className="btn-small btn-danger gm-shop-ware-x"
                    aria-label={`db-remove-${i}`} onClick={() => removeRow(i)}>✕</button>
                </div>
                <div className="gm-shop-offer-filters">
                  <div className="form-group gm-shop-offer-field">
                    <label htmlFor={`db-base-${i}`}>base weapon</label>
                    <select id={`db-base-${i}`} aria-label={`db-base-${i}`} value={r.ref}
                      onChange={(e) => setRow(i, { ref: e.target.value })}>
                      {weapons.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group gm-shop-offer-field">
                    <label htmlFor={`db-tier-${i}`}>tier</label>
                    <select id={`db-tier-${i}`} aria-label={`db-tier-${i}`} value={r.tier}
                      onChange={(e) => setRow(i, { tier: e.target.value })}>
                      {DRAGONBREATH_TIER_ORDER.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group gm-shop-offer-field">
                    <label htmlFor={`db-type-${i}`}>dragon type</label>
                    <input id={`db-type-${i}`} aria-label={`db-type-${i}`} list="gm-shop-db-kinds"
                      value={r.dragonType} placeholder="e.g. Red, Mirage"
                      onChange={(e) => setRow(i, { dragonType: e.target.value })} />
                  </div>
                  <div className="form-group gm-shop-ware-field">
                    <label htmlFor={`db-price-${i}`}>price (gp)</label>
                    <input id={`db-price-${i}`} aria-label={`db-price-${i}`} type="number" min="0"
                      placeholder={String(defPrice)} value={r.price}
                      onChange={(e) => setRow(i, { price: e.target.value })} />
                  </div>
                  <div className="form-group gm-shop-ware-field">
                    <label htmlFor={`db-stock-${i}`}>stock</label>
                    <input id={`db-stock-${i}`} aria-label={`db-stock-${i}`} type="number" min="0"
                      placeholder="∞" value={r.stock}
                      onChange={(e) => setRow(i, { stock: e.target.value })} />
                  </div>
                </div>
                <p className="gm-count" data-testid={`db-preview-${i}`}>
                  L{dragonbreathTierLevel(r.tier)} · {defPrice} gp · {breath.dice}{' '}
                  {breath.damageTypes.length ? breath.damageTypes.join('/') : '(GM sets type)'} · basic
                  Reflex DC {breath.dc} · {breath.coneFt}-ft cone
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {weapons.length > 0 && (
        <div className="gm-actions">
          <button type="button" className="btn-small btn-secondary" data-testid="db-add" onClick={addRow}>
            + Add dragonbreath weapon
          </button>
        </div>
      )}
      <datalist id="gm-shop-db-kinds">
        {DRAGON_KIND_KEYS.map((k) => <option key={k} value={capKind(k)} />)}
      </datalist>
    </div>
  );
};

// ── Sale Shelf per-item editors ──────────────────────────────────────────────
// The rune target the editor's "second" fundamental slot fills, per base kind.
const RUNE_SECOND_LABEL = { weapon: 'striking', armor: 'resilient' };

// The kind (rune target) a base item resolves as — mirrors saleShelf's runeHostKind
// so the editor can seed its target selector from a stored ware's base.
const saleHostKindOf = (item) =>
  !item ? 'accessory' : item.powerRing ? 'ring' : item.strikes ? 'weapon' : item.armor ? 'armor' : 'accessory';

// Inline editor for one runed sale item: pick target → base → runes, all
// constrained to `options` (saleRuneEditOptions). Emits a selection to onApply;
// Workspace bakes + prices it via buildRuneSaleItem. `items` supplies the ring
// grade / socket structure the options list doesn't carry.
const RuneItemEditor = ({ ware, options, items, onApply, onCancel }) => {
  const targets = Object.keys(options);
  const itemById = useMemo(
    () => new Map((Array.isArray(items) ? items : []).map((it) => [String(it.id), it])),
    [items]
  );
  const r0 = ware.runes || {};
  const seedKind = saleHostKindOf(itemById.get(String(ware.ref)));
  const [target, setTarget] = useState(targets.includes(seedKind) ? seedKind : targets[0]);
  const [ref, setRef] = useState(String(ware.ref));
  const [level, setLevel] = useState(ware.level ?? null);
  const [potency, setPotency] = useState(r0.potency != null ? String(r0.potency) : '');
  const [second, setSecond] = useState(r0.striking ?? r0.resilient ?? '');
  const [property, setProperty] = useState(Array.isArray(r0.property) ? r0.property.map(String) : []);
  const [accessory, setAccessory] = useState(r0.accessory != null ? String(r0.accessory) : '');

  const opt = options[target] || { hosts: [] };
  const host = itemById.get(String(ref));
  const ringGrade =
    target === 'ring' && host && Array.isArray(host.variants)
      ? host.variants.find((v) => v.level === level)
      : null;
  // Property-slot cap: weapon/armor = potency tier; ring = grade sockets.
  let propCap = 0;
  if (target === 'weapon' || target === 'armor') propCap = Number(potency) || 0;
  else if (target === 'ring') propCap = Number(ringGrade?.overrides?.ringSockets ?? host?.ringSockets) || 0;

  const chooseTarget = (t) => {
    const o = options[t] || { hosts: [] };
    const first = o.hosts[0];
    setTarget(t);
    setRef(first ? String(first.id) : '');
    setLevel(t === 'ring' && first?.variants?.length ? first.variants[0].level : null);
    setPotency(t === 'weapon' || t === 'armor' ? (o.potency?.[0]?.tier != null ? String(o.potency[0].tier) : '') : '');
    setSecond('');
    setProperty([]);
    setAccessory(t === 'accessory' ? String(first?.runes?.[0]?.id ?? '') : '');
  };

  const chooseRef = (id) => {
    setRef(id);
    setProperty([]);
    const it = itemById.get(String(id));
    if (target === 'ring') setLevel(it?.variants?.length ? it.variants[0].level : null);
    if (target === 'accessory') {
      const h = (opt.hosts || []).find((x) => String(x.id) === String(id));
      setAccessory(String(h?.runes?.[0]?.id ?? ''));
    }
  };

  const toggleProp = (id) =>
    setProperty((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < propCap ? [...cur, id] : cur));

  const apply = () => {
    const runes = {};
    if (target === 'weapon' || target === 'armor') {
      if (potency) runes.potency = Number(potency);
      if (second) runes[target === 'weapon' ? 'striking' : 'resilient'] = second;
      if (property.length) runes.property = property;
    } else if (target === 'ring') {
      if (property.length) runes.property = property;
    } else if (accessory) {
      runes.accessory = accessory;
    }
    const sel = { ref, runes };
    if (target === 'ring') sel.level = level;
    onApply(ware.saleId, sel);
  };

  const hostRunes = (opt.hosts.find((h) => String(h.id) === String(ref))?.runes) || [];
  const hostVariants = (opt.hosts.find((h) => String(h.id) === String(ref))?.variants) || [];

  return (
    <div className="gm-shop-sale-edit" data-testid={`sale-editor-${ware.saleId}`}>
      {targets.length > 1 && (
        <div className="form-group gm-shop-offer-field">
          <label htmlFor={`sale-target-${ware.saleId}`}>type</label>
          <select id={`sale-target-${ware.saleId}`} aria-label="sale-target" value={target} onChange={(e) => chooseTarget(e.target.value)}>
            {targets.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      )}
      <div className="form-group gm-shop-offer-field">
        <label htmlFor={`sale-base-${ware.saleId}`}>base item</label>
        <select id={`sale-base-${ware.saleId}`} aria-label="sale-base" value={ref} onChange={(e) => chooseRef(e.target.value)}>
          {(opt.hosts || []).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </div>

      {target === 'ring' && hostVariants.length > 0 && (
        <div className="form-group gm-shop-offer-field">
          <label htmlFor={`sale-grade-${ware.saleId}`}>grade</label>
          <select id={`sale-grade-${ware.saleId}`} aria-label="sale-grade" value={level ?? ''} onChange={(e) => setLevel(Number(e.target.value))}>
            {hostVariants.map((v) => <option key={v.level} value={v.level}>{v.name || `Level ${v.level}`}</option>)}
          </select>
        </div>
      )}

      {(target === 'weapon' || target === 'armor') && (
        <>
          <div className="form-group gm-shop-offer-field">
            <label htmlFor={`sale-potency-${ware.saleId}`}>potency</label>
            <select id={`sale-potency-${ware.saleId}`} aria-label="sale-potency" value={potency} onChange={(e) => { setPotency(e.target.value); setProperty([]); }}>
              {(opt.potency || []).map((t) => <option key={t.tier} value={t.tier}>{t.name}</option>)}
            </select>
          </div>
          <div className="form-group gm-shop-offer-field">
            <label htmlFor={`sale-second-${ware.saleId}`}>{RUNE_SECOND_LABEL[target]}</label>
            <select id={`sale-second-${ware.saleId}`} aria-label="sale-second" value={second} onChange={(e) => setSecond(e.target.value)}>
              <option value="">none</option>
              {(opt.second || []).map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
            </select>
          </div>
        </>
      )}

      {(target === 'weapon' || target === 'armor' || target === 'ring') && (opt.properties || []).length > 0 && (
        <div className="form-group gm-shop-offer-field">
          <span className="gm-shop-offer-label">
            property runes<span className="gm-shop-offer-hint"> · {property.length}/{propCap}</span>
          </span>
          <div className="gm-shop-chips" role="group" aria-label="sale-properties">
            {(opt.properties || []).map((p) => {
              const on = property.includes(String(p.id));
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`gm-shop-chip${on ? ' is-on' : ''}`}
                  aria-pressed={on}
                  aria-label={`sale-prop-${p.id}`}
                  disabled={!on && property.length >= propCap}
                  onClick={() => toggleProp(String(p.id))}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {target === 'accessory' && (
        <div className="form-group gm-shop-offer-field">
          <label htmlFor={`sale-rune-${ware.saleId}`}>rune</label>
          <select id={`sale-rune-${ware.saleId}`} aria-label="sale-accessory" value={accessory} onChange={(e) => setAccessory(e.target.value)}>
            {hostRunes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
      )}

      <div className="gm-actions gm-shop-sale-edit-actions">
        <button type="button" className="btn-small btn-secondary" aria-label="sale-cancel" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn-small btn-primary" aria-label={`sale-apply-${ware.saleId}`} onClick={apply}>Apply</button>
      </div>
    </div>
  );
};

// Inline editor for one scroll pack: pick a rank + four spells (duplicates
// allowed), all from `options` (saleScrollPackOptions). Emits to onApply;
// Workspace bakes + prices it via buildScrollPackWare.
const ScrollPackEditor = ({ ware, options, onApply, onCancel }) => {
  const ranks = Array.isArray(options) ? options : [];
  const [rank, setRank] = useState(() => (ranks.some((r) => r.rank === ware.rank) ? ware.rank : ranks[0]?.rank ?? ''));
  const spellsForRank = (ranks.find((r) => r.rank === rank)?.spells) || [];
  const [scrolls, setScrolls] = useState(() => {
    const cur = Array.isArray(ware.scrolls) ? ware.scrolls.map((s) => String(s.spellRef)) : [];
    const valid = new Set(spellsForRank.map((s) => String(s.id)));
    const first = spellsForRank[0]?.id != null ? String(spellsForRank[0].id) : '';
    return [0, 1, 2, 3].map((i) => (cur[i] && valid.has(cur[i]) ? cur[i] : first));
  });

  const chooseRank = (r) => {
    const nr = Number(r);
    setRank(nr);
    const list = (ranks.find((x) => x.rank === nr)?.spells) || [];
    const first = list[0]?.id != null ? String(list[0].id) : '';
    setScrolls([first, first, first, first]);
  };
  const setSlot = (i, id) => setScrolls((cur) => cur.map((v, idx) => (idx === i ? id : v)));

  return (
    <div className="gm-shop-sale-edit" data-testid={`sale-editor-${ware.saleId}`}>
      <div className="form-group gm-shop-offer-field">
        <label htmlFor={`sale-rank-${ware.saleId}`}>rank</label>
        <select id={`sale-rank-${ware.saleId}`} aria-label="sale-rank" value={rank} onChange={(e) => chooseRank(e.target.value)}>
          {ranks.map((r) => <option key={r.rank} value={r.rank}>Rank {r.rank}</option>)}
        </select>
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div className="form-group gm-shop-offer-field" key={i}>
          <label htmlFor={`sale-scroll-${ware.saleId}-${i}`}>scroll {i + 1}</label>
          <select id={`sale-scroll-${ware.saleId}-${i}`} aria-label={`sale-scroll-${i}`} value={scrolls[i] || ''} onChange={(e) => setSlot(i, e.target.value)}>
            {spellsForRank.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      ))}
      <div className="gm-actions gm-shop-sale-edit-actions">
        <button type="button" className="btn-small btn-secondary" aria-label="sale-cancel" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn-small btn-primary" aria-label={`sale-apply-${ware.saleId}`} onClick={() => onApply(ware.saleId, { rank, scrolls })}>Apply</button>
      </div>
    </div>
  );
};

// ── Sale Shelf (#1134 / S2 #1136) ────────────────────────────────────────────
// A GM-rolled shelf of one-of-a-kind discounted goods layered on the shop's
// existing services: `saleCount` randomly-runed items from the Runesmithing
// window (at `saleDiscount`) + `salePacks` four-scroll packs from the Scroll
// window. The counts/discount are authored here but persist ON the offering
// wares (so they round-trip through toRune/SpellConfig); "Roll sale shelf" bakes
// concrete wares into shops[loreId].saleShelf via the #1135 engine — a reroll
// replaces the shelf wholesale. The preview resolves the stored shelf exactly as
// the storefront will render it (discounted price + struck-through full price).
const SaleShelfSection = ({
  runeConfig, spellConfig, editRuneConfig, editSpellConfig, preview, canRoll, hasShelf, onRoll, onClear,
  shelf, items, runeOptions, scrollOptions, onReroll, onRemove, onApplyRune, onApplyScroll,
}) => {
  const hasRuneOffering = RUNE_TARGETS.some((t) => runeConfig[t]);
  const hasScrollOffering = !!spellConfig.scroll;
  // Which shelf slot has its inline editor open (saleId), if any.
  const [editingId, setEditingId] = useState(null);

  return (
    <div className="gm-shop-offers" data-testid="sale-shelf">
      <div className="gm-shop-offers-head">
        <div className="gm-shop-pane-title">Sale Shelf</div>
      </div>
      <p className="gm-count gm-shop-offers-intro">
        Roll a shelf of one-of-a-kind discounted goods from this shop’s services — randomly-runed
        gear and four-scroll packs, priced and baked when you roll.
      </p>
      {!hasRuneOffering && !hasScrollOffering ? (
        <p className="gm-count gm-shop-offers-empty" data-testid="sale-shelf-noservice">
          Enable a Runesmithing target or Scrolls above to stock a Sale Shelf.
        </p>
      ) : (
        <>
          <div className="gm-shop-offer-filters">
            {hasRuneOffering && (
              <>
                <div className="form-group gm-shop-offer-rank">
                  <label htmlFor="sale-rune-count">discounted rune items</label>
                  <input
                    id="sale-rune-count"
                    aria-label="sale-rune-count"
                    type="number"
                    min="0"
                    max="20"
                    placeholder="0"
                    value={runeConfig.saleCount ?? ''}
                    onChange={(e) => editRuneConfig({ ...runeConfig, saleCount: e.target.value })}
                  />
                </div>
                <div className="form-group gm-shop-offer-rank">
                  <label htmlFor="sale-rune-discount">discount %</label>
                  <input
                    id="sale-rune-discount"
                    aria-label="sale-rune-discount"
                    type="number"
                    min="0"
                    max="99"
                    placeholder="0"
                    value={runeConfig.saleDiscount ?? ''}
                    onChange={(e) => editRuneConfig({ ...runeConfig, saleDiscount: e.target.value })}
                  />
                </div>
              </>
            )}
            {hasScrollOffering && (
              <div className="form-group gm-shop-offer-rank">
                <label htmlFor="sale-scroll-packs">scroll packs (¾ price)</label>
                <input
                  id="sale-scroll-packs"
                  aria-label="sale-scroll-packs"
                  type="number"
                  min="0"
                  max="20"
                  placeholder="0"
                  value={spellConfig.salePacks ?? ''}
                  onChange={(e) => editSpellConfig({ ...spellConfig, salePacks: e.target.value })}
                />
              </div>
            )}
          </div>

          {preview.length > 0 ? (
            <ul className="gm-shop-sale-list" aria-label="sale shelf">
              {preview.map((w) => {
                const rawWare = (Array.isArray(shelf) ? shelf : []).find((x) => x && x.saleId === w.saleId);
                const editing = editingId === w.saleId;
                return (
                  <li key={w.id} className="gm-shop-sale-item" data-testid={`sale-item-${w.id}`}>
                    <div className="gm-shop-sale-row">
                      <span className="gm-shop-sale-name">{w.name}</span>
                      <span className="gm-shop-sale-price">
                        {w.saleFullPrice != null && w.saleFullPrice !== w.price && (
                          <span className="gm-shop-sale-full">{w.saleFullPrice} gp</span>
                        )}
                        <span className="gm-shop-sale-now">{w.price} gp</span>
                      </span>
                      <span className="gm-shop-sale-item-actions">
                        <button
                          type="button"
                          className="btn-small btn-secondary"
                          aria-label={`sale-edit-${w.saleId}`}
                          onClick={() => setEditingId(editing ? null : w.saleId)}
                        >
                          {editing ? 'Close' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          className="btn-small btn-secondary"
                          aria-label={`sale-reroll-${w.saleId}`}
                          onClick={() => onReroll(w.saleId)}
                        >
                          Reroll
                        </button>
                        <button
                          type="button"
                          className="btn-small btn-danger"
                          aria-label={`sale-remove-${w.saleId}`}
                          onClick={() => onRemove(w.saleId)}
                        >
                          Remove
                        </button>
                      </span>
                    </div>
                    {editing && rawWare && (rawWare.sale === 'scrollpack' ? (
                      <ScrollPackEditor
                        ware={rawWare}
                        options={scrollOptions}
                        onApply={(id, sel) => { onApplyScroll(id, sel); setEditingId(null); }}
                        onCancel={() => setEditingId(null)}
                      />
                    ) : (
                      <RuneItemEditor
                        ware={rawWare}
                        options={runeOptions}
                        items={items}
                        onApply={(id, sel) => { onApplyRune(id, sel); setEditingId(null); }}
                        onCancel={() => setEditingId(null)}
                      />
                    ))}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="gm-count gm-shop-offers-empty" data-testid="sale-shelf-empty">
              No shelf rolled yet. Set counts above, then roll.
            </p>
          )}

          <div className="gm-actions gm-shop-sale-actions">
            <span className="gm-count gm-shop-tally">
              {preview.length} item{preview.length === 1 ? '' : 's'} on the shelf
            </span>
            {hasShelf && (
              <button type="button" className="btn-small btn-secondary" onClick={onClear}>
                Clear shelf
              </button>
            )}
            <button type="button" className="btn-primary" disabled={!canRoll} onClick={onRoll}>
              {hasShelf ? 'Reroll sale shelf' : 'Roll sale shelf'}
            </button>
          </div>
          {!canRoll && (
            <p className="gm-count gm-shop-offers-empty">
              Set “discounted rune items” or “scroll packs” above 0 to roll.
            </p>
          )}
        </>
      )}
    </div>
  );
};

// The per-location authoring surface. `onBack` is supplied only by finders that
// hide the list (the Command finder, S5); inside PageEditorShell the list stays
// visible, so no back button renders.
const Workspace = ({ location, shops, spells, runes, items, catalog, chips, catalogMap, runeMap, setShop, removeShop, onBack }) => {
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
  const [dbRows, setDbRows] = useState(() => toDragonbreathRows(entry?.wares));
  const [spellConfig, setSpellConfig] = useState(() => toSpellConfig(entry?.wares));
  const [runeConfig, setRuneConfig] = useState(() => toRuneConfig(entry?.wares));

  // Base weapons the GM can template into a dragonbreath weapon (#1210 M4g) —
  // mundane base weapons only (shopHostKind 'weapon'), title-sorted.
  const weapons = useMemo(
    () => (Array.isArray(items) ? items : [])
      .filter((it) => shopHostKind(it) === 'weapon')
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [items]
  );
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

  const editSpellConfig = (next) => { setSpellConfig(next); touch(); };
  const editRuneConfig = (next) => { setRuneConfig(next); touch(); };
  const editDbRows = (next) => { setDbRows(next); touch(); };

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
    setDbRows([]);
    setSpellConfig(toSpellConfig([]));
    setRuneConfig(toRuneConfig([]));
    setOffersSpellcasting(false);
    setOffersRunes(false);
    setDirty(false);
    setJustSaved(false);
  };

  // Publish the whole entry (meta + wares), optionally with an extra patch (the
  // rolled `saleShelf`, #1136). One writer for Save & publish and Roll.
  const buildWares = () => [
    ...fromRows(rows),
    ...fromDragonbreathRows(dbRows),
    ...fromSpellConfig(spellConfig),
    ...fromRuneConfig(runeConfig),
  ];
  const publish = (extra) => {
    setShop(loreId, {
      keeper,
      open,
      revealed,
      offersSpellcasting,
      offersRunes,
      wares: buildWares(),
      ...(extra || {}),
    });
    setDirty(false);
    setJustSaved(true);
  };
  const save = () => publish();

  // Sale Shelf (#1136): a roll bakes concrete wares off the CURRENT config (so an
  // unsaved count still rolls) and publishes them alongside the entry; a reroll
  // replaces the shelf wholesale. Clear just empties it.
  const rollShelf = () => publish({ saleShelf: rollSaleShelf({ wares: buildWares() }, items, runes, spells) });
  const clearShelf = () => setShop(loreId, { saleShelf: [] });

  // Per-item shelf ops (per-item customization): each writes ONLY the published
  // shelf (like clearShelf, so unsaved ware config isn't clobbered), off the
  // current offering config. Reroll/build reuse the #1135 engine; the editors
  // read their choices from the memoized option enumerators below.
  const shelfNow = () => (Array.isArray(entry?.saleShelf) ? entry.saleShelf : []);
  const writeShelf = (next) => setShop(loreId, { saleShelf: next });
  const removeShelfItem = (id) => writeShelf(shelfNow().filter((w) => w.saleId !== id));
  const rerollShelfItem = (id) =>
    writeShelf(rerollSaleItem({ wares: buildWares(), saleShelf: shelfNow() }, id, items, runes, spells));
  const putShelfItem = (id, ware) => { if (ware) writeShelf(shelfNow().map((w) => (w.saleId === id ? ware : w))); };
  const saleWares = useMemo(
    () => [...fromRows(rows), ...fromSpellConfig(spellConfig), ...fromRuneConfig(runeConfig)],
    [rows, spellConfig, runeConfig]
  );
  const runeOffering = useMemo(() => saleWares.find(isRuneServiceWare), [saleWares]);
  const scrollOffering = useMemo(
    () => saleWares.find((w) => isSpellItemWare(w) && w.spellItem === 'scroll'),
    [saleWares]
  );
  const applyRuneItem = (id, sel) => putShelfItem(id, buildRuneSaleItem(runeOffering, id, sel, items, runes));
  const applyScrollItem = (id, sel) => putShelfItem(id, buildScrollPackWare(scrollOffering, id, sel, spells));
  const runeEditOptions = useMemo(
    () => (runeOffering ? saleRuneEditOptions(runeOffering, items, runes) : {}),
    [runeOffering, items, runes]
  );
  const scrollEditOptions = useMemo(
    () => (scrollOffering ? saleScrollPackOptions(scrollOffering, spells) : []),
    [scrollOffering, spells]
  );

  const salePreview = useMemo(
    () => resolveSaleWares(loreId, shops, catalogMap, runeMap, spells),
    [loreId, shops, catalogMap, runeMap, spells]
  );
  const hasShelf = Array.isArray(entry?.saleShelf) && entry.saleShelf.length > 0;
  const saleConfigured =
    (RUNE_TARGETS.some((t) => runeConfig[t]) && (parseInt(runeConfig.saleCount, 10) || 0) > 0) ||
    (!!spellConfig.scroll && (parseInt(spellConfig.salePacks, 10) || 0) > 0);

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

          <SpellcastingSection
            config={spellConfig}
            spells={spells}
            onChange={editSpellConfig}
          />

          <RunesmithingSection
            config={runeConfig}
            runes={runes}
            items={items}
            onChange={editRuneConfig}
          />

          <DragonbreathSection
            rows={dbRows}
            weapons={weapons}
            catalogMap={catalogMap}
            onChange={editDbRows}
          />

          <SaleShelfSection
            runeConfig={runeConfig}
            spellConfig={spellConfig}
            editRuneConfig={editRuneConfig}
            editSpellConfig={editSpellConfig}
            preview={salePreview}
            canRoll={saleConfigured}
            hasShelf={hasShelf}
            onRoll={rollShelf}
            onClear={clearShelf}
            shelf={entry?.saleShelf}
            items={items}
            runeOptions={runeEditOptions}
            scrollOptions={scrollEditOptions}
            onReroll={rerollShelfItem}
            onRemove={removeShelfItem}
            onApplyRune={applyRuneItem}
            onApplyScroll={applyScrollItem}
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
            runes={runes}
            items={items}
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
