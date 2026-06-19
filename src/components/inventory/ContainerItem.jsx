import React, { useState } from 'react';
import './ContainerItem.css';
import './ItemCard.css';
import ItemCard from './ItemCard';
import {
  calculateContainerBulk,
  formatBulk,
  applyConsumedOverlay,
} from '../../utils/InventoryUtils';

/**
 * Container fold row: header (name + bulk summary) expands to a nested bulk bar
 * and a list of item cards. Loadout actions live in the ItemModal opened on tap.
 * @param {Object} props
 * @param {Object} props.container - Container item data
 * @param {string} props.themeColor - Theme color
 * @param {function} props.onItemClick - Handler for item clicks
 */
const ContainerItem = ({ container, consumed, themeColor, onItemClick }) => {
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
    if (percent >= 100) return 'var(--color-danger)';
    if (percent >= 75) return 'var(--color-warning)';
    return themeColor;                     // Default theme color
  };

  const toggleExpanded = () => setIsExpanded(!isExpanded);

  // Apply the consumed overlay for display (drop fully-used consumables, show
  // remaining counts), then sort alphabetically. The bulk math above still uses
  // the authored contents, mirroring the top-level list where consumed items
  // leave the card list but don't change Bulk (#253).
  const sortedContents = applyConsumedOverlay(contents, consumed).sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  );

  return (
    <div className="container-item">
      <div className="container-header" onClick={toggleExpanded}>
        <div className="container-title">
          <h3>
            {name} {quantity > 1 && `(${quantity})`}
          </h3>
          <div className="container-status">
            <span className="container-bulk-label">
              {formatBulk(contentsBulk)} / {formatBulk(capacity)} Bulk
            </span>
            {ignored > 0 && (
              <span className="container-ignored">
                ({formatBulk(ignored)} ignored)
              </span>
            )}
          </div>
        </div>
        <div className="container-toggle">
          <span className="toggle-icon">{isExpanded ? '▼' : '▶'}</span>
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

      {/* Contents — only shown when expanded */}
      {isExpanded && sortedContents.length > 0 && (
        <div className="container-contents">
          <div className="item-card-list">
            {sortedContents.map((item, index) => (
              <ItemCard
                key={item.id || `container-item-${index}`}
                item={item}
                onClick={onItemClick}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state if expanded but no contents (after the consumed overlay) */}
      {isExpanded && sortedContents.length === 0 && (
        <div className="empty-container">
          <p>This container is empty</p>
        </div>
      )}
    </div>
  );
};

export default ContainerItem;
