import React, { useState, useMemo, useContext } from 'react';
import ReactDOM from 'react-dom';
import { CharacterContext } from '../contexts/CharacterContext';
import CharacterInventorySection from '../components/party/CharacterInventorySection';
import ItemModal from '../components/inventory/ItemModal';
import { getCharacterColor } from '../utils/CharacterUtils';
import { calculateItemsBulk, formatBulk, poundsToBulk } from '../utils/InventoryUtils';
import './PartyWealth.css';

const formatCurrency = (value) => {
  // Round to 2 decimal places and remove trailing zeros
  return parseFloat(value.toFixed(2)).toString();
};

// Portal component for the modal
const ItemModalPortal = ({ children }) => {
  return ReactDOM.createPortal(
    children,
    document.body
  );
};

const PartyWealth = () => {
  const PartyGold = 41; // Party gold constant
  const { characters } = useContext(CharacterContext);
  const [sortBy, setSortBy] = useState('name');
  const [searchTerm, setSearchTerm] = useState('');
  const [showContainerItems, setShowContainerItems] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);

  // Handle opening the item detail modal
  const handleItemClick = (item) => {
    setSelectedItem(item);
    setIsItemModalOpen(true);
  };

  // Handle closing the item detail modal
  const closeItemModal = () => {
    setIsItemModalOpen(false);
    setSelectedItem(null);
  };

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
        
        // Check if item is a container with contents
        if (item.contents && Array.isArray(item.contents) && item.contents.length > 0) {
          extractAllItems(
            item.contents, 
            character, 
            charIndex, 
            `container-${itemIndex}`,
            item.name
          );
        }
      });
    };
    
    // Extract items from each character
    characters.forEach((character, charIndex) => {
      if (character.inventory) {
        extractAllItems(character.inventory, character, charIndex);
      }
    });
    
    return items;
  }, [characters]);

  // Calculate party totals
  const partyTotals = useMemo(() => {
    const visibleItems = showContainerItems 
      ? allPartyItems 
      : allPartyItems.filter(item => !item.isInContainer);
      
    return {
      totalValue: visibleItems.reduce((sum, item) => sum + (item.totalValue || 0), 0),
      totalBulk: visibleItems.reduce((sum, item) => sum + (item.totalBulk || 0), 0),
      totalItems: visibleItems.length
    };
  }, [allPartyItems, showContainerItems]);

  return (
    <>
      <div className="party-wealth-page">
        <div className="party-wealth-content">
          <div className="party-wealth-header">
            <h1>Party Wealth & Inventory</h1>
            <div className="party-totals">
              <span className="total-value">💰 {formatCurrency(PartyGold)} gp</span>
              <span className="total-value">📦 {formatCurrency(partyTotals.totalValue)} gp</span>
              <span className="total-bulk">⚖️ {formatBulk(partyTotals.totalBulk)} Bulk</span>
              <span className="total-items">📋 {partyTotals.totalItems} items</span>
            </div>
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
              {/* <label>
                <input
                  type="checkbox"
                  checked={showContainerItems}
                  onChange={(e) => setShowContainerItems(e.target.checked)}
                />
                Show items in containers
              </label> */}
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
                onItemClick={handleItemClick}
                sortBy={sortBy}
                searchTerm={searchTerm}
                showContainerItems={showContainerItems}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Item Detail Modal - Rendered through Portal */}
      {selectedItem && (
        <ItemModalPortal>
          <ItemModal
            isOpen={isItemModalOpen}
            onClose={closeItemModal}
            item={selectedItem}
            characterColor={selectedItem.characterColor}
          />
        </ItemModalPortal>
      )}
    </>
  );
};

export default PartyWealth;