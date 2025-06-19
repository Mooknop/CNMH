import './PartyWealthModal.css';
import CharacterInventorySection from './CharacterInventorySection';
import React, { useState, useMemo, useContext } from 'react';
import { getCharacterColor } from '../../utils/CharacterUtils';
import { CharacterContext } from '../../contexts/CharacterContext';
import { calculateItemsBulk, formatBulk, poundsToBulk } from '../../utils/InventoryUtils';


const formatCurrency = (value) => {
  // Round to 2 decimal places and remove trailing zeros
  return parseFloat(value.toFixed(2)).toString();
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
              <span className="total-value">💰 {formatCurrency(partyTotals.totalValue + (gold || 0))} gp</span>
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