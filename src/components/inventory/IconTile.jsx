import React from 'react';
import GameGlyph from '../shared/GameGlyph';
import ThassilonianRune from '../shared/ThassilonianRune';
import { runeForName } from '../../utils/thassilonianRunes';
import { itemTint, itemCharges, isGlowy, itemRarity, itemCode } from '../../utils/inventoryTile';

/**
 * Square placeholder tile for an inventory item: a dark bevelled face with a
 * monospace item code (or the real `item.image` when present), tinted by
 * material family, with an optional quantity badge, charge pips, rarity ring,
 * and resource glow. Swap the code for real art later — the code is the
 * fallback.
 *
 * @param {Object}  props
 * @param {Object}  props.item   - resolved effective inventory item
 * @param {number}  [props.size] - tile edge in px (default 52)
 * @param {boolean} [props.glow] - master glow toggle (default true)
 */
const IconTile = ({ item, size = 52, glow = true }) => {
  const tint = itemTint(item);
  const charges = itemCharges(item);
  const rarity = itemRarity(item);
  const showGlow = glow && isGlowy(item);
  const qty = item?.quantity || 1;
  // Rune-marked gear: with real art the rune rides as a corner medallion
  // (bottom-left, the free corner); with none it IS the art.
  const rune = runeForName(item?.thassilonianRune);

  const cls = [
    'icon-tile',
    `tint-${tint}`,
    `rar-${rarity}`,
    showGlow ? 'is-glow' : '',
    item?.container ? 'is-container' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // The tile edge is genuinely dynamic, so bridge it through a CSS custom
  // property rather than hard-coding sizes in CSS.
  return (
    <span className={cls} style={{ '--tile': `${size}px` }}>
      {item?.image ? (
        <img
          className="icon-tile-img"
          src={`/api/images/${item.image}`}
          alt=""
          draggable={false}
        />
      ) : rune ? (
        <span className="icon-tile-rune-art">
          <ThassilonianRune name={item.thassilonianRune} tint title={`Rune of ${rune.label}`} />
        </span>
      ) : (
        <span className="icon-tile-code">{itemCode(item?.name)}</span>
      )}
      {item?.image && rune && (
        <span
          className="icon-tile-rune rune-tint"
          data-rune={String(item.thassilonianRune).toLowerCase()}
        >
          <ThassilonianRune name={item.thassilonianRune} title={`Rune of ${rune.label}`} />
        </span>
      )}
      {item?.activeEffects?.length > 0 && (
        <span
          className="icon-tile-fx"
          title={item.activeEffects.map((e) => e.label).join(', ')}
          aria-label="Active effect"
        >
          ✨
        </span>
      )}
      {item?.hasAttachment && (
        <span className="icon-tile-attached">
          <GameGlyph name="attachment" title="Has an attachment" />
        </span>
      )}
      {qty > 1 && <span className="icon-tile-qty">{qty}</span>}
      {charges && (
        <span
          className="icon-tile-charges"
          title={`${charges.current} / ${charges.max} charges`}
        >
          {Array.from({ length: Math.min(charges.max, 6) }).map((_, i) => (
            <i key={i} className={i < charges.current ? 'on' : ''} />
          ))}
        </span>
      )}
    </span>
  );
};

export default IconTile;
