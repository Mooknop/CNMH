// src/components/shared/ActionIcon.js
import React from 'react';
import './ActionIcon.css';

/**
 * Component to render action icons for Pathfinder 2E actions
 * @param {Object} props - Component props
 * @param {string} props.actionText - Text describing the action count (e.g., "One Action", "Two Actions", "One to Three Actions")
 * @param {string} props.color - Color for the icons
 * @param {string} props.size - Size of the icons (small, medium, large)
 * @param {boolean} props.showTooltip - Whether to show tooltips on hover
 * @returns {JSX.Element} - Rendered action icons
 */
const ActionIcon = ({ actionText, color = '#5e2929', size = 'medium', showTooltip = true }) => {
  if (!actionText) return null;
  
  // Convert text to lowercase for consistent parsing
  const text = actionText.toLowerCase();
  
  // Get CSS class based on size prop
  const getSizeClass = () => {
    switch (size) {
      case 'small': return 'action-icon-small';
      case 'large': return 'action-icon-large';
      case 'medium':
      default: return 'action-icon-medium';
    }
  };
  
  // Icon styles and classes
  const sizeClass = getSizeClass();
  const iconStyle = { color };
  
  /**
   * Helper function to convert word numbers to integers
   * @param {string} word - Word representation of a number
   * @returns {number} - Numeric value
   */
  const convertWordToNumber = (word) => {
    const wordMap = {
      'one': 1,
      'two': 2,
      'three': 3,
      '1': 1,
      '2': 2,
      '3': 3
    };
    
    return wordMap[word.toLowerCase()] || 0;
  };
  
  /**
   * Helper function to get action count from text
   * @param {string} text - Text description of actions
   * @returns {number} - Action count
   */
  const getActionCount = (textContent) => {
    // Check for "One Action", "Two Actions", "Three Actions" format
    if (textContent.includes('one action')) return 1;
    if (textContent.includes('two action')) return 2;
    if (textContent.includes('three action')) return 3;
    
    // Check for "1 Action", "2 Actions", "3 Actions" format
    const match = textContent.match(/(\d+)\s+action/i);
    if (match) return parseInt(match[1]);
    
    return 0;
  };
  
  // Special cases for reaction and free action
  if (text.includes('reaction')) {
    return (
      <div className={`action-icon-wrapper reaction-icon ${sizeClass}`}>
        <span className="action-icon" style={iconStyle}>⟳</span>
        {showTooltip && <div className="action-tooltip">Reaction</div>}
      </div>
    );
  }
  
  if (text.includes('free action')) {
    return (
      <div className={`action-icon-wrapper free-action-icon ${sizeClass}`}>
        <span className="action-icon" style={iconStyle}>⟡</span>
        {showTooltip && <div className="action-tooltip">Free Action</div>}
      </div>
    );
  }
  
  // Handle variable action ranges
  if (text.includes('to')) {
    // Pattern: "X to Y actions" or "One to Three Actions"
    const rangeMatch = text.match(/(\w+)\s+to\s+(\w+)/i);
    if (rangeMatch) {
      const startCount = convertWordToNumber(rangeMatch[1]);
      const endCount = convertWordToNumber(rangeMatch[2]);
      
      if (startCount > 0 && endCount > 0) {
        return (
          <div className={`variable-action-count ${sizeClass}`}>
            {Array(startCount).fill().map((_, i) => (
              <div key={`start-${i}`} className="action-icon-wrapper">
                <span className="action-icon" style={iconStyle}>●</span>
                {showTooltip && i === 0 && (
                  <div className="action-tooltip">{`${startCount}-${endCount} Actions`}</div>
                )}
              </div>
            ))}
            <span className="action-range-separator" style={{ color }}> - </span>
            {Array(endCount).fill().map((_, i) => (
              <div key={`end-${i}`} className="action-icon-wrapper">
                <span className="action-icon" style={iconStyle}>●</span>
              </div>
            ))}
          </div>
        );
      }
    }
  }
  
  // Standard action counts
  const actionCount = getActionCount(text);
  
  if (actionCount > 0) {
    return (
      <div className={`action-count ${sizeClass}`}>
        {Array(actionCount).fill().map((_, i) => (
          <div key={i} className="action-icon-wrapper">
            <span className="action-icon" style={iconStyle}>●</span>
            {showTooltip && i === 0 && (
              <div className="action-tooltip">{`${actionCount} Action${actionCount > 1 ? 's' : ''}`}</div>
            )}
          </div>
        ))}
      </div>
    );
  }
  
  // Default case: just return text description
  return (
    <div className="action-text" style={{ color }}>
      {actionText}
    </div>
  );
};

export default ActionIcon;