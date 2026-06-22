import React, { useState } from 'react';
import './InventoryTab.css';
import './InventoryGrid.css';
import GiveGoldModal from './GiveGoldModal';
import BulkBar from './BulkBar';
import BagGrid from './BagGrid';
import IconTile from './IconTile';
import { DndProvider } from './dnd';
import { getBulkStatus, applyConsumedOverlay, isContainer } from '../../utils/InventoryUtils';
import { affixedKey, affixedUidSet, itemUidOf } from '../../utils/affix';
import { useCharacter } from '../../hooks/useCharacter';
import { useLoadout } from '../../hooks/useLoadout';
import { useSyncedState } from '../../hooks/useSyncedState';
import { usePlayMode } from '../../hooks/usePlayMode';
import { docGold } from '../../utils/gold';

/**
 * Inventory "Loadout Grid": gold header → Bulk bar → drag-and-drop bag grid.
 * Placement reads from useCharacter (effective tree) and writes through
 * useLoadout; tapping a tile opens the ItemModal (wired by the parent via
 * onItemClick). Attuned area + Hands strip + toolbar land in later slices.
 * @param {Object} props
 * @param {Object} props.character - Character data
 * @param {string} props.characterColor - Theme color
 * @param {function} props.onItemClick - Handler for item taps (opens ItemModal)
 */
const InventoryTab = ({ character, characterColor, onItemClick }) => {
  // Data layer — all character reads go through this hook
  const charData = useCharacter(character);
  // Loadout writer — the single source of placement mutations (#556).
  const { worn, stow, moveToContainer } = useLoadout(character?.id);
  // Personal gold is live-synced; shown here read-only. Default to the doc's
  // gold so an unset overlay (fresh load / post-reseed) shows the committed
  // value rather than 0 (#670).
  const [gold] = useSyncedState(`cnmh_gold_${character?.id}`, docGold(character));
  // Consumed-consumables overlay — fully-used items disappear from the grid
  // (the GM cleanup tool removes them from authored content later).
  const [consumed] = useSyncedState(`cnmh_consumed_${character?.id}`, {});
  // Affixed-talisman overlay (#254/#339) — talisman uid → host uid. Affixed
  // talismans don't get their own tile (they're attached to a host).
  const [affixed] = useSyncedState(affixedKey(character?.id), {});
  // Player-to-player gold transfer (#655) — only out of combat (giving gold is
  // an Interact action in an encounter, out of scope here).
  const { mode } = usePlayMode();
  const canGive = mode === 'exploration' || mode === 'downtime';
  const [giveOpen, setGiveOpen] = useState(false);
  if (!charData) return null;

  const { bulkStats, totalBulk: bulkUsed, inventory } = charData;
  const { bulkLimit, encumberedThreshold } = bulkStats;

  const { isEncumbered, isOverencumbered } = getBulkStatus(bulkUsed, bulkLimit, encumberedThreshold);

  // Apply the consumed overlay to the top level AND each container's contents so
  // a stowed consumable shows its live count and disappears at 0 (#253), then
  // drop affixed talismans from both levels — they render via their host, not as
  // their own tile.
  const affixedUids = affixedUidSet(affixed);
  const notAffixed = (item) => !affixedUids.has(itemUidOf(item));
  const gridInventory = applyConsumedOverlay(inventory, consumed)
    .filter(notAffixed)
    .map((item) =>
      isContainer(item)
        ? {
            ...item,
            container: {
              ...item.container,
              contents: applyConsumedOverlay(item.container.contents, consumed).filter(notAffixed),
            },
          }
        : item
    );

  return (
    <div className="inventory-tab">
      <div className="inventory-header">
        <h2>Inventory</h2>
        <div className="inventory-gold-group">
          <span className="inventory-gold">💰 {gold} gp</span>
          {canGive && (
            <button
              type="button"
              className="btn-small btn-secondary inventory-give-btn"
              data-testid="give-gold-open"
              onClick={() => setGiveOpen(true)}
            >
              Give gold
            </button>
          )}
        </div>
      </div>

      <DndProvider renderGhost={(item) => <IconTile item={item} size={56} glow={false} />}>
        <div className="inventory-grid">
          <BulkBar
            bulkUsed={bulkUsed}
            encumberedThreshold={encumberedThreshold}
            bulkLimit={bulkLimit}
          />

          {isEncumbered && !isOverencumbered && (
            <div className="bulk-warning">
              Encumbered: -10 feet to Speed and your movements become clumsy and inexact. You take a -1 status penalty to Dexterity-based checks and DCs, including AC, Reflex saves, ranged attack rolls, and skill checks using Acrobatics, Stealth, and Thievery.
            </div>
          )}

          {isOverencumbered && (
            <div className="bulk-warning severe">
              Overencumbered: -15 feet to Speed and your movements become clumsy and inexact. You take a -2 status penalty to Dexterity-based checks and DCs, including AC, Reflex saves, ranged attack rolls, and skill checks using Acrobatics, Stealth, and Thievery.
            </div>
          )}

          {inventory.length > 0 ? (
            <BagGrid
              inventory={gridInventory}
              worn={worn}
              stow={stow}
              moveToContainer={moveToContainer}
              onItemClick={onItemClick}
            />
          ) : (
            <div className="inventory-grid-empty">No items in inventory</div>
          )}
        </div>
      </DndProvider>

      <GiveGoldModal
        isOpen={giveOpen}
        onClose={() => setGiveOpen(false)}
        character={character}
      />
    </div>
  );
};

export default InventoryTab;
