import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  runeOfferings,
  eligibleRunes,
  eligibleHostItems,
  eligibleTalismans,
  eligibleCatalysts,
  eligibleWhetstones,
} from '../../utils/shopUtils';
import { resolveSaleWares } from '../../utils/saleShelf';
import { resolveRunestone } from '../../utils/runestone';
import { addToCart, setQty, removeLine, cartTotal, cartCount } from '../../utils/shopCart';
import { gearTarget, gearSockets, compatibleRunes, projectStagedGear, inEtchList } from '../../utils/runeSockets';
import { isRuneItem } from '../../utils/runeClassify';
import { STRIKING } from '../../utils/weaponRunes';
import { RESILIENT } from '../../utils/armorRunes';
import { formatAvailableAt } from '../../utils/gameTime';
import { useShopCheckout } from '../../hooks/useShopCheckout';
import { useCharacter } from '../../hooks/useCharacter';
import { DndProvider, useDraggable, DropZone } from '../inventory/dnd';
import ItemActivations from '../shared/ItemActivations';
import RuneMechanics from '../shared/RuneMechanics';
import SpellMechanics from '../spells/SpellMechanics';
import './ShopStorefront.css';

// Player Shop redesign (#857). The single full-screen, phone-shaped shop surface
// (it replaced the old Modal-wrapped ShopModal, retired in S7b): header band ·
// keeper line · lore banner (read-only) · computed tab bar · scrolling body ·
// cart bar + pull-up tray. Tabs: Wares (S3/S4), Spellcasting (S5), Runesmithing
// (S6/S7). Reached in-town from Downtime + a Location lore page (full: buy, cast,
// etch); out of town from a lore page it opens read-only.
//
// Cart/buying + rune staging render only in town (!readOnly).

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

// Ware crest: the item's R2 image when it has one (mirrors the inventory
// ItemModal art tile), else the typographic first-letter fallback (#881).
const WareCrest = ({ group, imgClass, caseClass }) =>
  group.image ? (
    <img
      className={imgClass}
      src={`/api/images/${group.image}`}
      alt=""
      aria-hidden="true"
      style={group.imagePosition ? { objectPosition: `${group.imagePosition.x}% ${group.imagePosition.y}%` } : undefined}
    />
  ) : (
    <span className={caseClass} aria-hidden="true">{firstLetter(group.name)}</span>
  );

// Tile inner content, shared by the draggable (town) and static (read-only)
// tiles. A Sale Shelf ware (#1137) wears a "Sale" ribbon and shows its full
// price struck through beside the discounted one.
const TileInner = ({ group }) => {
  const head = group.forms[0];
  const onSale = !!head.sale && head.saleFullPrice != null && head.saleFullPrice !== group.from;
  return (
    <>
      <WareCrest group={group} imgClass="ps-tile-img" caseClass="ps-tile-case" />
      {head.sale && <span className="ps-tile-sale" data-testid={`sale-badge-${group.ref}`}>Sale</span>}
      <span className="ps-tile-name">{group.name}</span>
      <span className="ps-tile-foot">
        <span className="ps-tile-price">
          {onSale && <span className="ps-tile-was">{head.saleFullPrice} gp</span>}
          {group.formCount > 1 ? `from ${group.from}` : group.from} gp
        </span>
        {group.formCount > 1 && <span className="ps-tile-forms">{group.formCount} forms</span>}
      </span>
    </>
  );
};

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

// The property/accessory rune DOCS a Sale Shelf rune item carries (#1138) — its
// `runes` block holds ids. Weapons/armor bake their runes into the derived name,
// but a ring keeps its graded base name, so its ring runes are otherwise
// invisible in the shop; resolve them all here so the preview can show what the
// player is actually buying. Fundamentals (potency/striking) are already in the
// name, so only property + accessory runes (the ones with real effects) surface.
const saleRuneDocs = (item, runeMap) => {
  if (!item || item.sale !== 'rune' || !item.runes || !runeMap) return [];
  const toDoc = (r) => (r && typeof r === 'object' ? r : runeMap.get(String(r)));
  const out = (Array.isArray(item.runes.property) ? item.runes.property : []).map(toDoc);
  if (item.runes.accessory != null) out.push(toDoc(item.runes.accessory));
  return out.filter(Boolean);
};

