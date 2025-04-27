import React from 'react';
import './ContainersList.css';
import ContainerItem from './ContainerItem';
import { isContainer } from '../../utils/InventoryUtils';

/**
 * Component to display a list of container items
 * @param {Object} props
 * @param {Array} props.inventory - Character's inventory
 * @param {string} props.themeColor - Theme color
 * @param {function} props.onItemClick - Handler for item clicks
 */
const ContainersList = ({ inventory, themeColor, onItemClick }) => {
  if (!inventory || !Array.isArray(inventory)) {
    return null;
  }
  
  // Filter inventory to only include containers
  const containers = inventory.filter(isContainer);
  
  // If no containers found, don't render anything
  if (containers.length === 0) {
    return null;
  }
  
  return (
    <div className="containers-section">
      <h3 style={{ color: themeColor }}>Containers</h3>
      
      <div className="containers-info">
        <p>
          Containers can reduce the effective Bulk of items stored within them, making them valuable for managing your carrying capacity.
          It takes two actions to retrieve a stowed item, rather than the usual single action for grabbing an item that is worn on your person.
        </p>
      </div>
      
      <div className="containers-list">
        {containers.map((container, index) => (
          <ContainerItem
            key={container.id || `container-${index}`}
            container={container}
            themeColor={themeColor}
            onItemClick={onItemClick}
          />
        ))}
      </div>
    </div>
  );
};

export default ContainersList;