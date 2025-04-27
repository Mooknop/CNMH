import React, { useState } from 'react';
import './InventoryTab.css';
import { 
  calculateBulkLimit, 
  calculateTotalBulk, 
  formatBulk, 
  poundsToBulk 
} from '../../utils/CharacterUtils';

/**
 * Component for displaying character inventory
 * @param {Object} props
 * @param {Object} props.character - Character data
 * @param {string} props.characterColor - Theme color
 * @param {function} props.onItemClick - Handler for item clicks
 */
const InventoryTab = ({ character, characterColor, onItemClick }) => {
  const [bulkUsed] = useState(calculateTotalBulk(character.inventory));
  
  // Bulk calculations
  const { bulkLimit, encumberedThreshold } = calculateBulkLimit(character);
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
  
  return (
    <div className="inventory-tab">
      <h2 style={{ color: characterColor }}>Inventory</h2>
      
      <div className="bulk-management">
        <div className="bulk-status">
          <div className="bulk-labels">
            <span>Bulk Used: <strong>{formatBulk(bulkUsed.toFixed(1))}</strong></span>
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
              Encumbered: -10 feet to Speed and take a -1 penalty to Strength- and Dexterity-based checks
            </div>
          )}
          
          {isOverencumbered && (
            <div className="bulk-warning severe">
              Overencumbered: -15 feet to Speed, take a -2 penalty to Strength- and Dexterity-based checks, and can't move if your Bulk exceeds twice your Bulk limit
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
            {character.inventory && character.inventory.length > 0 ? (
              character.inventory.map(item => (
                <tr key={item.id || `item-${item.name}`}>
                  <td>
                    <button 
                      className="item-name" 
                      onClick={() => onItemClick(item)}
                      style={{ color: characterColor }}
                    >
                      {item.name}
                    </button>
                  </td>
                  <td>{item.quantity}</td>
                  <td>
                    {formatBulk(poundsToBulk(item.weight))}
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
    </div>
  );
};

export default InventoryTab;