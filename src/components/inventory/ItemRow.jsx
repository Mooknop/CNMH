import React from 'react';
import ItemCard from './ItemCard';
import { itemUidOf } from '../../utils/affix';
import { weaponPropertyRunes } from '../../utils/weaponRunes';
import './ItemRow.css';

/**
 * An inventory item card plus its indented child lines. A weapon can carry both
 * at once (#609): its property runes (#548) render first, then any affixed
 * talismans (#254/#339) — a deterministic order. ItemCard is a <button>, so the
 * child lines are siblings (not nested), and the two line types live in separate
 * key namespaces (`rune-…` / `talisman-…`) so a rune id can never collide with a
 * talisman uid. A rune line opens the host weapon's modal (runes are part of the
 * weapon); a talisman line opens its own ItemModal.
 *
 * @param {Object}   item               the host item
 * @param {Array}    affixedTalismans   resolved talisman items affixed to it
 * @param {Function} onItemClick        (item) => void
 */
const ItemRow = ({ item, affixedTalismans = [], onItemClick }) => (
  <div className="item-row">
    <ItemCard item={item} onClick={onItemClick} />
    {weaponPropertyRunes(item).map((rune, i) => (
      <button
        key={`rune-${i}-${rune.id}`}
        type="button"
        className="weapon-rune-line"
        onClick={() => onItemClick(item)}
      >
        <span className="affixed-cue" aria-hidden="true">↳</span>
        <span className="affixed-name">{rune.name}</span>
        <span className="affixed-tag">rune</span>
        <span className="affixed-chevron" aria-hidden="true">›</span>
      </button>
    ))}
    {affixedTalismans.map((t) => (
      <button
        key={`talisman-${itemUidOf(t)}`}
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
