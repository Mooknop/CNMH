// src/utils/InventoryUtils.js
// Utility functions for inventory and container calculations

/**
 * Convert pounds to Bulk as per PF2E rules
 * @param {number} pounds - Weight in pounds
 * @returns {number} - Equivalent Bulk value
 */
export const poundsToBulk = (pounds) => {
if (!pounds || pounds < 0.1) return 0; // Negligible Bulk
if (pounds < 1) return 0.1; // Light (L) Bulk
return pounds;
};

/**
 * Format Bulk for display
 * @param {number} bulk - Bulk value
 * @returns {string} - Formatted bulk string
 */
export const formatBulk = (bulk) => {
if (bulk === 0) return '—'; // Negligible
if (bulk < 1) return 'L'; // Light Bulk
return bulk.toString(); // Regular Bulk
};

/**
 * Calculate total Bulk of items
 * @param {Array} items - Array of items
 * @returns {number} - Total bulk
 */
export const calculateItemsBulk = (items) => {
if (!items || !Array.isArray(items)) return 0;

return items.reduce((total, item) => {
    // Calculate this item's bulk
    const itemBulk = poundsToBulk(item.weight) * (item.quantity || 1);
    
    // If item has contents, recursively calculate their bulk too
    let contentsBulk = 0;
    if (item.container && Array.isArray(item.container.contents)) {
    contentsBulk = calculateItemsBulk(item.container.contents);
    }
    
    // Apply ignored bulk if this is a container
    const ignoredBulk = item.container?.ignored || 0;
    const adjustedContentsBulk = Math.max(0, contentsBulk - ignoredBulk);
    
    return total + itemBulk + adjustedContentsBulk;
}, 0);
};

/**
 * Calculate bulk for a specific container
 * @param {Object} container - Container object with contents
 * @returns {Object} - Object with contentsBulk, capacity, and percentFull
 */
export const calculateContainerBulk = (container) => {
if (!container || !container.contents) {
    return { contentsBulk: 0, capacity: 0, percentFull: 0 };
}

const contentsBulk = calculateItemsBulk(container.contents);
const capacity = container.capacity || 0;
const percentFull = capacity > 0 ? (contentsBulk / capacity) * 100 : 0;

return {
    contentsBulk,
    capacity,
    percentFull: Math.min(percentFull, 100)
};
};

/**
 * Check if an item is a container
 * @param {Object} item - Item to check
 * @returns {boolean} - True if item is a container
 */
export const isContainer = (item) => {
return !!item && !!item.container;
};

/**
 * Format to a decimal place if needed
 * @param {number} value - Value to format
 * @returns {string} - Formatted value
 */
export const formatDecimal = (value) => {
return parseFloat(value).toFixed(1).replace(/\.0$/, '');
};

/**
 * Get level-based DC
 */
export const getLevelBasedDc = (level) => {
    switch (level){
      case 1:
        return 15;
      case 2:
        return 16;
      case 3:
        return 18;
      case 4:
        return 19;
      case 5:
        return 20;
      case 6:
        return 22;
      case 7:
        return 23;
      case 8:
        return 24;
      case 9:
        return 26;
      case 10:
        return 27;
      case 11:
        return 28;
      case 12:
        return 30;
      case 13:
        return 31;
      case 14:
        return 32;
      case 15:
        return 34;
      case 16:
        return 35;
      case 17:
        return 36;
      case 18:
        return 38;
      case 19:
        return 39;
      case 20:
        return 40;
      default:
        return 0;
    }
};