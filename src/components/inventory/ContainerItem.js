import React, { useState } from 'react';
import './ContainerItem.css';
import { 
  calculateContainerBulk, 
  formatBulk, 
  formatDecimal,
  poundsToBulk 
} from '../../utils/InventoryUtils';

/**
 * Component for displaying a container and its contents
 * @param {Object} props
 * @param {Object} props.container - Container item data
 * @param {string} props.themeColor - Theme color
 * @param {function} props.onItemClick - Handler for item clicks
 */
const ContainerItem = ({ container, themeColor, onItemClick }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Bail early if not a container
  if (!container || !container.container) {
    return null;
  }
  
  const { name, quantity = 1 } = container;
  const { capacity, ignored = 0, contents = [] } = container.container;
  
  // Calculate bulk information
  const { contentsBulk, percentFull } = calculateContainerBulk(container.container);
  
  // Determine status and color for progress bar
  const getStatusColor = (percent) => {
    if (percent >= 100) return '#b71c1c'; // Red for full
    if (percent >= 75) return '#f57c00';  // Orange for getting full
    return themeColor;                     // Default theme color
  };
  
  // Toggle expanded state
  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  // Sort the container contents alphabetically by name
  const getSortedContents = () => {
    if (!contents || !Array.isArray(contents)) {
      return [];
    }
    
    return [...contents].sort((a, b) => {
      // Compare names case-insensitive
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
  };
  
  const sortedContents = getSortedContents();
  
  return (
    <div className="container-item">
      <div className="container-header" onClick={toggleExpanded}>
        <div className="container-title">
          <h3 style={{ color: themeColor }}>
            {name} {quantity > 1 && `(${quantity})`}
          </h3>
          <div className="container-status">
            <span className="container-bulk-label">
              {formatBulk(formatDecimal(contentsBulk))} / {formatBulk(capacity)} Bulk
            </span>
            {ignored > 0 && (
              <span className="container-ignored">
                ({formatBulk(ignored)} ignored)
              </span>
            )}
          </div>
        </div>
        <div className="container-toggle">
          <span className="toggle-icon" style={{ color: themeColor }}>
            {isExpanded ? '▼' : '▶'}
          </span>
        </div>
      </div>
      
      {/* Bulk progress bar */}
      <div className="container-bulk-bar-wrapper">
        <div 
          className="container-bulk-bar" 
          style={{ 
            width: `${percentFull}%`,
            backgroundColor: getStatusColor(percentFull)
          }}
        />
      </div>
      
      {/* Contents list - only shown when expanded */}
      {isExpanded && sortedContents.length > 0 && (
        <div className="container-contents">
          <table className="contents-table">
            <thead>
              <tr>
                <th style={{ backgroundColor: themeColor }}>Item</th>
                <th style={{ backgroundColor: themeColor }}>Qty</th>
                <th style={{ backgroundColor: themeColor }}>Bulk</th>
              </tr>
            </thead>
            <tbody>
              {sortedContents.map((item, index) => (
                <tr key={item.id || `container-item-${index}`}>
                  <td>
                    <button 
                      className="item-name" 
                      onClick={() => onItemClick(item)}
                      style={{ color: themeColor }}
                    >
                      {item.name}
                    </button>
                  </td>
                  <td>{item.quantity || 1}</td>
                  <td>
                    {formatBulk(poundsToBulk(item.weight || 0))}
                    {item.quantity > 1 && poundsToBulk(item.weight || 0) > 0 && 
                      ` (total: ${formatBulk(poundsToBulk(item.weight || 0) * item.quantity)})`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      {/* Empty state if expanded but no contents */}
      {isExpanded && contents.length === 0 && (
        <div className="empty-container">
          <p>This container is empty</p>
        </div>
      )}
    </div>
  );
};

export default ContainerItem;