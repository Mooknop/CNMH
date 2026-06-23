import React, { useEffect, useState } from 'react';
import Modal from '../shared/Modal';
import './ShopModal.css';

// Shop browser (#696 S3). Two views in one modal: a carousel of the current
// location's shops, and — once one is picked — that shop's window. The window is
// a stub here; the wares list (S4) and cart/buy flow (S5–S6) fill it in. `shops`
// is the resolved list of shop lore entries from getShopsForLocation.
const ShopModal = ({ isOpen, onClose, shops }) => {
  const [selectedId, setSelectedId] = useState(null);

  // Always reopen on the carousel, not whatever shop was last viewed.
  useEffect(() => {
    if (isOpen) setSelectedId(null);
  }, [isOpen]);

  const list = Array.isArray(shops) ? shops : [];
  const selected = list.find((s) => s.id === selectedId) || null;

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
          <p className="shop-empty">Wares coming soon.</p>
        </div>
      )}
    </Modal>
  );
};

export default ShopModal;
