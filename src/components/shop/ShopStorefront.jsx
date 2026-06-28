import React, { useEffect, useMemo, useState } from 'react';
import { itemCatalogMap, runeCatalogMap } from '../../utils/contentUtils';
import {
  resolveShopWares,
  groupWares,
  traitAccent,
  isShopOpen,
  shopOffersSpellcasting,
  shopOffersRunes,
} from '../../utils/shopUtils';
import { useBuyItems } from '../../hooks/useBuyItems';
import './ShopStorefront.css';

// Player Shop redesign (#857). A full-screen, phone-shaped storefront that
// replaces the Modal-wrapped ShopModal window: header band · keeper line · lore
// banner (read-only) · computed tab bar · scrolling body. S3 (#860) ships the
// shell + the Wares tab (grid browse + takeover preview); it is read-only-capable
// and carries no cart yet. The cart bar + buying wire in on S4 (#861); the
// Spellcasting (S5) and Runesmithing (S6/S7) tabs replace the placeholders here.
//
// Until S4 brings the cart over, only the read-only (lore) entry point routes
// here; in-town buying stays on ShopModal. The component already renders the
// town shell (cart-less) so S4 can flip the remaining entry points over.

// Per-tab accent (the design's "active accent follows the tab"). Wares ember,
// Spellcasting arcane, Runes gold — mapped to the app's scaled palette vars.
const TAB_ACCENT = { wares: 'var(--ember-base)', spellcasting: 'var(--arcane-mid)', runes: 'var(--gold-mid)' };
const TAB_LABEL = { wares: 'Wares', spellcasting: 'Spells', runes: 'Runes' };
const TAB_SUB = { wares: 'goods', spellcasting: 'scrolls', runes: 'smithing' };

// traitAccent returns a bare token (arcane|verdant|iron|gold); each has a `-mid`
// scale step, so the chip tint bridges through one var().
const wareAccentVar = (group) => `var(--${traitAccent(group)}-mid)`;

const firstLetter = (s) => String(s || '?').trim().charAt(0).toUpperCase() || '?';

// A stocked form's add-button / list label: its variant label, else "Lvl N",
// else the (single-form) item name.
const formLabel = (form) =>
  form.label || (form.level != null ? `Lvl ${form.level}` : form.name);

