import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../shared/Modal';
import ItemModal from '../inventory/ItemModal';
import { DndProvider, useDraggable, DropZone } from '../inventory/dnd';
import { itemCatalogMap } from '../../utils/contentUtils';
import { resolveShopWares } from '../../utils/shopUtils';
import { addToCart, setQty, removeLine } from '../../utils/shopCart';
import { useBuyItems } from '../../hooks/useBuyItems';
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
const ShopModal = ({ isOpen, onClose, shops, waresStore, items, character, characterColor }) => {
  const [selectedId, setSelectedId] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [cart, setCart] = useState([]);
  const [receipt, setReceipt] = useState(null);

  const { myGold, buy } = useBuyItems(character?.id);
  const catalogMap = useMemo(() => itemCatalogMap(items), [items]);

  // Always reopen on the carousel with an empty cart and no stale receipt.
  useEffect(() => {
    if (isOpen) {
      setSelectedId(null);
      setDetailItem(null);
      setCart([]);
      setReceipt(null);
    }
  }, [isOpen]);

  const list = Array.isArray(shops) ? shops : [];
  const selected = list.find((s) => s.id === selectedId) || null;
  const wares = useMemo(
    () => (selected ? resolveShopWares(selected.id, waresStore, catalogMap) : []),
    [selected, waresStore, catalogMap]
  );

  // Switching shops starts a fresh cart (a cart belongs to one shop).
  const openShop = (id) => {
    setSelectedId(id);
    setCart([]);
    setReceipt(null);
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
            list.map((shop) => (
              <button
                key={shop.id}
                type="button"
                className="shop-card"
                onClick={() => openShop(shop.id)}
              >
                <span className="shop-card-name">{shop.title}</span>
                {shop.summary && <span className="shop-card-summary">{shop.summary}</span>}
              </button>
            ))
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
              Purchased {receipt.count} item{receipt.count === 1 ? '' : 's'} for {receipt.total} gp.
            </p>
          )}

          {wares.length === 0 ? (
            <p className="shop-empty">This shop has nothing for sale right now.</p>
          ) : (
            <DndProvider renderGhost={(w) => <span className="shop-ghost">{w.name}</span>}>
              <div className="shop-window-body">
                <ul className="shop-wares" aria-label="wares">
                  {wares.map((ware) => (
                    <li key={ware.wareKey} className="shop-ware-row">
                      <WareTile ware={ware} onInspect={setDetailItem} />
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
