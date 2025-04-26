// src/components/shared/CollapsibleCard.js
import React, { useState } from 'react';
import './CollapsibleCard.css';

/**
 * A reusable collapsible card component
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.header - Content for the card header (always visible)
 * @param {React.ReactNode} props.children - Content for the card body (collapsible)
 * @param {string} props.className - Additional CSS class for the card
 * @param {Object} props.style - Inline styles for the card
 * @param {boolean} props.initialExpanded - Whether the card is initially expanded
 * @param {string} props.themeColor - The theme color for styling (optional)
 */
const CollapsibleCard = ({ 
  header, 
  children, 
  className = '', 
  style = {}, 
  initialExpanded = false,
  themeColor = '#5e2929' 
}) => {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  
  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };
  
  return (
    <div className={`collapsible-card ${className}`} style={style}>
      <div 
        className="collapsible-header" 
        onClick={toggleExpand}
        style={{ cursor: 'pointer' }}
      >
        {header}
        <div className="expand-icon" style={{ color: themeColor }}>
          {isExpanded ? '▼' : '▶'}
        </div>
      </div>
      
      {isExpanded && (
        <div className="collapsible-content">
          {children}
        </div>
      )}
    </div>
  );
};

export default CollapsibleCard;