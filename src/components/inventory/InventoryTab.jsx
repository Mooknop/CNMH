import React, { useState } from 'react';
import './InventoryTab.css';
import './InventoryGrid.css';
import GiveGoldModal from './GiveGoldModal';
import BulkBar from './BulkBar';
import BagGrid from './BagGrid';
import AttunedArea from './AttunedArea';
import HandsStrip from './HandsStrip';
import IconTile from './IconTile';
import { DndProvider } from './dnd';
import { getBulkStatus, applyConsumedOverlay, isContainer, flattenInventory } from '../../utils/InventoryUtils';
import { isHeldState } from '../../utils/itemState';
import { stampItemEffects, itemEffectsKey } from '../../utils/itemEffects';
import { affixedKey, affixedUidSet, itemUidOf } from '../../utils/affix';
import { attachedKey, attachedUidSet } from '../../utils/shieldAttach';
import { useCharacter } from '../../hooks/useCharacter';
import { useLoadout } from '../../hooks/useLoadout';
import { useInvested } from '../../hooks/useInvested';
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
  const { worn, stow, moveToContainer, setHands } = useLoadout(character?.id);
  // Attunement overlay — invested items render in the Attuned area instead of
  // their bag (placement is untouched). Eligibility = the Invested trait.
  const { isInvested, attune, unattune } = useInvested(character?.id);
  // Personal gold is live-synced; shown here read-only. Default to the doc's
  // gold so an unset overlay (fresh load / post-reseed) shows the committed
  // value rather than 0 (#670).
  const [gold] = useSyncedState(`cnmh_gold_${character?.id}`, docGold(character));
  // Consumed-consumables overlay — fully-used items disappear from the grid
  // (the GM cleanup tool removes them from authored content later).
  const [consumed] = useSyncedState(`cnmh_consumed_${character?.id}`, {});
  // Item-target effects overlay (oils, #339) — surfaced as a ✨ badge on the tile.
  const [itemEffects] = useSyncedState(itemEffectsKey(character?.id), []);
  // Affixed-talisman overlay (#254/#339) — talisman uid → host uid. Affixed
  // talismans don't get their own tile (they're attached to a host).
  const [affixed] = useSyncedState(affixedKey(character?.id), {});
  // Shield-attachment overlay (#1165 Track 2) — attached weapons render via their
  // host shield, not as their own loose tile (like affixed talismans).
  const [attached] = useSyncedState(attachedKey(character?.id), {});
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
  // a stowed consumable shows its live count and disappears at 0 (#253); stamp
  // any active item-target effects (oils, #339) for the ✨ tile badge; then drop
  // affixed talismans from both levels — they render via their host, not as
  // their own tile.
  const affixedUids = affixedUidSet(affixed);
  const attachedUids = attachedUidSet(attached);
  const notAffixed = (item) => !affixedUids.has(itemUidOf(item)) && !attachedUids.has(itemUidOf(item));
  // Host items (the target of any affixed talisman or shield attachment) get a
  // `hasAttachment` flag so IconTile can mark them with the attachment medallion —
  // the visual counterpart to the child now living inside the host's card.
  const hostUids = new Set(
    [...Object.values(affixed || {}), ...Object.values(attached || {})].filter(Boolean),
  );
  const stampHosts = (items) =>
    items.map((it) => (hostUids.has(itemUidOf(it)) ? { ...it, hasAttachment: true } : it));
  const prep = (items) =>
    stampHosts(stampItemEffects(applyConsumedOverlay(items, consumed).filter(notAffixed), itemEffects));
  const gridInventory = prep(inventory).map((item) =>
    isContainer(item)
      ? { ...item, container: { ...item.container, contents: prep(item.container.contents) } }
      : item
  );

  // Invested items render in the Attuned area and held items in the Hands strip
  // (wherever they physically live), so pull both out of the bags. Invested wins
  // over held so an item never renders in two places. Containers are never
  // invested/held and always stay.
  const flatGrid = flattenInventory(gridInventory);
  const investedItems = flatGrid.filter((it) => isInvested(it.uid));
  const heldItems = flatGrid.filter((it) => isHeldState(it.state) && !isInvested(it.uid));
  const elsewhere = new Set([...investedItems, ...heldItems].map((it) => it.uid));
  const inBag = (it) => isContainer(it) || !elsewhere.has(it.uid);
  const bagInventory = gridInventory.filter(inBag).map((it) =>
    isContainer(it)
      ? { ...it, container: { ...it.container, contents: it.container.contents.filter(inBag) } }
      : it
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

      {/* The ghost renders outside the `.inventory-grid` subtree (the provider
          portals it to the root), so wrap it in the same scope or none of the
          `.inventory-grid .icon-tile` sizing applies and the raw <img> balloons
          to its natural resolution. */}
      <DndProvider
        renderGhost={(item) => (
          <span className="inventory-grid">
            <IconTile item={item} size={56} glow={false} />
          </span>
        )}
      >
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
            <>
              <AttunedArea
                items={investedItems}
                attune={attune}
                onItemClick={onItemClick}
              />
              <HandsStrip
                items={heldItems}
                interactive={mode !== 'encounter'}
                setHands={setHands}
                onItemClick={onItemClick}
              />
              <BagGrid
                inventory={bagInventory}
                worn={worn}
                stow={stow}
                moveToContainer={moveToContainer}
                unattune={unattune}
                isInvested={isInvested}
                onItemClick={onItemClick}
              />
            </>
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
