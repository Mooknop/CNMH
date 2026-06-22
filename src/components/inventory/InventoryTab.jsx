import React, { useState } from 'react';
import './InventoryTab.css';
import './ItemCard.css';
import ItemRow from './ItemRow';
import ContainersList from './ContainersList';
import GiveGoldModal from './GiveGoldModal';
import { formatBulk, getBulkStatus, applyConsumedOverlay, flattenInventory } from '../../utils/InventoryUtils';
import { stampItemEffects, itemEffectsKey } from '../../utils/itemEffects';
import { affixedKey, affixedUidSet, affixedTalismansByHost, itemUidOf } from '../../utils/affix';
import { useCharacter } from '../../hooks/useCharacter';
import { useSyncedState } from '../../hooks/useSyncedState';
import { usePlayMode } from '../../hooks/usePlayMode';
import { docGold } from '../../utils/gold';

/**
 * Component for displaying character inventory as item cards.
 * Loadout actions (drop/stow/etc.) live in the ItemModal opened on tap.
 * Crafting (the recipe browser) now lives in the Downtime tab.
 * @param {Object} props
 * @param {Object} props.character - Character data
 * @param {string} props.characterColor - Theme color
 * @param {function} props.onItemClick - Handler for item clicks
 */
const InventoryTab = ({ character, characterColor, onItemClick }) => {
  // Data layer — all character reads go through this hook
  const charData = useCharacter(character);
  // Personal gold is live-synced; shown here read-only. Default to the doc's
  // gold so an unset overlay (fresh load / post-reseed) shows the committed
  // value rather than 0 (#670).
  const [gold] = useSyncedState(`cnmh_gold_${character?.id}`, docGold(character));
  // Consumed-consumables overlay — fully-used items disappear from the list
  // (the GM cleanup tool removes them from authored content later).
  const [consumed] = useSyncedState(`cnmh_consumed_${character?.id}`, {});
  // Item-target effects overlay (oils, #339) — surfaced as a chip on the item.
  const [itemEffects] = useSyncedState(itemEffectsKey(character?.id), []);
  // Affixed-talisman overlay (#254/#339) — talisman uid → host uid.
  const [affixed] = useSyncedState(affixedKey(character?.id), {});
  // Player-to-player gold transfer (#655) — only out of combat (giving gold is
  // an Interact action in an encounter, out of scope here).
  const { mode } = usePlayMode();
  const canGive = mode === 'exploration' || mode === 'downtime';
  const [giveOpen, setGiveOpen] = useState(false);
  if (!charData) return null;

  const { bulkStats, totalBulk: bulkUsed, inventory } = charData;
  const { bulkLimit, encumberedThreshold } = bulkStats;

  // Affixed talismans render as indented child lines under their host (not as
  // their own line). Resolve over the FULL inventory so a talisman shows under
  // its host wherever the talisman entry physically lives.
  const affixedUids = affixedUidSet(affixed);
  const talismansByHost = affixedTalismansByHost(affixed, flattenInventory(inventory));

  const { percentage: bulkPercentage, isEncumbered, isOverencumbered } = getBulkStatus(bulkUsed, bulkLimit, encumberedThreshold);

  // Determine the color of the bulk bar
  const getBulkBarColor = () => {
    if (isOverencumbered) return 'var(--color-danger)';
    if (isEncumbered) return 'var(--color-warning)';
    if (bulkPercentage > 75) return '#ffc107'; // Yellow when getting close
    return characterColor; // Use character's color theme
  };

  // Hide fully-consumed consumables; show live remaining counts on the rest, and
  // stamp any active item-target effects (oils, #339) for the badge. Sort
  // alphabetically. (Container contents get the same overlays inside
  // ContainerItem via the `consumed`/`itemEffects` props — #253/#339.)
  const sortedInventory = stampItemEffects(applyConsumedOverlay(inventory, consumed), itemEffects)
    .filter((item) => !affixedUids.has(itemUidOf(item)))
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

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
      <div className="bulk-management">
        <div className="bulk-status">
          <div className="bulk-labels">
            <span>Bulk Used: <strong>{formatBulk(bulkUsed)}</strong></span>
            <span>Encumbered at: <strong>{formatBulk(encumberedThreshold)}</strong></span>
            <span>Maximum: <strong>{formatBulk(bulkLimit)}</strong></span>
          </div>

          <div className="bulk-progress-container">
            <div
              className="bulk-progress-bar"
              style={{
                width: `${Math.min(bulkPercentage, 100)}%`,
                backgroundColor: getBulkBarColor()
              }}
            />
          </div>

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
        </div>
      </div>

      <div className="item-card-list">
        {sortedInventory.length > 0 ? (
          sortedInventory.map((item) => (
            <ItemRow
              key={item.id || `item-${item.name}`}
              item={item}
              affixedTalismans={talismansByHost[itemUidOf(item)] || []}
              onItemClick={onItemClick}
            />
          ))
        ) : (
          <div className="item-card-list--empty">No items in inventory</div>
        )}
      </div>

      {/* Display containers section if character has any */}
      <ContainersList
        inventory={sortedInventory}
        consumed={consumed}
        itemEffects={itemEffects}
        affixedUids={affixedUids}
        talismansByHost={talismansByHost}
        themeColor={characterColor}
        onItemClick={onItemClick}
      />

      <GiveGoldModal
        isOpen={giveOpen}
        onClose={() => setGiveOpen(false)}
        character={character}
      />
    </div>
  );
};

export default InventoryTab;
