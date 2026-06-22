import React, { useState, useCallback } from 'react';
import IconTile from './IconTile';
import { useDraggable, DropZone } from './dnd';
import {
  isContainer,
  formatBulk,
  calculateItemsBulk,
  calculateContainerBulk,
} from '../../utils/InventoryUtils';
import { ITEM_STATE_LABEL, isHeldState } from '../../utils/itemState';

const WORN = 'worn';

/**
 * A single draggable grid cell. Tapping opens the ItemModal; a long-press (touch)
 * or small drag (mouse) picks the item up. Shows a small state chip for held /
 * dropped items so nothing reads as a plain Worn item before the Hands strip
 * lands (S4).
 */
const GridCell = ({ item, glow, onItemClick }) => {
  const { onPointerDown } = useDraggable({ item, onTap: onItemClick });
  const held = isHeldState(item.state);
  const dropped = item.state === 'dropped';
  return (
    <button
      type="button"
      className={'cell' + (dropped ? ' cell--dropped' : '')}
      onPointerDown={onPointerDown}
      data-testid={item.uid ? `grid-cell-${item.uid}` : undefined}
    >
      <IconTile item={item} size={56} glow={glow} />
      <span className="cell-name">{item.name}</span>
      {(held || dropped) && (
        <span className="cell-state">{ITEM_STATE_LABEL[item.state]}</span>
      )}
    </button>
  );
};

/**
 * Bag tabs (Worn + one per container, all drop targets) over a square slot grid.
 * Placement writes flow through the loadout actions passed in:
 *   - drop on Worn  → worn(uid)
 *   - drop on a bag → stow(uid, bagUid) (or moveToContainer when already stowed)
 * Tap a tile to open its ItemModal. Filtering / sorting arrives with the toolbar
 * (S5); for now items show alphabetically.
 *
 * @param {Object[]} inventory - effective top-level inventory (worn/held/dropped
 *                               items + containers with their contents)
 * @param {Function} worn      - useLoadout.worn(uid)
 * @param {Function} stow      - useLoadout.stow(uid, containerUid)
 * @param {Function} moveToContainer - useLoadout.moveToContainer(uid, containerUid)
 * @param {Function} [unattune] - useInvested.unattune(uid) — invested items
 *                                dropped onto a bag also lose attunement
 * @param {Function} [isInvested] - (uid) => bool
 * @param {Function} onItemClick - (item) => void
 * @param {boolean}  [glow]
 */
const BagGrid = ({
  inventory = [],
  worn,
  stow,
  moveToContainer,
  unattune,
  isInvested,
  onItemClick,
  glow = true,
}) => {
  const [activeBag, setActiveBag] = useState(WORN);

  const containers = inventory.filter(isContainer);
  // A selected container may have been emptied/removed since selection; fall back
  // to Worn so the grid never points at a missing bag.
  const activeContainer =
    activeBag === WORN ? null : containers.find((c) => c.uid === activeBag);
  const bag = activeContainer ? activeBag : WORN;

  const byName = (a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase());

  // Worn bag = top-level non-container items; container bag = its contents.
  const bagItems = (key) =>
    key === WORN
      ? inventory.filter((it) => !isContainer(it))
      : (containers.find((c) => c.uid === key)?.container?.contents || []);

  const active = [...bagItems(bag)].sort(byName);

  // Pad to a tidy grid: a minimum cell count, then up to the next row of 4.
  const minCells = bag === WORN ? 8 : 6;
  const pad = Math.max(
    minCells - active.length,
    active.length % 4 === 0 ? 0 : 4 - (active.length % 4)
  );

  // Drop an item into a target bag. Worn is a plain re-home; a container either
  // stows (from worn/held/dropped) or moves (already stowed elsewhere). An
  // invested item dropped back into a bag also loses its attunement (the
  // counterpart of dragging onto the Attuned area).
  const placeIn = useCallback(
    (key, item) => {
      if (isInvested && isInvested(item.uid)) unattune(item.uid);
      if (key === WORN) {
        worn(item.uid);
      } else if (item.state === 'stowed') {
        moveToContainer(item.uid, key);
      } else {
        stow(item.uid, key);
      }
    },
    [worn, stow, moveToContainer, unattune, isInvested]
  );

  // Containers can't nest, so a container item is never a valid drop payload.
  const acceptsBag = useCallback((key) => (item) => key === WORN || !isContainer(item), []);

  const activeCap = activeContainer
    ? calculateContainerBulk(activeContainer.container).capacity
    : null;
  const activeUsed = activeContainer
    ? calculateContainerBulk(activeContainer.container).contentsBulk
    : calculateItemsBulk(bagItems(WORN));

  const tabs = [
    { key: WORN, name: 'Worn', glyph: '◍' },
    ...containers.map((c) => ({ key: c.uid, name: c.name, glyph: '🜍', container: c })),
  ];

  return (
    <div className="bag-grid">
      <div className="bag-tabs" data-scroll-x>
        {tabs.map((t) => {
          const used =
            t.key === WORN
              ? calculateItemsBulk(bagItems(WORN))
              : calculateContainerBulk(t.container.container).contentsBulk;
          const cap =
            t.key === WORN ? null : calculateContainerBulk(t.container.container).capacity;
          const over = cap != null && used > cap;
          return (
            <DropZone
              key={t.key}
              id={`bag:${t.key}`}
              accepts={acceptsBag(t.key)}
              onDrop={(item) => placeIn(t.key, item)}
              className={'bag-tab' + (bag === t.key ? ' is-active' : '')}
              role="tab"
              aria-selected={bag === t.key}
              onClick={() => setActiveBag(t.key)}
              data-testid={`bag-tab-${t.key}`}
            >
              <span className="bag-tab-glyph">{t.glyph}</span>
              <span className="bag-tab-name">{t.name}</span>
              <span className={'bag-tab-meta' + (over ? ' is-full' : '')}>
                {cap == null ? formatBulk(used) : `${formatBulk(used)}/${cap}`}
              </span>
            </DropZone>
          );
        })}
      </div>

      <DropZone
        id={`grid:${bag}`}
        accepts={acceptsBag(bag)}
        onDrop={(item) => placeIn(bag, item)}
        className="grid-wrap"
      >
        {activeContainer && (
          <div className="grid-capnote">
            {formatBulk(activeUsed)} / {activeCap} Bulk
            {activeCap != null && activeUsed > activeCap && <em> · overfull</em>}
          </div>
        )}
        <div className="cell-grid">
          {active.map((it) => (
            <GridCell key={it.uid} item={it} glow={glow} onItemClick={onItemClick} />
          ))}
          {Array.from({ length: pad }).map((_, i) => (
            <span key={`e${i}`} className="cell-empty" aria-hidden="true" />
          ))}
        </div>
        {active.length === 0 && <p className="grid-none">This bag is empty.</p>}
      </DropZone>
    </div>
  );
};

export default BagGrid;
