import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../shared/Modal';
import ItemModal from '../inventory/ItemModal';
import { itemCatalogMap } from '../../utils/contentUtils';
import { resolveShopWares } from '../../utils/shopUtils';
import './ShopModal.css';

// Shop browser (#696 S3–S4). Two views in one modal: a carousel of the current
// location's shops, and — once one is picked — that shop's window listing its
// wares. `shops` is the resolved list of shop lore entries (carousel); `waresStore`
// is the raw cnmh_shops_global, resolved per-shop against the item catalog here.
// Clicking a ware opens the read-only inventory ItemModal (a catalog item has no
// uid, so its loadout/give actions self-disable). Cart + buy land in S5–S6.
const ShopModal = ({ isOpen, onClose, shops, waresStore, items, character, characterColor }) => {
  const [selectedId, setSelectedId] = useState(null);
  const [detailItem, setDetailItem] = useState(null);

  const catalogMap = useMemo(() => itemCatalogMap(items), [items]);

  // Always reopen on the carousel, not whatever shop was last viewed.
  useEffect(() => {
    if (isOpen) {
      setSelectedId(null);
      setDetailItem(null);
    }
  }, [isOpen]);

  const list = Array.isArray(shops) ? shops : [];
  const selected = list.find((s) => s.id === selectedId) || null;
  const wares = useMemo(
    () => (selected ? resolveShopWares(selected.id, waresStore, catalogMap) : []),
    [selected, waresStore, catalogMap]
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={selected ? selected.title : 'Shops'}
      maxWidth="720px"
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
                onClick={() => setSelectedId(shop.id)}
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

          {wares.length === 0 ? (
            <p className="shop-empty">This shop has nothing for sale right now.</p>
          ) : (
            <ul className="shop-wares" aria-label="wares">
              {wares.map((ware) => (
                <li key={ware.id}>
                  <button
                    type="button"
                    className="shop-ware"
                    onClick={() => setDetailItem(ware)}
                  >
                    <span className="shop-ware-name">{ware.name}</span>
                    <span className="shop-ware-meta">
                      <span className="shop-ware-price">{ware.price} gp</span>
                      {ware.stock != null && (
                        <span className="shop-ware-stock">{ware.stock} in stock</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
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