// Takeover preview: per-form rows. In town each row adds that form (disabled at
// stock cap, "×N in cart" once added); read-only shows the not-here-to-buy note.
const Takeover = ({ group, town, qtyByKey, spellMap, runeMap, onAdd, onBack }) => {
  const head = group.forms[0];
  const saleRunes = saleRuneDocs(head, runeMap);
  return (
    <div className="ps-takeover" data-testid="ware-preview">
      <button type="button" className="ps-takeover-back" onClick={onBack}>‹ Back</button>
      <div className="ps-preview" style={{ '--ps-ware-accent': wareAccentVar(group) }}>
        <WareCrest group={group} imgClass="ps-preview-img" caseClass="ps-preview-crest" />
        <h2 className="ps-preview-name">{group.name}</h2>
        <div className="ps-preview-tags">
          {head.level != null && head.level > 0 && <span className="ps-preview-lvl">Level {head.level}</span>}
          {(group.traits || []).slice(0, 4).map((t) => <span key={t} className="ps-preview-trait">{t}</span>)}
        </div>
        {/* A Scroll/Wand shows the whole embedded spell — traits, action cost,
            defense, range, area, targets, duration, degrees of success, and
            heightening — via the shared SpellMechanics (its description subsumes
            the plain ps-preview-desc). Other wares keep the description +
            ItemActivations, shared with the inventory ItemModal (#882). */}
        {head.spell ? (
          <SpellMechanics spell={head.spell} />
        ) : (
          <>
            {/* A runestone leads with the held rune's FULL effect — modifiers,
                riders, activations, what it etches onto (#800, #1055 S1) — the
                generic etching-stone description below never says what the
                rune actually does. */}
            {head.runestone && head.runestone.rune && (
              <div className="ps-preview-rune" data-testid="ware-preview-rune">
                <span className="ps-preview-rune-name">
                  {head.runestone.rune.name}
                  {head.runestone.rune.level != null && ` · Level ${head.runestone.rune.level}`}
                </span>
                <RuneMechanics rune={head.runestone.rune} />
              </div>
            )}
            {/* A Sale Shelf scroll pack (#1137) lists its four scrolls by name +
                rank — no full spell-mechanics (the Spellcasting tab covers that);
                its bundle description is subsumed by the list. */}
            {head.scrolls ? (
              <div className="ps-preview-pack" data-testid="ware-preview-pack">
                <span className="ps-preview-pack-label">A pack of four scrolls</span>
                <ul className="ps-preview-pack-list" aria-label="pack scrolls">
                  {head.scrolls.map((s, i) => (
                    <li key={`${s.spellRef}-${i}`} className="ps-preview-pack-scroll">
                      {(spellMap && spellMap.get(String(s.spellRef))?.name) || '(unknown spell)'}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              group.description && <p className="ps-preview-desc">{group.description}</p>
            )}
            {/* A Sale Shelf runed item (#1138): show the effect of each rune it
                carries. Essential for rings — their ring runes aren't in the
                graded name — and a nice bonus for runed weapons/armor. */}
            {saleRunes.length > 0 && (
              <div className="ps-preview-runes" data-testid="ware-preview-runes">
                <span className="ps-preview-runes-label">
                  Rune{saleRunes.length === 1 ? '' : 's'} on this item
                </span>
                <ul className="ps-preview-runes-list" aria-label="item runes">
                  {saleRunes.map((r) => (
                    <li key={r.id} className="ps-preview-rune">
                      <span className="ps-preview-rune-name">
                        {r.name}
                        {r.level != null && ` · Level ${r.level}`}
                      </span>
                      <RuneMechanics rune={r} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <ItemActivations item={head} />
          </>
        )}
        <ul className="ps-preview-forms" aria-label="forms">
          {group.forms.map((f) => {
            const qty = qtyByKey[f.wareKey] || 0;
            return (
              <li key={f.wareKey} className="ps-preview-form">
                <span className="ps-preview-form-label">{formLabel(f)}</span>
                <span className="ps-preview-form-price">
                  {f.sale && f.saleFullPrice != null && f.saleFullPrice !== f.price && (
                    <span className="ps-preview-form-was">{f.saleFullPrice} gp</span>
                  )}
                  {f.price} gp
                </span>
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

// Pull-up tray: ware lines (stepper + subtotal) + rune handoff lines (#878), one
// combined total, purse-after, and a single checkout that commits both.
const CartTray = ({ cart, handoffs, gold, onSetQty, onRemove, onClear, onUnstageGear, onCheckout }) => {
  const wareTotal = cartTotal(cart);
  const handoffTotal = handoffs.reduce((s, h) => s + h.cost, 0);
  const total = wareTotal + handoffTotal;
  const after = gold - total;
  const empty = cart.length === 0 && handoffs.length === 0;
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
          {handoffs.map((h) => (
            <li key={`handoff-${h.gear.uid}`} className="ps-tray-line ps-tray-line--handoff" data-testid={`handoff-line-${h.gear.uid}`}>
              <span className="ps-tray-line-name">
                <span className="ps-handoff-wrench" aria-hidden="true">⚒</span>{h.gear.name}
                <span className="ps-handoff-pill">🕐 24h handoff</span>
              </span>
              <span className="ps-tray-line-unit">{h.runes.map((r) => r.name).join(', ')}</span>
              <button type="button" className="ps-handoff-x" aria-label={`remove handoff ${h.gear.name}`} onClick={() => onUnstageGear(h.gear.uid)}>✕</button>
              <span className="ps-tray-line-sub">{h.cost} gp</span>
            </li>
          ))}
        </ul>
      )}
      <div className="ps-tray-foot">
        <div className="ps-tray-total"><span>Total</span><span>{total} gp</span></div>
        <div className={`ps-tray-after${after < 0 ? ' is-over' : ''}`}>
          Purse after purchase: {after} gp
        </div>
        {handoffs.length > 0 && (
          <p className="ps-tray-handoff-note">Checking out pays the smith and leaves your gear for 24h.</p>
        )}
        <button type="button" className="ps-checkout" data-testid="checkout"
          disabled={empty || over} onClick={onCheckout}>
          {empty ? 'Cart is empty' : over ? `Need ${total - gold} gp more` : `Check out · ${total} gp`}
        </button>
      </div>
    </div>
  );
};

// ── Runesmithing (#857 S6b) ──────────────────────────────────────────────────
const SOCKET_GLYPH = { potency: 'ᚠ', striking: 'ᛋ', resilient: 'ᛞ', property: '◇', accessory: '◈' };
const SOCKET_LABEL = { potency: 'Potency', striking: 'Striking', resilient: 'Resilient', property: 'Property', accessory: 'Accessory' };
// A socket's stable key within a gear card (fundamentals are singletons; a
// property socket is keyed by its index).
const socketKey = (s) => (s.type === 'property' ? `property:${s.index}` : s.type);
// What an already-equipped socket shows. Property and accessory sockets share
// the rune-ref lookup (both carry `s.rune`).
const filledLabel = (s, runeMap) => {
  if (s.type === 'potency') return `+${s.value}`;
  if (s.type === 'striking') return STRIKING[s.value]?.label || 'Striking';
  if (s.type === 'resilient') return RESILIENT[s.value]?.label || 'Resilient';
  const ref = typeof s.rune === 'string' ? s.rune : s.rune && s.rune.id;
  return runeMap.get(String(ref))?.name || 'Rune';
};

// One piece of gear with its rune sockets. Staging is local to the storefront
// (lifted to ShopStorefront); this card reads `stagedFor` (socketKey→rune) and a
// per-socket picker stages/un-stages. No gold moves and nothing is handed over
// until checkout (S7) — staged runes show here as a pending summary.
const GearCard = ({ gear, shopRunes, runeMap, stagedFor, keeperName, onStage, onUnstage, onConfigure, readOnly }) => {
  const [openKey, setOpenKey] = useState(null);
  // Which picker option's full effect is expanded (#1055 S1) — one at a time,
  // reset whenever a different socket's picker opens.
  const [infoKey, setInfoKey] = useState(null);
  useEffect(() => { setInfoKey(null); }, [openKey]);
  const target = gearTarget(gear);
  // Derive the socket board from a staged projection (#879): staged fundamentals
  // are applied first, so staging +1 potency reveals the property slot it unlocks
  // in the same visit.
  const projected = projectStagedGear(gear, stagedFor);
  const sockets = gearSockets(projected);
  const stagedEntries = Object.entries(stagedFor);
  const stagedIds = new Set(stagedEntries.map(([, r]) => r.id));
  const stagedCost = stagedEntries.reduce((sum, [, r]) => sum + (Number(r.price) || 0), 0);
  const openCount = sockets.filter((s) => !s.filled && !stagedFor[socketKey(s)]).length;
  // Runes (excluding what's already staged) that could fill/upgrade a socket.
  const optionsFor = (socketType) =>
    compatibleRunes(projected, socketType, shopRunes).filter((r) => !stagedIds.has(r.id));
  // A filled fundamental socket (potency/striking/resilient) can re-open for an
  // upgrade when a higher tier is in stock (#879) — potency +1→+2→+3 et al.
  const isUpgradable = (s) =>
    !readOnly && s.filled && s.type !== 'property' && optionsFor(s.type).length > 0;

  const openSocket = openKey ? sockets.find((s) => socketKey(s) === openKey) : null;
  const options = openSocket ? optionsFor(openSocket.type) : [];

  // An accessory-only host (a cloak, a shield — no gearTarget) is labelled by
  // its accessory slot; shields keep the armor icon, worn hosts get their own.
  const kind = target || 'accessory';
  const icon = target === 'armor' ? '🛡' : target === 'ring' ? '💍' : target === 'weapon' ? '⚔'
    : gear.shield ? '🛡' : '🧥';

  return (
    <div className="ps-gear" data-testid={`gear-${gear.uid}`}>
      <div className="ps-gear-head">
        <span className="ps-gear-icon" aria-hidden="true">{icon}</span>
        <div className="ps-gear-id">
          <div className="ps-gear-name">{gear.name}</div>
          <div className="ps-gear-sub">{openCount} open slot{openCount === 1 ? '' : 's'} · {kind}</div>
        </div>
      </div>
      <div className="ps-sockets" aria-label={`${gear.name} sockets`}>
        {sockets.map((s) => {
          const key = socketKey(s);
          const staged = stagedFor[key];
          const glyph = <span className="ps-socket-glyph" aria-hidden="true">{SOCKET_GLYPH[s.type]}</span>;
          if (staged) {
            return (
              <button key={key} type="button" className="ps-socket is-staged"
                aria-label={`un-stage ${staged.name}`} onClick={() => onUnstage(gear.uid, key)}>
                {glyph}<span className="ps-socket-name">{staged.name}</span><span className="ps-socket-x" aria-hidden="true">✕</span>
              </button>
            );
          }
          if (s.filled) {
            if (isUpgradable(s)) {
              return (
                <button key={key} type="button"
                  className={`ps-socket is-filled is-upgradable${openKey === key ? ' is-active' : ''}`}
                  aria-label={`upgrade ${SOCKET_LABEL[s.type]} on ${gear.name}`}
                  onClick={() => setOpenKey(openKey === key ? null : key)}>
                  {glyph}<span className="ps-socket-name">{filledLabel(s, runeMap)}</span>
                  <span className="ps-socket-up" aria-hidden="true">▲</span>
                </button>
              );
            }
            return (
              <div key={key} className="ps-socket is-filled">
                {glyph}<span className="ps-socket-name">{filledLabel(s, runeMap)}</span>
              </div>
            );
          }
          if (readOnly) {
            return <div key={key} className="ps-socket is-empty">{glyph}<span className="ps-socket-name">—</span></div>;
          }
          return (
            <button key={key} type="button"
              className={`ps-socket is-open${openKey === key ? ' is-active' : ''}`}
              aria-label={`fill ${SOCKET_LABEL[s.type]} slot on ${gear.name}`}
              onClick={() => setOpenKey(openKey === key ? null : key)}>
              {glyph}<span className="ps-socket-name">Tap to fill</span>
            </button>
          );
        })}
      </div>

      {openSocket && !readOnly && (
        <div className="ps-runepicker" data-testid={`picker-${gear.uid}`}>
          <div className="ps-runepicker-head">{SOCKET_LABEL[openSocket.type]} runes {keeperName ? `${keeperName} can etch` : 'available'}</div>
          {options.length === 0 ? (
            <p className="ps-empty">None in stock here for this slot.</p>
          ) : (
            <ul className="ps-runeopts" aria-label="rune options">
              {options.map((r) => {
                const optKey = r.wareKey || r.id;
                return (
                  <li key={optKey}>
                    <div className="ps-runeopt-row">
                      <button type="button" className="ps-runeopt" aria-label={`etch ${r.name}`}
                        onClick={() => {
                          // Etch-time choice defaults to the first option; the
                          // player can change it below before checkout. Dragon's
                          // Breath (#1059) picks a depicted dragon; a `choices`
                          // rune (Energy-Resistant, #1196 G3) picks a damage type.
                          let staging = r;
                          if (r.dragonChoice) {
                            staging = { ...r, etchConfig: { dragonType: r.dragonChoice.options?.[0]?.value } };
                          } else if (Array.isArray(r.choices) && r.choices.length) {
                            staging = { ...r, etchConfig: { choice: r.choices[0] } };
                          }
                          onStage(gear.uid, openKey, staging);
                          setOpenKey(null);
                        }}>
                        <span className="ps-runeopt-name">{r.name}</span>
                        <span className="ps-runeopt-price">{r.price} gp</span>
                      </button>
                      {/* Full effect on demand (#1055 S1) — you shouldn't have
                          to buy a rune to learn what it does. */}
                      <button type="button" className="ps-runeopt-info" aria-expanded={infoKey === optKey}
                        aria-label={`${r.name} details`}
                        onClick={() => setInfoKey(infoKey === optKey ? null : optKey)}>ⓘ</button>
                    </div>
                    {infoKey === optKey && (
                      <div className="ps-runeopt-detail" data-testid={`runeopt-detail-${r.id}`}>
                        <RuneMechanics rune={r} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <button type="button" className="ps-runepicker-cancel" onClick={() => setOpenKey(null)}>Cancel</button>
        </div>
      )}

      {/* Etch-time choice (#1059): a staged Dragon's Breath rune fixes its
          depicted dragon (damage type) at purchase. */}
      {!readOnly && stagedEntries
        .filter(([, r]) => r.dragonChoice)
        .map(([key, r]) => (
          <label key={`cfg-${key}`} className="ps-etch-choice" data-testid={`etch-choice-${gear.uid}`}>
            {r.name} — {r.dragonChoice.label || 'Depicted dragon'}:{' '}
            <select
              aria-label={`${r.name} ${r.dragonChoice.label || 'depicted dragon'}`}
              value={r.etchConfig?.dragonType ?? r.dragonChoice.options?.[0]?.value ?? ''}
              onChange={(e) => onConfigure(gear.uid, key, { dragonType: e.target.value })}
            >
              {(r.dragonChoice.options || []).map((o) => (
                <option key={o.value} value={o.value}>{o.label || o.value}</option>
              ))}
            </select>
          </label>
        ))}

      {/* Etch-time choice (#1196 G3): a staged `choices` rune (Energy-Resistant)
          fixes its damage type at purchase — the player-side mirror of the GM's
          rune-socket picker. */}
      {!readOnly && stagedEntries
        .filter(([, r]) => !r.dragonChoice && Array.isArray(r.choices) && r.choices.length)
        .map(([key, r]) => (
          <label key={`cfg-${key}`} className="ps-etch-choice" data-testid={`etch-choice-${gear.uid}`}>
            {r.name} — type:{' '}
            <select
              aria-label={`${r.name} type`}
              value={r.etchConfig?.choice ?? r.choices[0]}
              onChange={(e) => onConfigure(gear.uid, key, { choice: e.target.value })}
            >
              {r.choices.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        ))}

      {stagedEntries.length > 0 && (
        <p className="ps-staged-note" data-testid={`staged-${gear.uid}`}>
          🕐 <strong>{stagedEntries.length} rune{stagedEntries.length === 1 ? '' : 's'}</strong> staged ·{' '}
          <strong>{stagedCost} gp</strong> — {keeperName || 'the smith'} keeps your {gear.name} for 24h once you check out.
        </p>
      )}
    </div>
  );
};

// A piece of gear already at the smith (#857 S7a) — rendered from a pending work
// order (the gear itself has been pulled from inventory), until it's collected
// in Downtime. Gold-tinted ticket with the etch list, what was paid, and when
// it's ready.
const BenchedTicket = ({ order, nowSeconds }) => (
  <div className="ps-bench" data-testid={`bench-${order.id}`}>
    <span className="ps-bench-stamp" aria-hidden="true">⚒</span>
    <div className="ps-bench-body">
      <div className="ps-bench-name">{order.weaponName}</div>
      <div className="ps-bench-etch">Etching {order.runeName}</div>
      <div className="ps-bench-paid">At the smith. Paid {order.price} gp.</div>
    </div>
    <div className="ps-bench-ready">Ready<br /><strong>{formatAvailableAt(order.readyAtSeconds, nowSeconds)}</strong></div>
  </div>
);

// Runesmithing tab: stage runes into gear sockets (they appear as handoff lines
// in the cart, committed at checkout, #878) + buy loose runestones. Shown when
// the shop offersRunes (S1).
const RunesmithingTab = ({
  gearList, shopRunes, runeMap, runeGroups, stagedFor, keeperName, town, qtyByKey,
  onStage, onUnstage, onConfigure, onSelect, onAdd, readOnly, orders, nowSeconds,
}) => {
  const benched = (Array.isArray(orders) ? orders : []);
  return (
    <div className="ps-runesmithing">
      <p className="ps-rs-intro">
        {town
          ? `Stage runes into your gear's open slots, then hand it over — it's yours again 24 hours later.`
          : `Recalled from a lore entry — visit in town to have your gear etched.`}
      </p>
      <div className="ps-section"><span className="ps-section-label">Your Gear</span></div>
      {gearList.length === 0 && benched.length === 0 ? (
        <p className="ps-empty">{town ? 'No gear to etch.' : '—'}</p>
      ) : (
        <div className="ps-gear-list">
          {gearList.map((g) => (
            <GearCard key={g.uid} gear={g} shopRunes={shopRunes} runeMap={runeMap}
              stagedFor={stagedFor(g.uid)} keeperName={keeperName}
              onStage={onStage} onUnstage={onUnstage} onConfigure={onConfigure} readOnly={readOnly} />
          ))}
          {benched.map((o) => <BenchedTicket key={o.id} order={o} nowSeconds={nowSeconds} />)}
        </div>
      )}
      <div className="ps-section ps-section--svc">
        <span className="ps-section-label">Runes for sale</span>
        <span className="ps-section-count">{runeGroups.length}</span>
      </div>
      {runeGroups.length === 0 ? (
        <p className="ps-empty">No runes for sale.</p>
      ) : (
        <WareGrid groups={runeGroups} label="runes for sale" town={town} qtyByKey={qtyByKey} onSelect={onSelect} onAdd={onAdd} />
      )}
    </div>
  );
};

const ShopStorefront = ({ isOpen, onClose, shops, waresStore, items, runes, spells, character, readOnly = false }) => {
  const list = Array.isArray(shops) ? shops : [];
  const [selectedId, setSelectedId] = useState(null);
  const [activeTab, setActiveTab] = useState('wares');
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState(null);
  // Runesmithing staging (#857 S6b): a flat `${gearUid}::${socketKey}` → rune map
  // of runes staged into sockets. Nothing is paid or handed over until checkout
  // (S7) — this is the pending state the gear cards render.
  const [staged, setStaged] = useState({});

  const { myGold, orders, nowSeconds, checkout: commitCheckout } = useShopCheckout(character?.id);
  const charData = useCharacter(character);
  const catalogMap = useMemo(() => itemCatalogMap(items), [items]);
  const runeMap = useMemo(() => runeCatalogMap(runes), [runes]);

  const resetView = () => { setActiveTab('wares'); setSelectedGroup(null); setCart([]); setCartOpen(false); setToast(null); setStaged({}); };

  useEffect(() => {
    if (!isOpen) return;
    setSelectedId(list.length === 1 ? list[0].id : null);
    resetView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const selected = list.find((s) => s.id === selectedId) || null;
  const town = !readOnly;

  // Resolve once, then split: general wares (Wares tab) vs RUNES — runestones and
  // rune item entries (armor/weapon potency, resilient, striking, slick, …) —
  // which both move to the Runesmithing tab's "Runes for sale" (#883, was S6b's
  // runestone-only split). A rune is a `{ref:'runestone'}` resolved ware OR a
  // rune item entry (isRuneItem); the canonical signal from #885.
  const resolved = useMemo(
    () => (selected ? resolveShopWares(selected.id, waresStore, catalogMap, runeMap) : []),
    [selected, waresStore, catalogMap, runeMap]
  );
  const runeIds = useMemo(() => new Set(runeMap.keys()), [runeMap]);
  const isRuneWare = useCallback((w) => !!w.runestone || isRuneItem(w, runeIds), [runeIds]);
  // Base gear implied by SPECIFIC-target rune services (#1044), expanded into
  // virtual Wares like the generative runestones/scrolls — nothing is written
  // into the stored wares. Hand-stocked wares win (deduped by item id), and a
  // general runesmith (no explicit target list) expands to nothing.
  const hostWares = useMemo(() => {
    if (!selected) return [];
    const stocked = new Set(resolved.map((w) => String(w.id)));
    const seen = new Set();
    const out = [];
    runeOfferings(selected.id, waresStore).forEach((o) =>
      eligibleHostItems(o, items, runes).forEach((item) => {
        const id = String(item.id);
        if (stocked.has(id) || seen.has(id)) return;
        seen.add(id);
        out.push({ ...(catalogMap.get(id) || item), wareKey: `host:${id}` });
      })
    );
    return out;
  }, [selected, waresStore, resolved, items, runes, catalogMap]);
  // Affix-to-gear talismans implied by SPECIFIC-target rune services (#1211) —
  // a shield-rune smith also stocks shield talismans, up to the shield cap. Each
  // grade is its own virtual ware; hand-stocked forms win (deduped by item id).
  const talismanWares = useMemo(() => {
    if (!selected) return [];
    const stocked = new Set(resolved.map((w) => String(w.id)));
    const seen = new Set();
    const out = [];
    runeOfferings(selected.id, waresStore).forEach((o) =>
      eligibleTalismans(o, items).forEach((ware) => {
        if (stocked.has(String(ware.id)) || seen.has(ware.wareKey)) return;
        seen.add(ware.wareKey);
        out.push(ware);
      })
    );
    return out;
  }, [selected, waresStore, resolved, items]);
  // Whetstones auto-carried by any WEAPON-runesmithing shop (#1212) — including
  // the general runesmith — up to the weapon target's rune level cap, expanded
  // from the catalog like the talisman wares. Hand-stocked whetstones win
  // (deduped by item id).
  const whetstoneWares = useMemo(() => {
    if (!selected) return [];
    const stocked = new Set(resolved.map((w) => String(w.id)));
    const seen = new Set();
    const out = [];
    runeOfferings(selected.id, waresStore).forEach((o) =>
      eligibleWhetstones(o, items).forEach((ware) => {
        if (stocked.has(String(ware.id)) || seen.has(ware.wareKey)) return;
        seen.add(ware.wareKey);
        out.push(ware);
      })
    );
    return out;
  }, [selected, waresStore, resolved, items]);
  // GM-rolled Sale Shelf wares (#1137): one-of-a-kind discounted goods baked into
  // the shop entry (S1 engine). They LEAD the Wares grid — the deal is the draw —
  // each a distinct id so groupWares keeps it a single-form group, capped at its
  // stock:1 by the existing cart logic. Live in Wares, never the service tabs.
  const saleWares = useMemo(
    () => (selected ? resolveSaleWares(selected.id, waresStore, catalogMap, runeMap, spells) : []),
    [selected, waresStore, catalogMap, runeMap, spells]
  );
  // Catalysts auto-carried by a Spellcasting-Services shop (#1209 M3c): every
  // catalyst whose augmented spell is inside the shop's scroll/wand envelope,
  // expanded from the catalog like the rune-service host/talisman wares — nothing
  // written to stored wares. Hand-stocked catalysts win (deduped by item id).
  const catalystWares = useMemo(() => {
    if (!selected) return [];
    const stocked = new Set(resolved.map((w) => String(w.id)));
    return eligibleCatalysts(selected.id, waresStore, spells, items, catalogMap)
      .filter((w) => !stocked.has(String(w.id)));
  }, [selected, waresStore, spells, items, catalogMap, resolved]);
  const wareGroups = useMemo(
    () => groupWares([...saleWares, ...resolved.filter((w) => !isRuneWare(w)), ...hostWares, ...talismanWares, ...whetstoneWares, ...catalystWares]),
    [saleWares, resolved, isRuneWare, hostWares, talismanWares, whetstoneWares, catalystWares]
  );
  // Spell docs by id — for the scroll-pack preview card (names + rank, #1137).
  const spellMap = useMemo(
    () => new Map((Array.isArray(spells) ? spells : []).map((s) => [String(s.id), s])),
    [spells]
  );
  // Rune wares for the Runesmithing tab = hand-stocked runes (resolved) PLUS the
  // generative rune-service offerings (#982 G3) expanded into runestones and
  // resolved like any other ware. A hand-stocked rune stays an escape hatch (a
  // custom price, or a rune outside the offering's target·level·rarity window);
  // when both cover the same rune the hand-stocked one wins (deduped by rune id).
  const runeWares = useMemo(() => {
    const handStocked = resolved.filter(isRuneWare);
    if (!selected) return handStocked;
    const stockedIds = new Set(
      handStocked.map((w) => (w.runestone ? String(w.runestone.runeRef) : String(w.id)))
    );
    const seen = new Set();
    const generated = [];
    runeOfferings(selected.id, waresStore).forEach((o) =>
      eligibleRunes(o, runes).forEach((spec) => {
        const rid = String(spec.runeRef);
        if (stockedIds.has(rid) || seen.has(rid)) return;
        seen.add(rid);
        const item = resolveRunestone(spec, runeMap);
        item.wareKey = spec.wareKey;
        generated.push(item);
      })
    );
    return [...handStocked, ...generated];
  }, [resolved, isRuneWare, selected, waresStore, runes, runeMap]);
  const runeGroups = useMemo(() => groupWares(runeWares), [runeWares]);

  // Tab set: Wares always; Spellcasting when the shop offers it (S1); Runesmithing
  // when it offers runes OR simply stocks any (so rune wares always have a home,
  // #883 — they're filtered out of Wares above).
  const tabs = useMemo(() => {
    if (!selected) return [];
    return [
      'wares',
      ...(shopOffersSpellcasting(selected.id, waresStore) ? ['spellcasting'] : []),
      ...(shopOffersRunes(selected.id, waresStore) || runeGroups.length > 0 ? ['runes'] : []),
    ];
  }, [selected, waresStore, runeGroups]);
  // Rune docs the shop stocks (with the runestone's price), for the socket picker
  // — hand-stocked + generated (#982 G3), off the same combined runeWares list.
  const shopRunes = useMemo(
    () => runeWares.filter((w) => w.runestone && w.runestone.rune)
      .map((w) => ({ ...w.runestone.rune, price: w.price, wareKey: w.wareKey })),
    [runeWares]
  );
  // The active character's runesmithable gear (weapons, armor, and power rings —
  // gearTarget → 'ring', #967 R4/R5), for the sockets. Ring imbue reuses this
  // shop flow: the socket board, staging, checkout, work order, and collect are
  // all target-generic, so a power ring hands off and etches like any gear.
  // Accessory hosts join the list (#1033 S5) via inEtchList: target gear always,
  // accessory-ONLY hosts (cloaks, boots, shields) only when this shop stocks a
  // rune they could take — so trinkets don't flood the board.
  const gearList = useMemo(
    () => (Array.isArray(charData?.inventory) ? charData.inventory.filter((it) => inEtchList(it, shopRunes)) : []),
    [charData, shopRunes]
  );
  // Buyable scrolls/wands for the Spellcasting tab (#812 generative offerings
  // expanded + deduped by wareKey, then grouped like any ware).
  const spellGroups = useMemo(() => {
    if (!selected) return [];
    const seen = new Set();
    const out = [];
    spellItemOfferings(selected.id, waresStore).forEach((o) =>
      eligibleSpellItems(o, spells, catalogMap).forEach((it) => {
        if (seen.has(it.wareKey)) return;
        seen.add(it.wareKey);
        out.push(it);
      })
    );
    return groupWares(out);
  }, [selected, waresStore, spells, catalogMap]);

  // Every stocked form by wareKey (wares + scrolls/wands) — to resolve cart lines
  // back to full wares at checkout (a cart line only carries the wareKey/price/qty).
  const formsByKey = useMemo(() => {
    const m = new Map();
    [...wareGroups, ...spellGroups, ...runeGroups].forEach((g) => g.forms.forEach((f) => m.set(f.wareKey, f)));
    return m;
  }, [wareGroups, spellGroups, runeGroups]);
  const qtyByKey = useMemo(() => Object.fromEntries(cart.map((l) => [l.id, l.qty])), [cart]);

  // Staged runes grouped per gear → handoff cart lines (#878): { gear, runes, cost }.
  const stagedHandoffs = useMemo(() => {
    const byGear = {};
    Object.entries(staged).forEach(([k, rune]) => {
      const uid = k.slice(0, k.indexOf('::'));
      (byGear[uid] = byGear[uid] || []).push(rune);
    });
    return Object.entries(byGear)
      .map(([uid, r]) => ({ gear: gearList.find((g) => String(g.uid) === uid), runes: r, cost: r.reduce((x, rune) => x + (Number(rune.price) || 0), 0) }))
      .filter((h) => h.gear);
  }, [staged, gearList]);

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

  // Stage / un-stage a rune into a gear socket (pending until checkout, S7).
  const stageRune = (gearUid, sKey, rune) =>
    setStaged((s) => ({ ...s, [`${gearUid}::${sKey}`]: rune }));
  const unstageRune = (gearUid, sKey) =>
    setStaged((s) => { const next = { ...s }; delete next[`${gearUid}::${sKey}`]; return next; });
  // Patch a staged rune's etch-time config (#1059) — the depicted dragon type on
  // a Dragon's Breath rune, chosen before checkout. Baked onto the gear entry
  // when the order is collected (applyRune).
  const configureStagedRune = (gearUid, sKey, patch) =>
    setStaged((s) => {
      const k = `${gearUid}::${sKey}`;
      return s[k] ? { ...s, [k]: { ...s[k], etchConfig: { ...s[k].etchConfig, ...patch } } } : s;
    });
  // Remove a whole gear's staging (the handoff cart line's ✕).
  const unstageGear = (gearUid) =>
    setStaged((s) => Object.fromEntries(Object.entries(s).filter(([k]) => !k.startsWith(`${gearUid}::`))));
  // The socketKey→rune map staged on one gear.
  const stagedFor = (gearUid) => {
    const prefix = `${gearUid}::`;
    return Object.fromEntries(
      Object.entries(staged).filter(([k]) => k.startsWith(prefix)).map(([k, r]) => [k.slice(prefix.length), r])
    );
  };

  // One checkout commits wares + rune handoffs together (#878) through the single
  // useShopCheckout transaction — debits gold once, credits wares, records the
  // work orders, pulls the handed-over gear.
  const checkout = () => {
    const purchases = cart.map((l) => ({ item: formsByKey.get(l.id), qty: l.qty })).filter((p) => p.item);
    const result = commitCheckout({ purchases, handoffs: stagedHandoffs, shopTitle: selected?.title, loreId: selected?.id });
    // A Sale Shelf deal bought out from under you (#1138) — reject, keep the cart.
    if (result && result.rejected === 'stale-shelf') {
      setToast('That deal is gone — someone grabbed it first. Refresh your cart.');
      return;
    }
    if (result) {
      setCart([]);
      setStaged({});
      setCartOpen(false);
      const bits = [];
      if (result.wareCount) bits.push(`${result.wareCount} item${result.wareCount === 1 ? '' : 's'}`);
      if (result.handoffCount) bits.push(`${result.handoffCount} handoff${result.handoffCount === 1 ? '' : 's'}`);
      setToast(`Checked out ${bits.join(' + ')} for ${result.total} gp.`);
    }
  };

  const keeper = selected ? waresStore?.[selected.id]?.keeper : '';
  const showCart = town && !!selected && !closed;

  const body = (
    <div className="ps-body">
      {activeTab === 'wares' &&
        (wareGroups.length === 0 ? (
          <p className="ps-empty">This shop has nothing for sale right now.</p>
        ) : (
          <WaresTab groups={wareGroups} town={town} qtyByKey={qtyByKey} onSelect={setSelectedGroup} onAdd={addForm} />
        ))}
      {activeTab === 'spellcasting' && (
        <SpellcastingTab groups={spellGroups} town={town} qtyByKey={qtyByKey} onSelect={setSelectedGroup} onAdd={addForm} />
      )}
      {activeTab === 'runes' && (
        <RunesmithingTab
          gearList={gearList}
          shopRunes={shopRunes}
          runeMap={runeMap}
          runeGroups={runeGroups}
          stagedFor={stagedFor}
          keeperName={null}
          town={town}
          qtyByKey={qtyByKey}
          onStage={stageRune}
          onUnstage={unstageRune}
          onConfigure={configureStagedRune}
          onSelect={setSelectedGroup}
          onAdd={addForm}
          readOnly={readOnly}
          orders={orders}
          nowSeconds={nowSeconds}
        />
      )}
    </div>
  );

  // Cart bar count/total span wares + rune handoffs (#878).
  const barCount = cartCount(cart) + stagedHandoffs.length;
  const barTotal = cartTotal(cart) + stagedHandoffs.reduce((s, h) => s + h.cost, 0);

  const cartBar = showCart && (
    <DropZone id="ps-cart" accepts={() => true} onDrop={(g) => addForm(g.forms[0])} className="ps-cartbar">
      <button type="button" className="ps-cartbar-btn" data-testid="cart-bar" aria-expanded={cartOpen}
        onClick={() => setCartOpen((v) => !v)}>
        <span className="ps-cartbar-grip" aria-hidden="true">🛒
          {barCount > 0 && <span className="ps-cartbar-badge">{barCount}</span>}
        </span>
        <span className="ps-cartbar-mid">
          {barCount === 0 ? (
            <span className="ps-cartbar-hint">Your cart is empty — drag wares here</span>
          ) : (
            <>
              <span className="ps-cartbar-hint">{barCount} item{barCount === 1 ? '' : 's'} · tap to review</span>
              <span className="ps-cartbar-total">{barTotal} <span className="ps-cartbar-gp">gp</span></span>
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
                  <CartTray cart={cart} handoffs={stagedHandoffs} gold={myGold}
                    onSetQty={(id, qty) => setCart((c) => setQty(c, id, qty))}
                    onRemove={(id) => setCart((c) => removeLine(c, id))}
                    onClear={() => { setCart([]); setStaged({}); }}
                    onUnstageGear={unstageGear}
                    onCheckout={checkout} />
                )}
                {cartBar}
              </DndProvider>
            ) : (
              body
            )}

            {selectedGroup && (
              <Takeover group={selectedGroup} town={town} qtyByKey={qtyByKey} spellMap={spellMap} runeMap={runeMap} onAdd={addForm}
                onBack={() => setSelectedGroup(null)} />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ShopStorefront;
