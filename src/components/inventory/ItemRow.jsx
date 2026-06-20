import React from 'react';
import ItemCard from './ItemCard';
import { itemUidOf } from '../../utils/affix';
import './ItemRow.css';

/**
 * An inventory item card plus any talismans affixed to it, rendered as indented
 * child lines beneath it (#254/#339). ItemCard is a <button>, so the affixed
 * lines are siblings (not nested) — each opens its own talisman ItemModal.
 *
 * @param {Object}   item               the host item
 * @param {Array}    affixedTalismans   resolved talisman items affixed to it
 * @param {Function} onItemClick        (item) => void
 */
const ItemRow = ({ item, affixedTalismans = [], onItemClick }) => (
  <div className="item-row">
    <ItemCard item={item} onClick={onItemClick} />
    {affixedTalismans.map((t) => (
      <button
        key={itemUidOf(t)}
        type="button"
        className="affixed-talisman-line"
        onClick={() => onItemClick(t)}
      >
        <span className="affixed-cue" aria-hidden="true">↳</span>
        <span className="affixed-name">{t.name}</span>
        <span className="affixed-tag">affixed</span>
        <span className="affixed-chevron" aria-hidden="true">›</span>
      </button>
    ))}
  </div>
);

export default ItemRow;
