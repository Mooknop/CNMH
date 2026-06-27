import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../shared/Modal';
import ItemModal from '../inventory/ItemModal';
import { DndProvider, useDraggable, DropZone } from '../inventory/dnd';
import { itemCatalogMap, runeCatalogMap } from '../../utils/contentUtils';
import { resolveShopWares, isShopOpen } from '../../utils/shopUtils';
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

// Shop browser (#696 S3–S5). Carousel of the current location's shops → a shop
// window listing wares with a drag-to-cart buy basket. `shops` is the resolved
// list of shop lore entries; `waresStore` is the raw cnmh_shops_global. Clicking
// a ware opens the read-only inventory ItemModal. The cart is local state; the
// purchase itself (gold debit + acquired credit, #696 S6) runs through
// useBuyItems on Confirm, leaving a receipt behind.
const ShopModal = ({ isOpen, onClose, shops, waresStore, items, runes, character, characterColor }) => {
  const [selectedId, setSelectedId] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [cart, setCart] = useState([]);
  const [receipt, setReceipt] = useState(null);
  // The rune ware currently being etched onto a weapon (#802), or null.
  const [etchWare, setEtchWare] = useState(null);

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

  // Switching shops starts a fresh cart (a cart belongs to one shop).
  const openShop = (id) => {
    setSelectedId(id);
    setCart([]);
    setReceipt(null);
    setEtchWare(null);
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

  // Commit the cart: credit each line's full resolved ware (× qty) to the
  // buyer's acquired overlay and debit the total from their gold. On success the
  // cart clears and a receipt is shown; a rejected buy (over balance / offline)
  // leaves everything as-is.
  const handleConfirm = () => {
    const wareByKey = new Map(wares.map((w) => [w.wareKey, w]));
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
          ) : wares.length === 0 ? (
            <p className="shop-empty">This shop has nothing for sale right now.</p>
          ) : (
            <DndProvider renderGhost={(w) => <span className="shop-ghost">{w.name}</span>}>
              <div className="shop-window-body">
                <ul className="shop-wares" aria-label="wares">
                  {wares.map((ware) => (
                    <li key={ware.wareKey} className="shop-ware-row">
                      <WareTile ware={ware} onInspect={setDetailItem} />
                      {ware.runestone && (
                        <button
                          type="button"
                          className="shop-ware-etch"
                          aria-label={`etch ${ware.wareKey}`}
                          onClick={() => setEtchWare(ware)}
                        >
                          ⚒ Etch
                        </button>
                      )}
                      <button
                        type="button"
                        className="shop-ware-add"
                        aria-label={`add ${ware.wareKey}`}
                        onClick={() => addWare(ware)}
                      >
                        ＋ Add
                      </button>
                    </li>
                  ))}
                </ul>

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
              </div>
            </DndProvider>
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
