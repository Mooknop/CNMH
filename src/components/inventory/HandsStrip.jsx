import React from 'react';
import IconTile from './IconTile';
import { useDraggable, DropZone } from './dnd';
import { isContainer } from '../../utils/InventoryUtils';
import { isBodyBound } from '../../utils/itemState';
import { deriveHands } from '../../utils/hands';

/**
 * A draggable hand tile (outside encounter). Tap opens the ItemModal; drag it
 * onto a bag to unhand it, or onto the other hand slot to move/grip it.
 */
const DraggableHandTile = ({ item, onItemClick, glow }) => {
  const { onPointerDown, onKeyDown } = useDraggable({ item, onTap: onItemClick });
  return (
    <button
      type="button"
      className="hands-strip-tile"
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      data-testid={`hands-tile-${item.uid}`}
    >
      <IconTile item={item} size={48} glow={glow} />
      <span className="hands-strip-name">{item.name}</span>
    </button>
  );
};

/** A static (read-only, encounter-mode) hand tile — tap to view, no drag. */
const StaticHandTile = ({ item, onItemClick, glow }) => (
  <button
    type="button"
    className="hands-strip-tile"
    onClick={() => onItemClick && onItemClick(item)}
    data-testid={`hands-tile-${item.uid}`}
  >
    <IconTile item={item} size={48} glow={glow} />
    <span className="hands-strip-name">{item.name}</span>
  </button>
);

/**
 * The two-slot Hands strip, between the Attuned area and the bags. Held items
 * are derived from the effective tree (a two-handed grip fills both slots).
 *
 * Outside encounter the slots are drop targets and the tiles are draggable:
 * drop an item onto a hand to wield it (writing the loadout atomically through
 * setHands, preserving the other hand), or drag a held tile onto a bag to
 * unhand it. In encounter mode the strip is read-only — hand changes go through
 * the Encounter tab's Swap action (the PF2e Interact economy).
 *
 * @param {Object[]} items       - effective held items (held1 / held2)
 * @param {boolean}  interactive - false in encounter mode (read-only)
 * @param {Function} setHands    - useLoadout.setHands({ hand1, hand2 })
 * @param {Function} onItemClick - (item) => void
 * @param {boolean}  [glow]
 */
const HandsStrip = ({ items = [], interactive, setHands, onItemClick, glow = true }) => {
  const { slot1, slot2 } = deriveHands(items);
  const current = { hand1: slot1 ? slot1.uid : null, hand2: slot2 ? slot2.uid : null };

  // Assign an item to a hand, keeping the other hand. Dropping the same item on
  // both hands yields a two-handed grip (setHands collapses it to held2).
  const assignTo = (n, dropped) =>
    setHands(
      n === 1
        ? { hand1: dropped.uid, hand2: current.hand2 }
        : { hand1: current.hand1, hand2: dropped.uid }
    );

  // Containers can't be held; body-bound gear (tattoos) can't leave the body
  // for a hand either.
  const accepts = (item) => !isContainer(item) && !isBodyBound(item);

  const renderSlot = (n) => {
    const item = n === 1 ? slot1 : slot2;
    const body = (
      <>
        <span className="hands-strip-label">Hand {n}</span>
        {item ? (
          interactive ? (
            <DraggableHandTile item={item} onItemClick={onItemClick} glow={glow} />
          ) : (
            <StaticHandTile item={item} onItemClick={onItemClick} glow={glow} />
          )
        ) : (
          <span className="hands-strip-empty" aria-hidden="true">
            <i className="hands-strip-empty-mark" />
          </span>
        )}
      </>
    );

    return interactive ? (
      <DropZone
        key={n}
        id={`hand:${n}`}
        accepts={accepts}
        onDrop={(dropped) => assignTo(n, dropped)}
        className="hands-strip-slot"
        data-testid={`hands-strip-slot-${n}`}
      >
        {body}
      </DropZone>
    ) : (
      <div key={n} className="hands-strip-slot" data-testid={`hands-strip-slot-${n}`}>
        {body}
      </div>
    );
  };

  return (
    <div className="hands-strip" data-testid="hands-strip">
      <div className="hands-strip-slots">
        {renderSlot(1)}
        {renderSlot(2)}
      </div>
      {!interactive && (
        <p className="hands-strip-hint">Use Swap in the Encounter tab to change hands.</p>
      )}
    </div>
  );
};

export default HandsStrip;
