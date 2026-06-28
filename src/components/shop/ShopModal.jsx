import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../shared/Modal';
import ItemModal from '../inventory/ItemModal';
import { DndProvider, useDraggable, DropZone } from '../inventory/dnd';
import { itemCatalogMap, runeCatalogMap } from '../../utils/contentUtils';
import {
  resolveShopWares,
  isShopOpen,
  spellItemOfferings,
  spellOfferingSummary,
  eligibleSpellItems,
} from '../../utils/shopUtils';
import { getItemRarity } from '../../utils/InventoryUtils';
import { addToCart, setQty, removeLine } from '../../utils/shopCart';
import { useBuyItems } from '../../hooks/useBuyItems';
import { useRuneWork } from '../../hooks/useRuneWork';
import { useCharacter } from '../../hooks/useCharacter';
import { eligibleWeapons } from '../../utils/runeWorkOrder';
import { freePropertySlots, propertySlotCapacity, usedPropertySlots } from '../../utils/weaponRunes';
import ShopCart from './ShopCart';
import './ShopModal.css';

// A draggable ware tile: tap (or Enter) inspects it; dragging drops it into the
// cart zone. Mirrors the inventory GridCell so the loadout DnD primitives carry
// over verbatim.
const WareTile = ({ ware, onInspect }) => {
  const { onPointerDown, onKeyDown } = useDraggable({ item: ware, onTap: onInspect });
  return (
    <button
      type="button"
      className="shop-ware"
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      data-testid={`ware-${ware.wareKey}`}
    >
      <span className="shop-ware-name">{ware.name}</span>
      <span className="shop-ware-meta">
        <span className="shop-ware-price">{ware.price} gp</span>
        {ware.stock != null && <span className="shop-ware-stock">{ware.stock} in stock</span>}
      </span>
    </button>
  );
};

const ALL_TRADITIONS = ['arcane', 'divine', 'occult', 'primal'];
const ALL_RARITIES = ['common', 'uncommon', 'rare'];

