import React, { useEffect, useMemo, useState } from 'react';
import { itemCatalogMap, runeCatalogMap } from '../../utils/contentUtils';
import {
  resolveShopWares,
  groupWares,
  traitAccent,
  isShopOpen,
  shopOffersSpellcasting,
  shopOffersRunes,
  spellItemOfferings,
  eligibleSpellItems,
} from '../../utils/shopUtils';
import { addToCart, setQty, removeLine, cartTotal, cartCount } from '../../utils/shopCart';
import { useBuyItems } from '../../hooks/useBuyItems';
import { DndProvider, useDraggable, DropZone } from '../inventory/dnd';
import './ShopStorefront.css';

// Player Shop redesign (#857). A full-screen, phone-shaped storefront that
// replaces the Modal-wrapped ShopModal window: header band · keeper line · lore
// banner (read-only) · computed tab bar · scrolling body · cart bar + pull-up
// tray. S3 (#860) shipped the shell + Wares browse; S4 (#861) adds the town cart
// (per-form add, drag-to-cart, pull-up tray, checkout via useBuyItems, toast).
// The Spellcasting (S5) and Runesmithing (S6/S7) tabs are still placeholders.
//
// Cart/buying render only in town (!readOnly). Until the storefront reaches
// feature parity (spells S5, runes S6/S7), in-town buying still goes through
// ShopModal — the DowntimeTab cut-over + ShopModal retirement land in S7. So no
// production entry point routes a buyer here yet; the town path is fully tested
// and is the seam S7 flips over.

const TAB_ACCENT = { wares: 'var(--ember-base)', spellcasting: 'var(--arcane-mid)', runes: 'var(--gold-mid)' };
const TAB_LABEL = { wares: 'Wares', spellcasting: 'Spells', runes: 'Runes' };
const TAB_SUB = { wares: 'goods', spellcasting: 'scrolls', runes: 'smithing' };

// The locked Spellcasting Services teaser (#857 S5) — display-only; hiring the
// keeper to cast/identify/restore is a future feature.
const SPELL_SERVICES = [
  { id: 'svc-cast', glyph: '✦', name: 'Cast a spell for you',
    desc: 'Hire the keeper to cast a spell from their repertoire on your behalf — buffs, divinations, or a door you can’t open.' },
  { id: 'svc-identify', glyph: '◈', name: 'Identify magic',
    desc: 'Leave an unknown item overnight and learn what it does, and how to wield it.' },
  { id: 'svc-restore', glyph: '✚', name: 'Restoration & remedies',
    desc: 'Pay to mend drained abilities, lift afflictions, or be raised after a very bad day.' },
];

const wareAccentVar = (group) => `var(--${traitAccent(group)}-mid)`;
const firstLetter = (s) => String(s || '?').trim().charAt(0).toUpperCase() || '?';
const formLabel = (form) => form.label || (form.level != null ? `Lvl ${form.level}` : form.name);
const atStockCap = (form, qty) => form.stock != null && qty >= form.stock;

