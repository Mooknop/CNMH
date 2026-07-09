// src/components/shared/CollapsibleCard.js
import React, { useState } from 'react';
import './CollapsibleCard.css';

const CollapsibleCard = ({
  header,
  headerRight,
  children,
  className = '',
  style = {},
  initialExpanded = false,
  themeColor = 'var(--color-primary)'
}) => {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);

  return (
    <div className={`collapsible-card ${className}`} style={style}>
      <div className="collapsible-header">
        <div
          className="collapsible-toggle"
          onClick={() => setIsExpanded(prev => !prev)}
        >
          {header}
          <div className="expand-icon" style={{ '--collapsible-accent': themeColor }}>
            {isExpanded ? '▼' : '▶'}
          </div>
        </div>
        {headerRight && (
          <div
            className="collapsible-header-right"
            onClick={(e) => e.stopPropagation()}
          >
            {headerRight}
          </div>
        )}
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