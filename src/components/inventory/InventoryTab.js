import React, { useState, useEffect } from 'react';
import './InventoryTab.css';
import ContainersList from './ContainersList';
import { 
  calculateItemsBulk, 
  poundsToBulk 
} from '../../utils/InventoryUtils';
import { formatBulk } from '../../utils/CharacterUtils';
import CraftingModal from './CraftingModal';

/**
 * Component for displaying character inventory
 * @param {Object} props
 * @param {Object} props.character - Character data
 * @param {string} props.characterColor - Theme color
 * @param {function} props.onItemClick - Handler for item clicks
 */
const InventoryTab = ({ character, characterColor, onItemClick }) => {
  const [bulkUsed, setBulkUsed] = useState(0);
  const [isCraftingOpen, setIsCraftingOpen] = useState(false);
  
  // Calculate bulk whenever inventory changes
  useEffect(() => {
    if (character && character.inventory) {
      const totalBulk = calculateItemsBulk(character.inventory);
      setBulkUsed(totalBulk);
    }
  }, [character]);
  
  // Bulk calculations for character
  const calculateBulkLimit = () => {
    if (!character || !character.abilities) {
      return { bulkLimit: 0, encumberedThreshold: 0 };
    }
    
    // In PF2E, Bulk limit is equal to Strength ability modifier + 10
    const abilities = character.abilities || {};
    const strMod = Math.floor((abilities.strength - 10 || 0) / 2);
    let bulkLimit = strMod + 10; // Maximum Bulk before becoming overencumbered
    let encumberedThreshold = bulkLimit - 5; // Encumbered after this threshold
    
    // Check if the character has the Hefty Hauler feat
    const hasHeftyHauler = character.feats && character.feats.some(
      feat => feat.name === "Hefty Hauler"
    );
    
    if (hasHeftyHauler) {
      // Hefty Hauler increases both maximum and encumbered Bulk by 2
      bulkLimit += 2;
      encumberedThreshold += 2;
    }
    
    return { bulkLimit, encumberedThreshold };
  };
  
  const { bulkLimit, encumberedThreshold } = calculateBulkLimit();
  const bulkPercentage = (bulkUsed / bulkLimit) * 100;
  const isEncumbered = bulkUsed > encumberedThreshold && bulkUsed <= bulkLimit;
  const isOverencumbered = bulkUsed > bulkLimit;
  
  // Determine the color of the bulk bar
  const getBulkBarColor = () => {
    if (isOverencumbered) return '#b71c1c'; // Red for overencumbered
    if (isEncumbered) return '#f57c00'; // Orange for encumbered
    if (bulkPercentage > 75) return '#ffc107'; // Yellow when getting close
    return characterColor; // Use character's color theme
  };

  // Sort inventory items alphabetically by name
  const getSortedInventory = () => {
    if (!character || !character.inventory || !Array.isArray(character.inventory)) {
      return [];
    }
    
    return [...character.inventory].sort((a, b) => {
      // Compare names case-insensitive
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
  };
  
  const sortedInventory = getSortedInventory();

  const hasCrafting = character.skills?.crafting?.proficiency > 0;
  
  return (
    <div className="inventory-tab">
      <div className="inventory-header">
        <h2 style={{ color: characterColor }}>Inventory</h2>
        {hasCrafting && (
          <button 
            className="crafting-button" 
            onClick={() => setIsCraftingOpen(true)}
            style={{ 
              backgroundColor: characterColor,
              color: 'white',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
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
      
      <div className="inventory-list">
        <table>
          <thead>
            <tr>
              <th style={{ backgroundColor: characterColor }}>Item</th>
              <th style={{ backgroundColor: characterColor }}>Qty</th>
              <th style={{ backgroundColor: characterColor }}>Bulk</th>
            </tr>
          </thead>
          <tbody>
            {sortedInventory.length > 0 ? (
              sortedInventory.map(item => (
                <tr key={item.id || `item-${item.name}`}>
                  <td>
                    <button 
                      className="item-name" 
                      onClick={() => onItemClick(item)}
                      style={{ color: characterColor }}
                    >
                      {item.name}
                      {item.container && (
                        <span className="container-indicator" title="This item is a container">
                          📦
                        </span>
                      )}
                    </button>
                  </td>
                  <td>{item.quantity || 1}</td>
                  <td>
                    {formatBulk(poundsToBulk(item.weight || 0))}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="3" className="empty-inventory">
                  No items in inventory
                </td>
              </tr>
            )}
          </tbody>
        </table>
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