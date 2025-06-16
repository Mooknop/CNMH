import React, { useState, useMemo, useContext } from 'react';
import { CharacterContext } from '../../contexts/CharacterContext';
import { getCharacterColor } from '../../utils/CharacterUtils';
import { calculateItemsBulk, formatBulk, poundsToBulk } from '../../utils/InventoryUtils';
import TraitTag from '../shared/TraitTag';
import './PartyWealthModal.css';

const PartyWealthModal = ({ isOpen, onClose, onItemClick, gold }) => {
  const { characters } = useContext(CharacterContext);
  const [sortBy, setSortBy] = useState('name'); // name, character, bulk, value, location
  const [searchTerm, setSearchTerm] = useState('');
  const [showContainerItems, setShowContainerItems] = useState(true);

  // Aggregate all items from all characters with character context
  const allPartyItems = useMemo(() => {
    const items = [];
    
    // Helper function to recursively extract items from inventory, including container contents
    const extractAllItems = (itemArray, character, charIndex, containerContext = null, containerName = null) => {
      if (!itemArray || !Array.isArray(itemArray)) return;
      
      itemArray.forEach((item, itemIndex) => {
        // Add the item itself (whether it's a container or regular item)
        const itemWithContext = {
          ...item,
          characterName: character.name,
          characterColor: getCharacterColor(charIndex),
          characterId: character.id,
          uniqueId: containerContext 
            ? `${character.id}-${containerContext}-${itemIndex}` 
            : `${character.id}-${itemIndex}`,
          totalValue: (item.price || 0) * (item.quantity || 1),
          singleBulk: formatBulk(poundsToBulk(item.weight || 0)),
          totalBulk: calculateItemsBulk([item]),
          // Add context about where this item is stored
          storageLocation: containerContext || 'inventory',
          containerName: containerName,
          isInContainer: !!containerContext
        };
        items.push(itemWithContext);
        
        // If this item is a container with contents, recursively extract those items too
        if (item.container && Array.isArray(item.container.contents) && item.container.contents.length > 0) {
          extractAllItems(
            item.container.contents, 
            character, 
            charIndex, 
            `container-${item.name}-${itemIndex}`,
            item.name
          );
        }
      });
    };
    
    // Process each character's inventory
    characters.forEach((character, charIndex) => {
      if (character.inventory && Array.isArray(character.inventory)) {
        extractAllItems(character.inventory, character, charIndex);
      }
    });
    
    return items;
  }, [characters]);

  // Filter items based on showContainerItems setting
  const filteredItems = useMemo(() => {
    if (showContainerItems) {
      return allPartyItems;
    } else {
      return allPartyItems.filter(item => !item.isInContainer);
    }
  }, [allPartyItems, showContainerItems]);

  // Calculate party totals (always include all items for accurate totals)
  const partyTotals = useMemo(() => {
    const totalValue = allPartyItems.reduce((sum, item) => sum + (item.totalValue || 0), 0);
    const totalBulk = allPartyItems.reduce((sum, item) => sum + (item.totalBulk || 0), 0);
    const totalItems = allPartyItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
    
    return {
      totalValue,
      totalBulk: formatBulk(totalBulk),
      totalItems,
      uniqueItems: allPartyItems.length,
      containerItems: allPartyItems.filter(item => item.isInContainer).length
    };
  }, [allPartyItems]);

  // Sort items
  const sortedItems = useMemo(() => {
    const items = [...filteredItems];
    
    items.sort((a, b) => {
      switch (sortBy) {
        case 'character':
          if (a.characterName !== b.characterName) {
            return a.characterName.localeCompare(b.characterName);
          }
          return a.name.localeCompare(b.name);
        case 'bulk':
          return (b.totalBulk || 0) - (a.totalBulk || 0);
        case 'value':
          return (b.totalValue || 0) - (a.totalValue || 0);
        case 'location':
          if (a.storageLocation !== b.storageLocation) {
            return a.storageLocation.localeCompare(b.storageLocation);
          }
          return a.name.localeCompare(b.name);
        case 'name':
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return items;
  }, [filteredItems, sortBy]);

  if (!isOpen) return null;

  return (
    <div className="party-gold-modal-overlay" onClick={onClose}>
      <div className="party-gold-modal" onClick={(e) => e.stopPropagation()}>
        <div className="party-gold-modal-header">
          <div className="modal-title-section">
            <h2>Party Wealth</h2>
            <div className="party-totals">
              <span className="total-value">💰 {partyTotals.totalValue + gold} gp</span>
              <span className="total-bulk">📦 {partyTotals.totalBulk}</span>
            </div>
          </div>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>

        <div className="party-gold-modal-content">
          {/* Controls Section */}
          <div className="inventory-controls">
            <div className="filter-sort-section">
              <div className="sort-group">
                <label htmlFor="sort-select">Sort by:</label>
                <select 
                  id="sort-select"
                  value={sortBy} 
                  onChange={(e) => setSortBy(e.target.value)}
                  className="sort-select"
                >
                  <option value="name">Name</option>
                  <option value="character">Character</option>
                  <option value="location">Storage Location</option>
                  <option value="bulk">Bulk</option>
                  <option value="value">Value</option>
                </select>
              </div>
              
              <div className="filter-group">
                <label>
                  <input
                    type="checkbox"
                    checked={showContainerItems}
                    onChange={(e) => setShowContainerItems(e.target.checked)}
                  />
                  Show items in containers
                </label>
              </div>
            </div>
          </div>

          {/* Inventory Table */}
          <div className="party-inventory-list">
            {sortedItems.length > 0 ? (
              <table className="party-inventory-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Character</th>
                    <th>Location</th>
                    <th>Qty</th>
                    <th>Bulk</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map(item => (
                    <tr key={item.uniqueId} className="inventory-row">
                      <td className="item-cell">
                        <button 
                          className="item-name-button" 
                          onClick={() => onItemClick && onItemClick(item)}
                          title={`Click to view ${item.name} details`}
                        >
                          {item.name}
                          {item.container && (
                            <span className="container-indicator" title="Container">📦</span>
                          )}
                        </button>
                        {item.traits && item.traits.length > 0 && (
                          <div className="item-traits-row">
                            {item.traits.slice(0, 3).map((trait, index) => (
                              <TraitTag key={index} trait={trait} size="small" />
                            ))}
                            {item.traits.length > 3 && (
                              <span className="trait-overflow">+{item.traits.length - 3} more</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="character-cell">
                        <span 
                          className="character-name"
                          style={{ 
                            color: item.characterColor,
                            fontWeight: 'bold'
                          }}
                        >
                          {item.characterName}
                        </span>
                      </td>
                      <td className="location-cell">
                        {item.isInContainer ? (
                          <span className="container-location" title={`Stored in ${item.containerName}`}>
                            📦 {item.containerName}
                          </span>
                        ) : (
                          <span className="inventory-location">Worn</span>
                        )}
                      </td>
                      <td className="quantity-cell">{item.quantity || 1}</td>
                      <td className="bulk-cell">{item.singleBulk}</td>
                      <td className="value-cell">
                        {item.price ? `${item.totalValue} gp` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-inventory">
                <p>No items found matching your criteria.</p>
                {!showContainerItems && (
                  <p className="filter-hint">Try enabling "Show items in containers" to see more items.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PartyWealthModal;