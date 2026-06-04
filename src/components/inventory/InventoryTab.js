import React, { useState } from 'react';
import './InventoryTab.css';
import './ItemCard.css';
import ItemCard from './ItemCard';
import ContainersList from './ContainersList';
import { formatBulk, getBulkStatus } from '../../utils/InventoryUtils';
import CraftingModal from './CraftingModal';
import { useCharacter } from '../../hooks/useCharacter';

/**
 * Component for displaying character inventory as item cards.
 * Loadout actions (drop/stow/etc.) live in the ItemModal opened on tap.
 * @param {Object} props
 * @param {Object} props.character - Character data
 * @param {string} props.characterColor - Theme color
 * @param {function} props.onItemClick - Handler for item clicks
 */
const InventoryTab = ({ character, characterColor, onItemClick }) => {
  const [isCraftingOpen, setIsCraftingOpen] = useState(false);

  // Data layer — all character reads go through this hook
  const charData = useCharacter(character);
  if (!charData) return null;

  const { bulkStats, totalBulk: bulkUsed, inventory, skillProficiencies } = charData;
  const { bulkLimit, encumberedThreshold } = bulkStats;

  const { percentage: bulkPercentage, isEncumbered, isOverencumbered } = getBulkStatus(bulkUsed, bulkLimit, encumberedThreshold);

  // Determine the color of the bulk bar
  const getBulkBarColor = () => {
    if (isOverencumbered) return 'var(--color-danger)';
    if (isEncumbered) return 'var(--color-warning)';
    if (bulkPercentage > 75) return '#ffc107'; // Yellow when getting close
    return characterColor; // Use character's color theme
  };

  // Sort inventory items alphabetically by name
  const sortedInventory = [...inventory].sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  );

  const hasCrafting = skillProficiencies.crafting > 0;

  return (
    <div className="inventory-tab">
      <div className="inventory-header">
        <h2>Inventory</h2>
        {hasCrafting && (
          <button
            className="btn-primary btn-small crafting-button"
            onClick={() => setIsCraftingOpen(true)}
          >
            <span className="familiar-icon" role="img" aria-label="Crafting">🔨</span>
            Crafting
          </button>
        )}
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
            <ItemCard
              key={item.id || `item-${item.name}`}
              item={item}
              onClick={onItemClick}
            />
          ))
        ) : (
          <div className="item-card-list--empty">No items in inventory</div>
        )}
      </div>

      {/* Display containers section if character has any */}
      <ContainersList
        inventory={sortedInventory}
        themeColor={characterColor}
        onItemClick={onItemClick}
      />

      {/* Crafting Modal */}
      <CraftingModal
        isOpen={isCraftingOpen}
        onClose={() => setIsCraftingOpen(false)}
        character={character}
        characterColor={characterColor}
      />
    </div>
  );
};

export default InventoryTab;
