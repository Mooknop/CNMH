import React, { useCallback } from 'react';
import IconTile from './IconTile';
import { useDraggable, DropZone } from './dnd';
import { isInvestable, wouldBreakPowerRingLimit, wouldBreakApexLimit } from '../../utils/InventoryUtils';
import { ATTUNE_CAP } from '../../hooks/useInvested';

/**
 * A single attuned (invested) item: a draggable tile with a clamped name. Tap
 * opens the ItemModal; drag it onto a bag to remove attunement (BagGrid's drop
 * handler calls unattune) or use the modal's "Remove attunement" action.
 */
const AttTile = ({ item, glow, onItemClick }) => {
  const { onPointerDown, onKeyDown } = useDraggable({ item, onTap: onItemClick });
  return (
    <button
      type="button"
      className="att-slot is-filled"
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      data-testid={item.uid ? `attuned-tile-${item.uid}` : undefined}
    >
      <IconTile item={item} size={48} glow={glow} />
      <span className="att-name">{item.name}</span>
    </button>
  );
};

/**
 * The Attuned area: a flat grid of 10 invest slots (the PF2e invested-item
 * limit). Only items carrying the Invested trait can be dropped in, up to the
 * cap. Filled slots show the invested items; the rest render as empty dashed
 * cells so the grid always reads as 10.
 *
 * @param {Object[]} items     - the currently-invested items to render
 * @param {Function} attune    - useInvested.attune(uid)
 * @param {Function} onItemClick - (item) => void
 * @param {boolean}  [glow]
 */
const AttunedArea = ({ items = [], attune, onItemClick, glow = true }) => {
  const count = items.length;
  const empties = Math.max(0, ATTUNE_CAP - count);

  // Accept an eligible item only while there's room, it isn't already here, and
  // it wouldn't break the one-power-ring-invested limit (#967 R6) or the
  // one-apex-item limit (#967 R8). A rejected drop shows the invalid state,
  // same as an over-cap or non-investable drop.
  const accepts = useCallback(
    (item) =>
      count < ATTUNE_CAP &&
      isInvestable(item) &&
      !items.some((it) => it.uid === item.uid) &&
      !wouldBreakPowerRingLimit(item, items) &&
      !wouldBreakApexLimit(item, items),
    [count, items]
  );

  return (
    <DropZone
      id="attuned"
      accepts={accepts}
      onDrop={(item) => attune(item.uid)}
      className="attuned"
      activeClass="att-over"
      invalidClass="att-bad"
      data-testid="attuned-area"
    >
      <div className="att-head">
        <span className="att-title">Attuned</span>
        <span className={'att-count' + (count >= ATTUNE_CAP ? ' is-full' : '')}>
          {count} / {ATTUNE_CAP} invested
        </span>
      </div>
      <div className="att-grid">
        {items.map((it) => (
          <AttTile key={it.uid} item={it} glow={glow} onItemClick={onItemClick} />
        ))}
        {Array.from({ length: empties }).map((_, i) => (
          <span key={`e${i}`} className="att-empty" aria-hidden="true">
            <i className="att-empty-mark" />
          </span>
        ))}
      </div>
    </DropZone>
  );
};

export default AttunedArea;
