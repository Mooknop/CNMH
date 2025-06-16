import React, { useState, useMemo, useContext } from 'react';
import { CharacterContext } from '../../contexts/CharacterContext';
import { getCharacterColor } from '../../utils/CharacterUtils';
import { calculateItemsBulk, formatBulk, poundsToBulk } from '../../utils/InventoryUtils';
import TraitTag from '../shared/TraitTag';
import './PartyWealthModal.css';

/**
 * Individual character inventory table component
 */
const CharacterInventorySection = ({ 
  character, 
  characterIndex, 
  items, 
  onItemClick, 
  sortBy,
  searchTerm,
  showContainerItems 
}) => {
  const characterColor = getCharacterColor(characterIndex);
  
  // Filter items for this character
  const characterItems = items.filter(item => item.characterId === character.id);
  
  // Apply search filter
  const filteredItems = characterItems.filter(item => {
    if (!showContainerItems && item.isInContainer) return false;
    if (!searchTerm) return true;
    return item.name.toLowerCase().includes(searchTerm.toLowerCase());
  });
  
  // Sort items for this character
  const sortedItems = [...filteredItems].sort((a, b) => {
    switch (sortBy) {
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

  // Calculate character totals
  const characterTotals = characterItems.reduce((totals, item) => ({
    totalValue: totals.totalValue + (item.totalValue || 0),
    totalBulk: totals.totalBulk + (item.totalBulk || 0),
    totalItems: totals.totalItems + (item.quantity || 1)
  }), { totalValue: 0, totalBulk: 0, totalItems: 0 });

  // Calculate bulk limits for this character (PF2E rules)
  const calculateBulkLimits = () => {
    if (!character.abilities) return { bulkLimit: 10, encumberedThreshold: 5 };
    
    const strMod = Math.floor((character.abilities.strength - 10) / 2);
    let bulkLimit = strMod + 10;
    let encumberedThreshold = bulkLimit - 5;
    
    // Check for Hefty Hauler feat (adds +2 to both limits)
    if (character.feats && character.feats.some(feat => 
      feat.name && feat.name.toLowerCase().includes('hefty hauler'))) {
      bulkLimit += 2;
      encumberedThreshold += 2;
    }
    
    return { bulkLimit, encumberedThreshold };
  };

  const { bulkLimit, encumberedThreshold } = calculateBulkLimits();
  const currentBulk = characterTotals.totalBulk;
  
  // Determine encumbrance status
  const getEncumbranceStatus = () => {
    if (currentBulk >= bulkLimit) return 'overencumbered';
    if (currentBulk >= encumberedThreshold) return 'encumbered';
    return 'normal';
  };

  const encumbranceStatus = getEncumbranceStatus();

  return (
    <div className="character-inventory-section">
      <div className="character-section-header">
        <div className="character-info">
          <div 
            className="character-name-large"
            style={{ color: characterColor }}
          >
            {character.name}
          </div>
          <div className="character-class-level">
            {character.class} {character.level}
          </div>
        </div>
        
        <div className="character-wealth-summary">
          <div className="wealth-stat">
            <span className="wealth-label">💰 Total Value</span>
            <span className="wealth-value">{characterTotals.totalValue} gp</span>
          </div>
          <div className="wealth-stat">
            <span className="wealth-label">📋 Items</span>
            <span className="wealth-value">{characterTotals.totalItems}</span>
          </div>
        </div>
      </div>
      {sortedItems.length > 0 ? (
        <div className="character-inventory-table-container">
          <table className="character-inventory-table">
            <thead>
              <tr>
                <th>Item</th>
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
        </div>
      ) : (
        <div className="empty-character-inventory">
          <p>No items found for {character.name}</p>
          {!showContainerItems && (
            <p className="filter-hint">Try enabling "Show items in containers" to see more items.</p>
          )}
        </div>
      )}
    </div>
  );
};

const PartyWealthModal = ({ isOpen, onClose, onItemClick, gold }) => {
  const { characters } = useContext(CharacterContext);
  const [sortBy, setSortBy] = useState('name');
  const [searchTerm, setSearchTerm] = useState('');
  const [showContainerItems, setShowContainerItems] = useState(true);

  // Aggregate all items from all characters with character context
  const allPartyItems = useMemo(() => {
    const items = [];
    
    // Helper function to recursively extract items from inventory
    const extractAllItems = (itemArray, character, charIndex, containerContext = null, containerName = null) => {
      if (!itemArray || !Array.isArray(itemArray)) return;
      
      itemArray.forEach((item, itemIndex) => {
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
          storageLocation: containerContext || 'inventory',
          containerName: containerName,
          isInContainer: !!containerContext
        };
        items.push(itemWithContext);
        
        // If this item is a container with contents, recursively extract those items
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

  // Calculate party totals
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

  if (!isOpen) return null;

  return (
    <div className="party-gold-modal-overlay" onClick={onClose}>
      <div className="party-gold-modal" onClick={(e) => e.stopPropagation()}>
        <div className="party-gold-modal-header">
          <div className="modal-title-section">
            <h2>Party Wealth & Inventory</h2>
            <div className="party-totals">
              <span className="total-value">💰 {partyTotals.totalValue + (gold || 0)} gp</span>
              <span className="total-bulk">📦 {partyTotals.totalBulk} Bulk</span>
              <span className="total-items">📋 {partyTotals.totalItems} items</span>
            </div>
          </div>

          <button className="modal-close-button" onClick={onClose}>✕</button>
        </div>

        {/* Filter and Sort Controls */}
        <div className="filter-sort-section">
          <div className="search-group">
            <label htmlFor="search-input">🔍 Search Items</label>
            <input
              id="search-input"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter by item name..."
              className="search-input"
            />
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

          <div className="sort-group">
            <label htmlFor="sort-select">Sort by</label>
            <select
              id="sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="sort-select"
            >
              <option value="name">Item Name</option>
              <option value="bulk">Bulk (Heaviest First)</option>
              <option value="value">Value (Highest First)</option>
              <option value="location">Storage Location</option>
            </select>
          </div>
        </div>

        {/* Character Inventory Sections */}
        <div className="character-inventories-container">
          {characters.map((character, index) => (
            <CharacterInventorySection
              key={character.id}
              character={character}
              characterIndex={index}
              items={allPartyItems}
              onItemClick={onItemClick}
              sortBy={sortBy}
              searchTerm={searchTerm}
              showContainerItems={showContainerItems}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default PartyWealthModal;