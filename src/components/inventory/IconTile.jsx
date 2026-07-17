import React from 'react';
import GameGlyph from '../shared/GameGlyph';
import ThassilonianRune from '../shared/ThassilonianRune';
import RuneIcon from '../shared/RuneIcon';
import { runeForName } from '../../utils/thassilonianRunes';
import { runeIconsOf, resolveRuneIcon } from '../../utils/runeIcons';
import { itemTint, itemCharges, isGlowy, itemRarity, itemCode } from '../../utils/inventoryTile';
import './IconTile.css';

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
  // Catalog runes (#1369): a runestone's held rune becomes the art when the
  // tile has neither image nor sin rune; everything else (weapon property
  // runes, an imaged runestone's rune) rides as bottom-right medallions.
  const catalogRunes = runeIconsOf(item);
  const heldRune = item?.runestone?.rune;
  const runeArt = !item?.image && !rune && heldRune ? heldRune : null;
  const runeCoins = catalogRunes.filter((doc) => doc !== runeArt);

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
      {/* Rune rail (#1369) — every catalog rune the item carries, uncapped,
          stacked down the right edge and tucked BEHIND the art so each coin
          peeks out from behind the tile. Rendered before the face layer so the
          art paints over the inner half of each coin. */}
      {runeCoins.length > 0 && (
        <span className="icon-tile-runeicons">
          {runeCoins.map((doc) => {
            const icon = resolveRuneIcon(doc.id);
            return (
              <span
                key={doc.id}
                className="icon-tile-runeicon runeicon-tint"
                data-runeicon={icon.generic ? 'generic' : icon.family}
              >
                <RuneIcon runeId={doc.id} title={doc.name} />
              </span>
            );
          })}
        </span>
      )}
      {/* The art, clipped to the rounded tile so it never overhangs the corners
          now that the tile itself no longer clips (the rail must escape it). */}
      <span className="icon-tile-face">
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
        ) : runeArt ? (
          <span className="icon-tile-rune-art">
            <RuneIcon runeId={runeArt.id} tint title={runeArt.name} />
          </span>
        ) : (
          <span className="icon-tile-code">{itemCode(item?.name)}</span>
        )}
      </span>
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
      {item?.durabilityState && (
        <span
          className={`icon-tile-broken${item.durabilityState === 'destroyed' ? ' is-destroyed' : ''}`}
          title={item.durabilityState === 'destroyed' ? 'Destroyed' : 'Broken'}
          aria-label={item.durabilityState === 'destroyed' ? 'Destroyed' : 'Broken'}
        >
          {item.durabilityState === 'destroyed' ? '💀' : '⚠️'}
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