// The interactive spell-counter picker (#812 S9) for one generative offering. A
// shop can stock Scrolls/Wands of hundreds of spells, so this is a searchable,
// filterable list over `eligibleSpellItems(offering, spells)` (S6) — not one tile
// per spell. Each row resolves to a buyable scroll/wand (derived name/level/
// price/rarity); `onAdd` drops it into the shared cart, `onInspect` opens the
// detail modal. The rank/tradition/rarity filters are scoped to what the offering
// actually covers (options derived from the eligible set, not the whole catalog).
const SpellPicker = ({ offering, spells, readOnly, onInspect, onAdd }) => {
  const [query, setQuery] = useState('');
  const [rankF, setRankF] = useState('');
  const [tradF, setTradF] = useState('');
  const [rarF, setRarF] = useState('');

  const kind = offering.spellItem === 'wand' ? 'wand' : 'scroll';
  const rows = useMemo(() => {
    const byId = new Map((Array.isArray(spells) ? spells : []).map((s) => [String(s.id), s]));
    return eligibleSpellItems(offering, spells).map((item) => {
      const spell = byId.get(String(item[kind]?.spellRef));
      return {
        item,
        rank: spell && spell.level != null ? spell.level : item.level,
        traditions: (spell?.traditions || []).map((t) => String(t).toLowerCase()),
        rarity: String(getItemRarity(item) || 'Common'),
      };
    });
  }, [offering, spells, kind]);

  const ranks = useMemo(() => [...new Set(rows.map((r) => r.rank))].sort((a, b) => a - b), [rows]);
  const trads = useMemo(() => ALL_TRADITIONS.filter((t) => rows.some((r) => r.traditions.includes(t))), [rows]);
  const rars = useMemo(() => ALL_RARITIES.filter((rr) => rows.some((r) => r.rarity.toLowerCase() === rr)), [rows]);

  const q = query.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (q && !r.item.name.toLowerCase().includes(q)) return false;
    if (rankF && r.rank !== Number(rankF)) return false;
    if (tradF && !r.traditions.includes(tradF)) return false;
    if (rarF && r.rarity.toLowerCase() !== rarF) return false;
    return true;
  });

  return (
    <div className="shop-spell-picker" data-testid="shop-spell-picker">
      <div className="shop-picker-controls">
        <input
          type="text"
          className="shop-picker-search"
          aria-label="spell search"
          placeholder={`Search ${rows.length} spells by name…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {ranks.length > 1 && (
          <select aria-label="filter rank" value={rankF} onChange={(e) => setRankF(e.target.value)}>
            <option value="">Any rank</option>
            {ranks.map((r) => (
              <option key={r} value={String(r)}>
                Rank {r}
              </option>
            ))}
          </select>
        )}
        {trads.length > 1 && (
          <select aria-label="filter tradition" value={tradF} onChange={(e) => setTradF(e.target.value)}>
            <option value="">Any tradition</option>
            {trads.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        {rars.length > 1 && (
          <select aria-label="filter rarity" value={rarF} onChange={(e) => setRarF(e.target.value)}>
            <option value="">Any rarity</option>
            {rars.map((rr) => (
              <option key={rr} value={rr}>
                {rr}
              </option>
            ))}
          </select>
        )}
      </div>

      <ul className="shop-picker-list" aria-label="spell options">
        {filtered.length === 0 ? (
          <li className="shop-empty">No spells match that search.</li>
        ) : (
          filtered.map((r) => (
            <li key={r.item.wareKey} className="shop-picker-row" data-testid={`pick-${r.item.wareKey}`}>
              <button
                type="button"
                className="shop-picker-info"
                onClick={() => onInspect(r.item)}
              >
                <span className="shop-picker-name">{r.item.name}</span>
                <span className="shop-picker-meta">
                  <span className="shop-picker-lvl">L{r.item.level}</span>
                  <span className="shop-picker-price">{r.item.price} gp</span>
                  <span className={`shop-picker-rarity is-${r.rarity.toLowerCase()}`}>{r.rarity}</span>
                </span>
              </button>
              {!readOnly && (
                <button
                  type="button"
                  className="shop-ware-add"
                  aria-label={`add ${r.item.wareKey}`}
                  onClick={() => onAdd(r.item)}
                >
                  ＋ Add
                </button>
              )}
            </li>
          ))
        )}
      </ul>
    </div>
  );
};

// Shop browser (#696 S3–S5). Carousel of the current location's shops → a shop
// window listing wares with a drag-to-cart buy basket. `shops` is the resolved
// list of shop lore entries; `waresStore` is the raw cnmh_shops_global. Clicking
// a ware opens the read-only inventory ItemModal. The cart is local state; the
// purchase itself (gold debit + acquired credit, #696 S6) runs through
// useBuyItems on Confirm, leaving a receipt behind.
// `readOnly` lets a shop be browsed without buying — e.g. opened from a Location
// lore page when the party isn't in that town (#shops-from-lore). Wares + the
// item detail still render; the Add/Etch affordances and the cart are hidden.
const ShopModal = ({ isOpen, onClose, shops, waresStore, items, runes, spells, character, characterColor, readOnly = false }) => {
  const [selectedId, setSelectedId] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [cart, setCart] = useState([]);
  const [receipt, setReceipt] = useState(null);
  // The rune ware currently being etched onto a weapon (#802), or null.
  const [etchWare, setEtchWare] = useState(null);
  // Which body tab is showing: 'wares' (flat items/runestones) or 'spells' (the
  // generative scroll/wand offerings, #820). Only meaningful when the shop has a
  // spell-item offering; otherwise the tab chrome is hidden entirely.
  const [tab, setTab] = useState('wares');
  // The offering whose spell-counter picker is open (#812 S9), or null (the
  // offering list). Spell items picked here aren't in `wares`, so the ones added
  // to the cart are stashed by wareKey for handleConfirm to resolve.
  const [pickerOffering, setPickerOffering] = useState(null);
  const [pickedByKey, setPickedByKey] = useState({});

  const { myGold, buy } = useBuyItems(character?.id);
  const { etch } = useRuneWork(character?.id);
  const charData = useCharacter(character);
  const catalogMap = useMemo(() => itemCatalogMap(items), [items]);
  const runeMap = useMemo(() => runeCatalogMap(runes), [runes]);
  const weapons = useMemo(() => eligibleWeapons(charData?.inventory), [charData]);
  // Etching adds a property rune, which needs a free potency-gated slot (#607,
  // #804). A full or potency-0 weapon can't be etched at the shop — the player
  // is steered to buy the Runestone and move it on with a Crafting check (R4),
  // where the replace flow lives.
  const etchable = useMemo(() => weapons.filter((w) => freePropertySlots(w) >= 1), [weapons]);

  // Always reopen on the carousel with an empty cart and no stale receipt.
  useEffect(() => {
    if (isOpen) {
      setSelectedId(null);
      setDetailItem(null);
      setCart([]);
      setReceipt(null);
      setEtchWare(null);
      setTab('wares');
      setPickerOffering(null);
      setPickedByKey({});
    }
  }, [isOpen]);

  const list = Array.isArray(shops) ? shops : [];
  const selected = list.find((s) => s.id === selectedId) || null;
  // A revealed-but-closed shop (#822 S2) is still browsable in the carousel but
  // not trading: it shows a notice instead of the wares/cart so nothing can be
  // bought or etched while closed.
  const closed = selected ? !isShopOpen(selected.id, waresStore) : false;
  const wares = useMemo(
    () => (selected ? resolveShopWares(selected.id, waresStore, catalogMap, runeMap) : []),
    [selected, waresStore, catalogMap, runeMap]
  );
  // Generative scroll/wand offerings (#820), kept out of `wares` (S6). The
  // Spellcasting Services tab only exists when there's at least one.
  const offerings = useMemo(
    () => (selected ? spellItemOfferings(selected.id, waresStore) : []),
    [selected, waresStore]
  );

  // Switching shops starts a fresh cart (a cart belongs to one shop).
  const openShop = (id) => {
    setSelectedId(id);
    setCart([]);
    setReceipt(null);
    setEtchWare(null);
    setTab('wares');
    setPickerOffering(null);
    setPickedByKey({});
  };

  // Pay to etch the active rune ware onto `weapon` (#802): the shop takes the
  // weapon and returns it runed after the turnaround. Leaves a receipt line.
  const doEtch = (weapon) => {
    const rune = etchWare && runeMap.get(String(etchWare.runestone?.runeRef));
    if (!rune) return;
    const order = etch(weapon, rune, selected?.title);
    setEtchWare(null);
    if (order) {
      setReceipt({ etch: true, weapon: weapon.name, rune: rune.name, total: rune.price });
    }
  };

  const addWare = (ware) => {
    setCart((c) => addToCart(c, ware));
    setReceipt(null);
  };

  // Add a picked scroll/wand (#812 S9) to the cart. Unlike a flat ware it isn't in
  // `wares`, so stash the resolved item by wareKey for handleConfirm to find.
  const addSpellWare = (item) => {
    setPickedByKey((m) => ({ ...m, [item.wareKey]: item }));
    addWare(item);
  };

  // Commit the cart: credit each line's full resolved ware (× qty) to the
  // buyer's acquired overlay and debit the total from their gold. On success the
  // cart clears and a receipt is shown; a rejected buy (over balance / offline)
  // leaves everything as-is.
  const handleConfirm = () => {
    // Flat wares resolve from `wares`; picked scroll/wand items from the stash.
    const wareByKey = new Map(wares.map((w) => [w.wareKey, w]));
    Object.values(pickedByKey).forEach((w) => wareByKey.set(w.wareKey, w));
    const purchases = cart
      .map((l) => ({ item: wareByKey.get(l.id), qty: l.qty }))
      .filter((p) => p.item);
    const result = buy(purchases, selected?.title);
    if (result) {
      setCart([]);
      setReceipt(result);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={selected ? selected.title : 'Shops'}
      maxWidth="760px"
    >
      {!selected ? (
        <div className="shop-carousel" aria-label="shops">
          {list.length === 0 ? (
            <p className="shop-empty">There are no shops here.</p>
          ) : (
            list.map((shop) => {
              const shopClosed = !isShopOpen(shop.id, waresStore);
              return (
                <button
                  key={shop.id}
                  type="button"
                  className={`shop-card${shopClosed ? ' shop-card--closed' : ''}`}
                  onClick={() => openShop(shop.id)}
                >
                  <span className="shop-card-name">
                    {shop.title}
                    {shopClosed && <span className="shop-card-tag">Closed</span>}
                  </span>
                  {shop.summary && <span className="shop-card-summary">{shop.summary}</span>}
                </button>
              );
            })
          )}
        </div>
      ) : (
        <div className="shop-window" data-testid={`shop-window-${selected.id}`}>
          <button type="button" className="shop-back" onClick={() => setSelectedId(null)}>
            ← All shops
          </button>
          {selected.summary && <p className="shop-window-summary">{selected.summary}</p>}

          {readOnly && (
            <p className="shop-readonly" role="note" data-testid="shop-readonly">
              Browsing only — the party isn&rsquo;t here. Visit to buy.
            </p>
          )}

          {receipt && (
            <p className="shop-receipt" role="status" data-testid="shop-receipt">
              {receipt.etch
                ? `Left ${receipt.weapon} to be etched with ${receipt.rune} for ${receipt.total} gp — collect it once it's done.`
                : `Purchased ${receipt.count} item${receipt.count === 1 ? '' : 's'} for ${receipt.total} gp.`}
            </p>
          )}

          {closed ? (
            <p className="shop-empty" data-testid="shop-closed">
              {selected.title} isn&rsquo;t trading right now.
            </p>
          ) : etchWare ? (
            <div className="shop-etch" data-testid="shop-etch-picker">
              <button type="button" className="shop-back" onClick={() => setEtchWare(null)}>
                ← Back to wares
              </button>
              <p className="shop-etch-prompt">
                Etch <strong>{etchWare.runestone?.rune?.name || 'this rune'}</strong> onto which weapon?
                The shop keeps it and returns it runed after the turnaround.
              </p>
              {weapons.length === 0 ? (
                <p className="shop-empty">You have no weapon to etch a rune onto.</p>
              ) : etchable.length === 0 ? (
                <p className="shop-empty" data-testid="shop-etch-no-slot">
                  No weapon has a free property-rune slot. Buy it as a Runestone and move
                  it onto a weapon with a Crafting check (you can displace an existing rune).
                </p>
              ) : (
                <ul className="shop-etch-weapons" aria-label="weapons">
                  {etchable.map((w) => (
                    <li key={w.uid}>
                      <button
                        type="button"
                        className="btn-small btn-secondary"
                        data-testid={`etch-weapon-${w.uid}`}
                        onClick={() => doEtch(w)}
                      >
                        {w.name} ({usedPropertySlots(w)}/{propertySlotCapacity(w.runes)} slots)
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <>
              {offerings.length > 0 && (
                <div className="shop-tabs" role="tablist" aria-label="shop sections">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'wares'}
                    className={`shop-tab${tab === 'wares' ? ' is-on' : ''}`}
                    onClick={() => setTab('wares')}
                  >
                    Wares
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'spells'}
                    className={`shop-tab${tab === 'spells' ? ' is-on' : ''}`}
                    onClick={() => setTab('spells')}
                  >
                    Spellcasting Services
                  </button>
                </div>
              )}

              {offerings.length > 0 && tab === 'spells' ? (
                pickerOffering ? (
                  <div className="shop-spellservices" data-testid="shop-spellservices">
                    <button type="button" className="shop-back" onClick={() => setPickerOffering(null)}>
                      ← Back to services
                    </button>
                    <p className="shop-spellservices-intro">
                      {spellOfferingSummary(pickerOffering, spells).text}
                    </p>
                    <DndProvider renderGhost={(w) => <span className="shop-ghost">{w.name}</span>}>
                      <div className="shop-window-body">
                        <SpellPicker
                          offering={pickerOffering}
                          spells={spells}
                          readOnly={readOnly}
                          onInspect={setDetailItem}
                          onAdd={addSpellWare}
                        />
                        {!readOnly && (
                          <DropZone
                            id="shop-cart"
                            accepts={() => true}
                            onDrop={(w) => addSpellWare(w)}
                            className="shop-cart-zone"
                          >
                            <ShopCart
                              cart={cart}
                              gold={myGold}
                              onSetQty={(id, qty) => setCart((c) => setQty(c, id, qty))}
                              onRemove={(id) => setCart((c) => removeLine(c, id))}
                              onConfirm={handleConfirm}
                            />
                          </DropZone>
                        )}
                      </div>
                    </DndProvider>
                  </div>
                ) : (
                  <div className="shop-spellservices" data-testid="shop-spellservices">
                    <p className="shop-spellservices-intro">
                      Scrolls and wands the keeper will scribe to order — pick one to browse the spells
                      it covers:
                    </p>
                    <ul className="shop-offerings" aria-label="spellcasting services">
                      {offerings.map((o) => {
                        const s = spellOfferingSummary(o, spells);
                        return (
                          <li key={o.offeringKey} className="shop-offering-row">
                            <button
                              type="button"
                              className="shop-offering-open"
                              data-testid={`offering-${o.offeringKey}`}
                              aria-label={`browse ${s.kind === 'scroll' ? 'scrolls' : 'wands'} up to rank ${s.cap}`}
                              onClick={() => setPickerOffering(o)}
                            >
                              <span className="shop-offering-text">{s.text}</span>
                              <span className="shop-offering-aff" aria-hidden="true">
                                Browse →
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )
              ) : wares.length === 0 ? (
                <p className="shop-empty">This shop has nothing for sale right now.</p>
              ) : (
                <DndProvider renderGhost={(w) => <span className="shop-ghost">{w.name}</span>}>
                  <div className="shop-window-body">
                    <ul className="shop-wares" aria-label="wares">
                      {wares.map((ware) => (
                        <li key={ware.wareKey} className="shop-ware-row">
                          <WareTile ware={ware} onInspect={setDetailItem} />
                          {!readOnly && ware.runestone && (
                            <button
                              type="button"
                              className="shop-ware-etch"
                              aria-label={`etch ${ware.wareKey}`}
                              onClick={() => setEtchWare(ware)}
                            >
                              ⚒ Etch
                            </button>
                          )}
                          {!readOnly && (
                            <button
                              type="button"
                              className="shop-ware-add"
                              aria-label={`add ${ware.wareKey}`}
                              onClick={() => addWare(ware)}
                            >
                              ＋ Add
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>

                    {!readOnly && (
                      <DropZone
                        id="shop-cart"
                        accepts={() => true}
                        onDrop={(w) => addWare(w)}
                        className="shop-cart-zone"
                      >
                        <ShopCart
                          cart={cart}
                          gold={myGold}
                          onSetQty={(id, qty) => setCart((c) => setQty(c, id, qty))}
                          onRemove={(id) => setCart((c) => removeLine(c, id))}
                          onConfirm={handleConfirm}
                        />
                      </DropZone>
                    )}
                  </div>
                </DndProvider>
              )}
            </>
          )}
        </div>
      )}

      <ItemModal
        isOpen={!!detailItem}
        onClose={() => setDetailItem(null)}
        item={detailItem}
        character={character}
        characterColor={characterColor}
      />
    </Modal>
  );
};

export default ShopModal;