const topTraits = (groups, limit = 8) => {
  const counts = new Map();
  groups.forEach((g) => (g.traits || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([t]) => t);
};

// Tile inner content, shared by the draggable (town) and static (read-only) tiles.
const TileInner = ({ group }) => (
  <>
    <span className="ps-tile-case" aria-hidden="true">{firstLetter(group.name)}</span>
    <span className="ps-tile-name">{group.name}</span>
    <span className="ps-tile-foot">
      <span className="ps-tile-price">{group.formCount > 1 ? `from ${group.from}` : group.from} gp</span>
      {group.formCount > 1 && <span className="ps-tile-forms">{group.formCount} forms</span>}
    </span>
  </>
);

// Town tile: drag to the cart bar (drops the cheapest form) or tap to preview.
const DraggableTile = ({ group, onSelect }) => {
  const { onPointerDown, onKeyDown } = useDraggable({ item: group, onTap: () => onSelect(group) });
  return (
    <button type="button" className="ps-tile-main" data-testid={`ware-${group.ref}`}
      onPointerDown={onPointerDown} onKeyDown={onKeyDown}>
      <TileInner group={group} />
    </button>
  );
};

// Read-only tile: tap to preview, no drag.
const StaticTile = ({ group, onSelect }) => (
  <button type="button" className="ps-tile-main" data-testid={`ware-${group.ref}`} onClick={() => onSelect(group)}>
    <TileInner group={group} />
  </button>
);

// The grouped grid, shared by the Wares and Spellcasting tabs. In town a
// single-form tile carries a quick + (or "×N in cart"); multi-form items add per
// form from the takeover preview.
const WareGrid = ({ groups, label, town, qtyByKey, onSelect, onAdd }) => (
  <ul className="ps-grid" aria-label={label}>
    {groups.map((g) => {
      const single = g.formCount === 1;
      const qty = single ? qtyByKey[g.forms[0].wareKey] || 0 : 0;
      return (
        <li key={g.ref} className="ps-tile">
          {town ? <DraggableTile group={g} onSelect={onSelect} /> : <StaticTile group={g} onSelect={onSelect} />}
          {town && single && (
            qty > 0 ? (
              <span className="ps-tile-incart" data-testid={`incart-${g.ref}`}>in cart ×{qty}</span>
            ) : (
              <button type="button" className="ps-tile-add" aria-label={`add ${g.name}`}
                disabled={atStockCap(g.forms[0], qty)} onClick={() => onAdd(g.forms[0])}>＋</button>
            )
          )}
        </li>
      );
    })}
  </ul>
);

// Wares tab: search + trait-chip filter over the grouped grid.
const WaresTab = ({ groups, town, qtyByKey, onSelect, onAdd }) => {
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
          <input type="text" aria-label="search wares" placeholder="Search the shelves…"
            value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {chips.length > 0 && (
          <div className="ps-chips" role="group" aria-label="trait filters">
            {chips.map((t) => (
              <button key={t} type="button" className={`ps-chip${trait === t ? ' is-on' : ''}`}
                aria-pressed={trait === t} onClick={() => setTrait((cur) => (cur === t ? null : t))}>
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="ps-empty">Nothing on the shelves matches.</p>
      ) : (
        <WareGrid groups={shown} label="wares" town={town} qtyByKey={qtyByKey} onSelect={onSelect} onAdd={onAdd} />
      )}
    </div>
  );
};

// Spellcasting tab (#857 S5): buyable Scrolls & Wands (the generative #812
// offerings expanded via eligibleSpellItems, grouped + searchable) above the
// locked "Spellcasting Services" teaser — display-only, a future feature.
const SpellcastingTab = ({ groups, town, qtyByKey, onSelect, onAdd }) => {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? groups.filter((g) => g.name.toLowerCase().includes(q)) : groups;
  }, [groups, query]);

  return (
    <div className="ps-spellcasting">
      <div className="ps-section">
        <span className="ps-section-label">Scrolls &amp; Wands</span>
        <span className="ps-section-count">{groups.length}</span>
      </div>
      {groups.length === 0 ? (
        <p className="ps-empty">The keeper scribes nothing to order right now.</p>
      ) : (
        <>
          <div className="ps-tools">
            <div className="ps-search">
              <span className="ps-search-ico" aria-hidden="true">⌕</span>
              <input type="text" aria-label="search scrolls and wands" placeholder="Search spells by name…"
                value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </div>
          {shown.length === 0 ? (
            <p className="ps-empty">No spells match that search.</p>
          ) : (
            <WareGrid groups={shown} label="scrolls and wands" town={town} qtyByKey={qtyByKey} onSelect={onSelect} onAdd={onAdd} />
          )}
        </>
      )}

      <div className="ps-section ps-section--svc">
        <span className="ps-section-label">Spellcasting Services</span>
        <span className="ps-soon-pill" aria-hidden="true">🔒 Soon</span>
      </div>
      <ul className="ps-svc-list" aria-label="spellcasting services">
        {SPELL_SERVICES.map((s) => (
          <li key={s.id} className="ps-svc">
            <span className="ps-svc-glyph" aria-hidden="true">{s.glyph}</span>
            <div className="ps-svc-body">
              <span className="ps-svc-name">{s.name}</span>
              <span className="ps-svc-desc">{s.desc}</span>
            </div>
          </li>
        ))}
      </ul>
      <p className="ps-svc-note">Hiring the keeper to cast for you is coming in a future update.</p>
    </div>
  );
};

// Takeover preview: per-form rows. In town each row adds that form (disabled at
// stock cap, "×N in cart" once added); read-only shows the not-here-to-buy note.
const Takeover = ({ group, town, qtyByKey, onAdd, onBack }) => {
  const head = group.forms[0];
  return (
    <div className="ps-takeover" data-testid="ware-preview">
      <button type="button" className="ps-takeover-back" onClick={onBack}>‹ Back</button>
      <div className="ps-preview" style={{ '--ps-ware-accent': wareAccentVar(group) }}>
        <div className="ps-preview-crest" aria-hidden="true">{firstLetter(group.name)}</div>
        <h2 className="ps-preview-name">{group.name}</h2>
        <div className="ps-preview-tags">
          {head.level != null && head.level > 0 && <span className="ps-preview-lvl">Level {head.level}</span>}
          {(group.traits || []).slice(0, 4).map((t) => <span key={t} className="ps-preview-trait">{t}</span>)}
        </div>
        {group.description && <p className="ps-preview-desc">{group.description}</p>}
        <ul className="ps-preview-forms" aria-label="forms">
          {group.forms.map((f) => {
            const qty = qtyByKey[f.wareKey] || 0;
            return (
              <li key={f.wareKey} className="ps-preview-form">
                <span className="ps-preview-form-label">{formLabel(f)}</span>
                <span className="ps-preview-form-price">{f.price} gp</span>
                {town && (
                  qty > 0 ? (
                    <span className="ps-preview-form-incart">in cart ×{qty}</span>
                  ) : (
                    <button type="button" className="ps-preview-form-add" aria-label={`add ${formLabel(f)}`}
                      disabled={atStockCap(f, qty)} onClick={() => onAdd(f)}>Add</button>
                  )
                )}
              </li>
            );
          })}
        </ul>
        {!town && (
          <p className="ps-preview-note" role="note">Recalled from a lore entry — not here to buy.</p>
        )}
      </div>
    </div>
  );
};

// Pull-up tray: ware lines (stepper + subtotal), total, purse-after, checkout.
const CartTray = ({ cart, gold, onSetQty, onRemove, onClear, onCheckout }) => {
  const total = cartTotal(cart);
  const after = gold - total;
  const empty = cart.length === 0;
  const over = total > gold;
  return (
    <div className="ps-tray" data-testid="cart-tray">
      <div className="ps-tray-head">
        <span className="ps-tray-title">Your cart</span>
        {!empty && <button type="button" className="ps-tray-clear" onClick={onClear}>Empty cart</button>}
      </div>
      {empty ? (
        <p className="ps-empty">Your cart is empty — drag wares here.</p>
      ) : (
        <ul className="ps-tray-lines" aria-label="cart lines">
          {cart.map((l) => (
            <li key={l.id} className="ps-tray-line">
              <span className="ps-tray-line-name">{l.name}</span>
              <span className="ps-tray-line-unit">{l.price} gp each</span>
              <span className="ps-tray-step">
                <button type="button" aria-label={`decrease ${l.name}`} onClick={() => (l.qty <= 1 ? onRemove(l.id) : onSetQty(l.id, l.qty - 1))}>–</button>
                <span className="ps-tray-step-val">{l.qty}</span>
                <button type="button" aria-label={`increase ${l.name}`}
                  disabled={l.stock != null && l.qty >= l.stock} onClick={() => onSetQty(l.id, l.qty + 1)}>+</button>
              </span>
              <span className="ps-tray-line-sub">{l.price * l.qty} gp</span>
            </li>
          ))}
        </ul>
      )}
      <div className="ps-tray-foot">
        <div className="ps-tray-total"><span>Total</span><span>{total} gp</span></div>
        <div className={`ps-tray-after${after < 0 ? ' is-over' : ''}`}>
          Purse after purchase: {after} gp
        </div>
        <button type="button" className="ps-checkout" data-testid="checkout"
          disabled={empty || over} onClick={onCheckout}>
          {empty ? 'Cart is empty' : over ? `Need ${total - gold} gp more` : `Check out · ${total} gp`}
        </button>
      </div>
    </div>
  );
};

const ComingSoon = ({ children }) => (
  <div className="ps-soon" data-testid="ps-coming-soon">
    <div className="ps-soon-mark" aria-hidden="true">✦</div>
    <p>{children}</p>
  </div>
);

const ShopStorefront = ({ isOpen, onClose, shops, waresStore, items, runes, spells, character, readOnly = false }) => {
  const list = Array.isArray(shops) ? shops : [];
  const [selectedId, setSelectedId] = useState(null);
  const [activeTab, setActiveTab] = useState('wares');
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const { myGold, buy } = useBuyItems(character?.id);
  const catalogMap = useMemo(() => itemCatalogMap(items), [items]);
  const runeMap = useMemo(() => runeCatalogMap(runes), [runes]);

  const resetView = () => { setActiveTab('wares'); setSelectedGroup(null); setCart([]); setCartOpen(false); setToast(null); };

  useEffect(() => {
    if (!isOpen) return;
    setSelectedId(list.length === 1 ? list[0].id : null);
    resetView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const selected = list.find((s) => s.id === selectedId) || null;
  const town = !readOnly;

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
  // Buyable scrolls/wands for the Spellcasting tab (#812 generative offerings
  // expanded + deduped by wareKey, then grouped like any ware).
  const spellGroups = useMemo(() => {
    if (!selected) return [];
    const seen = new Set();
    const out = [];
    spellItemOfferings(selected.id, waresStore).forEach((o) =>
      eligibleSpellItems(o, spells).forEach((it) => {
        if (seen.has(it.wareKey)) return;
        seen.add(it.wareKey);
        out.push(it);
      })
    );
    return groupWares(out);
  }, [selected, waresStore, spells]);

  // Every stocked form by wareKey (wares + scrolls/wands) — to resolve cart lines
  // back to full wares at checkout (a cart line only carries the wareKey/price/qty).
  const formsByKey = useMemo(() => {
    const m = new Map();
    [...groups, ...spellGroups].forEach((g) => g.forms.forEach((f) => m.set(f.wareKey, f)));
    return m;
  }, [groups, spellGroups]);
  const qtyByKey = useMemo(() => Object.fromEntries(cart.map((l) => [l.id, l.qty])), [cart]);

  const closed = selected ? !isShopOpen(selected.id, waresStore) : false;

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (selectedGroup) setSelectedGroup(null);
      else if (cartOpen) setCartOpen(false);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, selectedGroup, cartOpen, onClose]);

  // Toast auto-dismisses.
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3400);
    return () => clearTimeout(t);
  }, [toast]);

  if (!isOpen) return null;

  const back = () => {
    if (list.length > 1) { setSelectedId(null); resetView(); } else onClose();
  };
  const openShop = (id) => { setSelectedId(id); resetView(); };

  const addForm = (form) => { setCart((c) => addToCart(c, form)); setToast(null); };

  const checkout = () => {
    const purchases = cart.map((l) => ({ item: formsByKey.get(l.id), qty: l.qty })).filter((p) => p.item);
    const result = buy(purchases, selected?.title);
    if (result) {
      setCart([]);
      setCartOpen(false);
      setToast(`Bought ${result.count} item${result.count === 1 ? '' : 's'} for ${result.total} gp.`);
    }
  };

  const keeper = selected ? waresStore?.[selected.id]?.keeper : '';
  const showCart = town && !!selected && !closed;

  const body = (
    <div className="ps-body">
      {activeTab === 'wares' &&
        (groups.length === 0 ? (
          <p className="ps-empty">This shop has nothing for sale right now.</p>
        ) : (
          <WaresTab groups={groups} town={town} qtyByKey={qtyByKey} onSelect={setSelectedGroup} onAdd={addForm} />
        ))}
      {activeTab === 'spellcasting' && (
        <SpellcastingTab groups={spellGroups} town={town} qtyByKey={qtyByKey} onSelect={setSelectedGroup} onAdd={addForm} />
      )}
      {activeTab === 'runes' && (
        <ComingSoon>The runesmith&rsquo;s bench arrives in a coming update.</ComingSoon>
      )}
    </div>
  );

  const cartBar = showCart && (
    <DropZone id="ps-cart" accepts={() => true} onDrop={(g) => addForm(g.forms[0])} className="ps-cartbar">
      <button type="button" className="ps-cartbar-btn" data-testid="cart-bar" aria-expanded={cartOpen}
        onClick={() => setCartOpen((v) => !v)}>
        <span className="ps-cartbar-grip" aria-hidden="true">🛒
          {cartCount(cart) > 0 && <span className="ps-cartbar-badge">{cartCount(cart)}</span>}
        </span>
        <span className="ps-cartbar-mid">
          {cart.length === 0 ? (
            <span className="ps-cartbar-hint">Your cart is empty — drag wares here</span>
          ) : (
            <>
              <span className="ps-cartbar-hint">{cartCount(cart)} item{cartCount(cart) === 1 ? '' : 's'} · tap to review</span>
              <span className="ps-cartbar-total">{cartTotal(cart)} <span className="ps-cartbar-gp">gp</span></span>
            </>
          )}
        </span>
        <span className={`ps-cartbar-chev${cartOpen ? ' is-open' : ''}`} aria-hidden="true">⌃</span>
      </button>
    </DropZone>
  );

  return (
    <div className="ps-overlay" role="dialog" aria-modal="true" aria-label="Shop" data-testid="shop-storefront">
      <div className="ps-frame" style={{ '--ps-accent': TAB_ACCENT[activeTab] || TAB_ACCENT.wares }}>
        {toast && <div className="ps-toast" role="status" data-testid="shop-toast">✓ {toast}</div>}

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
                    <button type="button"
                      className={`ps-picker-card${isShopOpen(shop.id, waresStore) ? '' : ' is-closed'}`}
                      onClick={() => openShop(shop.id)}>
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
                {selected.kind && <div className="ps-metaline"><span className="ps-kind">{selected.kind}</span></div>}
              </div>
              {character && (
                <span className="ps-purse" data-testid="shop-purse">{myGold} <span className="ps-purse-gp">gp</span></span>
              )}
            </header>

            {keeper && (
              <p className="ps-keeper"><span className="ps-keeper-quote" aria-hidden="true">“</span>{keeper}</p>
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
                <button key={t} type="button" role="tab" aria-selected={activeTab === t}
                  className={`ps-tab${activeTab === t ? ' is-on' : ''}`} style={{ '--ps-tab-accent': TAB_ACCENT[t] }}
                  onClick={() => { setActiveTab(t); setSelectedGroup(null); }}>
                  <span className="ps-tab-label">{TAB_LABEL[t]}</span>
                  <span className="ps-tab-sub">{TAB_SUB[t]}</span>
                </button>
              ))}
            </nav>

            {showCart ? (
              <DndProvider renderGhost={(g) => <span className="ps-ghost">{g.name}</span>}>
                {body}
                {cartOpen && (
                  <CartTray cart={cart} gold={myGold}
                    onSetQty={(id, qty) => setCart((c) => setQty(c, id, qty))}
                    onRemove={(id) => setCart((c) => removeLine(c, id))}
                    onClear={() => setCart([])}
                    onCheckout={checkout} />
                )}
                {cartBar}
              </DndProvider>
            ) : (
              body
            )}

            {selectedGroup && (
              <Takeover group={selectedGroup} town={town} qtyByKey={qtyByKey} onAdd={addForm}
                onBack={() => setSelectedGroup(null)} />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ShopStorefront;
