// src/components/inventory/ItemCard.js
// Compact inventory item card: name + meta chips (×qty · n bulk · rarity),
// a held-item glyph, and a chevron. Magical items get an arcane left border;
// dropped items are faded + struck through. Tapping opens the ItemModal.
import React from 'react';
import { formatBulk, getItemRarity, isItemMagical } from '../../utils/InventoryUtils';
import { isHeldState, ITEM_STATE_LABEL } from '../../utils/itemState';
import './ItemCard.css';

const ItemCard = ({ item, onClick }) => {
  const qty = item.quantity || 1;
  const rarity = getItemRarity(item);
  const magical = isItemMagical(item);
  const held = isHeldState(item.state);
  const dropped = item.state === 'dropped';
  const isContainerItem = !!(item.container && Array.isArray(item.container.contents));
  // Non-worn, non-held, non-dropped, non-stowed states surface as a small chip.
  const showStateChip = item.state && !['worn', 'dropped', 'stowed'].includes(item.state) && !held;

  const cls = [
    'item-card',
    magical ? 'item-card--magical' : '',
    dropped ? 'item-card--dropped' : '',
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={cls}
      onClick={() => onClick(item)}
      data-testid={item.uid ? `item-card-${item.uid}` : undefined}
    >
      <div className="item-card-main">
        <span className="item-card-name">
          {item.name}
          {isContainerItem && (
            <span className="item-card-container-icon" role="img" aria-label="Container">📦</span>
          )}
        </span>
        <div className="item-card-chips">
          {qty > 1 && <span className="item-chip">×{qty}</span>}
          <span className="item-chip">{formatBulk(item.weight || 0)} bulk</span>
          {rarity && (
            <span className={`item-chip item-rarity item-rarity--${String(rarity).toLowerCase()}`}>
              {rarity}
            </span>
          )}
          {showStateChip && (
            <span className="item-chip item-chip--state">{ITEM_STATE_LABEL[item.state]}</span>
          )}
          {/* Active item-target effects (oils, #339) — display-only badge. */}
          {(item.activeEffects || []).map((e) => (
            <span
              key={e.id}
              className="item-chip item-chip--effect"
              title={e.note || e.label}
            >
              ✨ {e.label}
            </span>
          ))}
        </div>
      </div>
      {held && (
        <span
          className="item-card-held"
          role="img"
          aria-label={ITEM_STATE_LABEL[item.state]}
          title={ITEM_STATE_LABEL[item.state]}
        >
          ✊
        </span>
      )}
      <span className="item-card-chevron" aria-hidden="true">›</span>
    </button>
  );
};

export default ItemCard;