// The most common traits across the grouped wares, descending by count (ties
// alphabetical), capped so the filter row stays one band.
const topTraits = (groups, limit = 8) => {
  const counts = new Map();
  groups.forEach((g) => (g.traits || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([t]) => t);
};

// Wares tab: search + trait-chip filter over the grouped grid, tap → takeover.
const WaresTab = ({ groups, onSelect }) => {
  const [query, setQuery] = useState('');
  const [trait, setTrait] = useState(null);
  const chips = useMemo(() => topTraits(groups), [groups]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter((g) => {
      if (q && !g.name.toLowerCase().includes(q)) return false;
      if (trait && !(g.traits || []).includes(trait)) return false;
      return true;
    });
  }, [groups, query, trait]);

  return (
    <div className="ps-wares">
      <div className="ps-tools">
        <div className="ps-search">
          <span className="ps-search-ico" aria-hidden="true">⌕</span>
          <input
            type="text"
            aria-label="search wares"
            placeholder="Search the shelves…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {chips.length > 0 && (
          <div className="ps-chips" role="group" aria-label="trait filters">
            {chips.map((t) => (
              <button
                key={t}
                type="button"
                className={`ps-chip${trait === t ? ' is-on' : ''}`}
                aria-pressed={trait === t}
                onClick={() => setTrait((cur) => (cur === t ? null : t))}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="ps-empty">Nothing on the shelves matches.</p>
      ) : (
        <ul className="ps-grid" aria-label="wares">
          {shown.map((g) => (
            <li key={g.ref}>
              <button
                type="button"
                className="ps-tile"
                data-testid={`ware-${g.ref}`}
                style={{ '--ps-ware-accent': wareAccentVar(g) }}
                onClick={() => onSelect(g)}
              >
                <span className="ps-tile-case" aria-hidden="true">{firstLetter(g.name)}</span>
                <span className="ps-tile-name">{g.name}</span>
                <span className="ps-tile-foot">
                  <span className="ps-tile-price">
                    {g.formCount > 1 ? `from ${g.from}` : g.from} gp
                  </span>
                  {g.formCount > 1 && <span className="ps-tile-forms">{g.formCount} forms</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// Takeover preview: full-bleed panel over the body for the selected group. Lists
// each stocked form + price; add affordances arrive with the cart (S4). Read-only
// browsing shows the "not here to buy" note instead.
const Takeover = ({ group, readOnly, onBack }) => {
  const head = group.forms[0];
  return (
    <div className="ps-takeover" data-testid="ware-preview">
      <button type="button" className="ps-takeover-back" onClick={onBack}>
        ‹ Back
      </button>
      <div className="ps-preview" style={{ '--ps-ware-accent': wareAccentVar(group) }}>
        <div className="ps-preview-crest" aria-hidden="true">{firstLetter(group.name)}</div>
        <h2 className="ps-preview-name">{group.name}</h2>
        <div className="ps-preview-tags">
          {head.level != null && head.level > 0 && (
            <span className="ps-preview-lvl">Level {head.level}</span>
          )}
          {(group.traits || []).slice(0, 4).map((t) => (
            <span key={t} className="ps-preview-trait">{t}</span>
          ))}
        </div>
        {group.description && <p className="ps-preview-desc">{group.description}</p>}
        <ul className="ps-preview-forms" aria-label="forms">
          {group.forms.map((f) => (
            <li key={f.wareKey} className="ps-preview-form">
              <span className="ps-preview-form-label">{formLabel(f)}</span>
              <span className="ps-preview-form-price">{f.price} gp</span>
            </li>
          ))}
        </ul>
        {readOnly && (
          <p className="ps-preview-note" role="note">
            Recalled from a lore entry — not here to buy.
          </p>
        )}
      </div>
    </div>
  );
};

// Placeholder body for a computed-but-not-yet-built tab (Spellcasting S5, Runes
// S6). Keeps the tab bar honest while the content lands in later slices.
const ComingSoon = ({ children }) => (
  <div className="ps-soon" data-testid="ps-coming-soon">
    <div className="ps-soon-mark" aria-hidden="true">✦</div>
    <p>{children}</p>
  </div>
);

const ShopStorefront = ({
  isOpen,
  onClose,
  shops,
  waresStore,
  items,
  runes,
  character,
  readOnly = false,
}) => {
  const list = Array.isArray(shops) ? shops : [];
  const [selectedId, setSelectedId] = useState(null);
  const [activeTab, setActiveTab] = useState('wares');
  const [selectedGroup, setSelectedGroup] = useState(null);

  const { myGold } = useBuyItems(character?.id);
  const catalogMap = useMemo(() => itemCatalogMap(items), [items]);
  const runeMap = useMemo(() => runeCatalogMap(runes), [runes]);

  // Open on the single shop directly, else on the picker; always reset transient
  // view state when (re)opened.
  useEffect(() => {
    if (!isOpen) return;
    setSelectedId(list.length === 1 ? list[0].id : null);
    setActiveTab('wares');
    setSelectedGroup(null);
    // list identity is stable per open; intentionally keyed on isOpen only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const selected = list.find((s) => s.id === selectedId) || null;

  const tabs = useMemo(() => {
    if (!selected) return [];
    return [
      'wares',
      ...(shopOffersSpellcasting(selected.id, waresStore) ? ['spellcasting'] : []),
      ...(shopOffersRunes(selected.id, waresStore) ? ['runes'] : []),
    ];
  }, [selected, waresStore]);

  const groups = useMemo(
    () => (selected ? groupWares(resolveShopWares(selected.id, waresStore, catalogMap, runeMap)) : []),
    [selected, waresStore, catalogMap, runeMap]
  );

  const closed = selected ? !isShopOpen(selected.id, waresStore) : false;

  // Escape backs out of the takeover, then closes the surface.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (selectedGroup) setSelectedGroup(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, selectedGroup, onClose]);

  if (!isOpen) return null;

  // The header back button returns to the picker when several shops share a
  // location, else it closes the surface.
  const back = () => {
    if (list.length > 1) {
      setSelectedId(null);
      setSelectedGroup(null);
      setActiveTab('wares');
    } else {
      onClose();
    }
  };

  const openShop = (id) => {
    setSelectedId(id);
    setActiveTab('wares');
    setSelectedGroup(null);
  };

  const keeper = selected ? waresStore?.[selected.id]?.keeper : '';

  return (
    <div className="ps-overlay" role="dialog" aria-modal="true" aria-label="Shop" data-testid="shop-storefront">
      <div className="ps-frame" style={{ '--ps-accent': TAB_ACCENT[activeTab] || TAB_ACCENT.wares }}>
        {!selected ? (
          <div className="ps-picker">
            <div className="ps-picker-head">
              <button type="button" className="ps-close" aria-label="Close" onClick={onClose}>✕</button>
              <h2>Shops here</h2>
            </div>
            {list.length === 0 ? (
              <p className="ps-empty">There are no shops here.</p>
            ) : (
              <ul className="ps-picker-list" aria-label="shops">
                {list.map((shop) => (
                  <li key={shop.id}>
                    <button
                      type="button"
                      className={`ps-picker-card${isShopOpen(shop.id, waresStore) ? '' : ' is-closed'}`}
                      onClick={() => openShop(shop.id)}
                    >
                      <span className="ps-picker-crest" aria-hidden="true">{firstLetter(shop.title)}</span>
                      <span className="ps-picker-info">
                        <span className="ps-picker-name">
                          {shop.title}
                          {!isShopOpen(shop.id, waresStore) && <span className="ps-picker-tag">Closed</span>}
                        </span>
                        {shop.summary && <span className="ps-picker-sum">{shop.summary}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            <header className="ps-header">
              <button type="button" className="ps-back" aria-label="Back" onClick={back}>‹</button>
              <span className="ps-crest" aria-hidden="true">{firstLetter(selected.title)}</span>
              <div className="ps-ident">
                <div className="ps-name">{selected.title}</div>
                {selected.kind && (
                  <div className="ps-metaline">
                    <span className="ps-kind">{selected.kind}</span>
                  </div>
                )}
              </div>
              {character && (
                <span className="ps-purse" data-testid="shop-purse">
                  {myGold} <span className="ps-purse-gp">gp</span>
                </span>
              )}
            </header>

            {keeper && (
              <p className="ps-keeper">
                <span className="ps-keeper-quote" aria-hidden="true">“</span>
                {keeper}
              </p>
            )}

            {readOnly && (
              <div className="ps-lorebanner" role="note" data-testid="ps-lore-banner">
                <span aria-hidden="true">📖</span> From your travels — recalled from a lore entry.
                You&rsquo;re not in town to trade right now.
              </div>
            )}

            {closed && (
              <div className="ps-closed" role="note" data-testid="shop-closed">
                {selected.title} isn&rsquo;t trading right now.
              </div>
            )}

            <nav className="ps-tabs" aria-label="shop sections">
              {tabs.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === t}
                  className={`ps-tab${activeTab === t ? ' is-on' : ''}`}
                  style={{ '--ps-tab-accent': TAB_ACCENT[t] }}
                  onClick={() => { setActiveTab(t); setSelectedGroup(null); }}
                >
                  <span className="ps-tab-label">{TAB_LABEL[t]}</span>
                  <span className="ps-tab-sub">{TAB_SUB[t]}</span>
                </button>
              ))}
            </nav>

            <div className="ps-body">
              {activeTab === 'wares' &&
                (groups.length === 0 ? (
                  <p className="ps-empty">This shop has nothing for sale right now.</p>
                ) : (
                  <WaresTab groups={groups} onSelect={setSelectedGroup} />
                ))}
              {activeTab === 'spellcasting' && (
                <ComingSoon>Scrolls, wands &amp; spellcasting services arrive in a coming update.</ComingSoon>
              )}
              {activeTab === 'runes' && (
                <ComingSoon>The runesmith&rsquo;s bench arrives in a coming update.</ComingSoon>
              )}
            </div>

            {selectedGroup && (
              <Takeover group={selectedGroup} readOnly={readOnly} onBack={() => setSelectedGroup(null)} />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ShopStorefront;
