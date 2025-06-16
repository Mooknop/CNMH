import React, { useState, useMemo, useContext } from 'react';
import { CharacterContext } from '../../contexts/CharacterContext';
import { getCharacterColor } from '../../utils/CharacterUtils';
import { calculateItemsBulk, formatBulk, poundsToBulk } from '../../utils/InventoryUtils';
import TraitTag from '../shared/TraitTag';
import './PartyWealthModal.css';

/**
 * Modal component for displaying combined party inventory
 * Follows Pathfinder 2E rules for item management and bulk calculation
 */
const PartyWealthModal = ({ isOpen, onClose, onItemClick, gold }) => {
  const { characters } = useContext(CharacterContext);
  const [sortBy, setSortBy] = useState('name'); // name, character, bulk, value
  const [searchTerm, setSearchTerm] = useState('');

  // Aggregate all items from all characters with character context
  const allPartyItems = useMemo(() => {
    const items = [];
    
    characters.forEach((character, charIndex) => {
      if (character.inventory && Array.isArray(character.inventory)) {
        character.inventory.forEach((item, itemIndex) => {
          // Add character context to each item
          const itemWithContext = {
            ...item,
            characterName: character.name,
            characterColor: getCharacterColor(charIndex),
            characterId: character.id,
            uniqueId: `${character.id}-${itemIndex}`, // Unique identifier for React keys
            totalValue: (item.price || 0) * (item.quantity || 1),
            singleBulk: formatBulk(poundsToBulk(item.weight || 0)),
            totalBulk: calculateItemsBulk([item])
          };
          items.push(itemWithContext);
        });
      }
    });
    
    return items;
  }, [characters]);

  // Calculate party totals
  const partyTotals = useMemo(() => {
    const totalValue = allPartyItems.reduce((sum, item) => sum + (item.totalValue || 0), 0);
    const totalBulk = allPartyItems.reduce((sum, item) => sum + (item.totalBulk || 0), 0);
    const totalItems = allPartyItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
    
    return {
      totalValue,
      totalBulk: formatBulk(totalBulk),
      totalItems,
      uniqueItems: allPartyItems.length
    };
  }, [allPartyItems]);

  // Sort items
  const sortedItems = useMemo(() => {
    const items = allPartyItems;
    
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
        case 'name':
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return items;
  }, [sortBy]);

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
                  <option value="bulk">Bulk</option>
                  <option value="value">Value</option>
                </select>
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
                {searchTerm && (
                  <button 
                    onClick={() => setSearchTerm('')}
                    className="clear-search-button"
                  >
                    Clear Search
                  </button>
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