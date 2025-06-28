import CollapsibleCard from '../shared/CollapsibleCard';
import { getCharacterColor } from '../../utils/CharacterUtils';
import { formatBulk } from '../../utils/InventoryUtils';
import { calculateEnhancedBulkLimit } from '../../utils/CharacterUtils';

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
    return calculateEnhancedBulkLimit(character);
  };

  const { bulkLimit, encumberedThreshold, containerBonus } = calculateBulkLimits();

  // Create the header content for the CollapsibleCard
  const headerContent = (
    <div className="character-section-header">
      <div className="character-info">
        <div 
          className="character-name-large" 
          style={{ color: characterColor }}
        >
          {character.name}
        </div>
        <div className="character-class-level">
          {character.class || 'Unknown Class'}
        </div>
      </div>

      <div className="character-wealth-summary">
        <div className="wealth-stat">
          <div className="wealth-label">Value</div>
          <div className="wealth-value">
            {characterTotals.totalValue.toFixed(2)} gp
          </div>
        </div>
        
        <div className="wealth-stat">
          <div className="wealth-label">Bulk</div>
          <div className={`wealth-value`}>
            {formatBulk(characterTotals.totalBulk)} / {bulkLimit}
          </div>
        </div>
        
        <div className="wealth-stat">
          <div className="wealth-label">Items</div>
          <div className="wealth-value">
            {characterTotals.totalItems}
          </div>
        </div>
      </div>
    </div>
  );

  // Create the collapsible content
  const collapsibleContent = (
    <>
      {/* Character's Inventory Table */}
      {sortedItems.length > 0 ? (
        <div className="character-inventory-table-container">
          <table className="character-inventory-table">
            <thead>
              <tr>
                <th className="item-header">Item</th>
                <th className="quantity-header">Qty</th>
                <th className="bulk-header">Bulk</th>
                <th className="value-header">Value</th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item, idx) => (
                <tr 
                  key={item.uniqueId}
                  className="inventory-row" 
                  onClick={() => onItemClick && onItemClick(item)}
                  style={{ cursor: onItemClick ? 'pointer' : 'default' }}
                >
                  <td className="item-cell">
                    <div className="item-name">{item.name}</div>
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
    </>
  );

  // Return the CollapsibleCard wrapping the entire character section
  return (
    <CollapsibleCard
      className="character-inventory-section"
      header={headerContent}
      themeColor={characterColor}
      initialExpanded={false} // Start collapsed by default
    >
      {collapsibleContent}
    </CollapsibleCard>
  );
};

export default CharacterInventorySection;