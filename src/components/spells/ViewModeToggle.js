import React from 'react';

/**
 * Component for toggling between different spell view modes
 * @param {Object} props
 * @param {string} props.viewMode - Current view mode
 * @param {function} props.setViewMode - Setter for view mode
 * @param {boolean} props.hasStaff - Whether character has a staff
 * @param {boolean} props.hasScrolls - Whether character has scrolls
 * @param {boolean} props.hasWands - Whether character has wands
 * @param {Object} props.staff - Staff object if available
 * @param {string} props.themeColor - Theme color
 */
const ViewModeToggle = ({ 
  viewMode, 
  setViewMode, 
  hasStaff, 
  hasScrolls,
  hasWands, 
  staff, 
  themeColor 
}) => {
  return (
    <div className="view-mode-toggle">
      <button 
        className={`view-mode-btn ${viewMode === 'spells' ? 'active' : ''}`}
        onClick={() => setViewMode('spells')}
        style={{ 
          backgroundColor: viewMode === 'spells' ? themeColor : '',
          borderColor: viewMode === 'spells' ? themeColor : ''
        }}
      >
        Repertoire
      </button>
      
      {hasStaff && (
        <button 
          className={`view-mode-btn ${viewMode === 'staff' ? 'active' : ''}`}
          onClick={() => setViewMode('staff')}
          style={{ 
            backgroundColor: viewMode === 'staff' ? themeColor : '',
            borderColor: viewMode === 'staff' ? themeColor : ''
          }}
        >
          {staff.name}
        </button>
      )}
      
      {hasScrolls && (
        <button 
          className={`view-mode-btn ${viewMode === 'scrolls' ? 'active' : ''}`}
          onClick={() => setViewMode('scrolls')}
          style={{ 
            backgroundColor: viewMode === 'scrolls' ? themeColor : '',
            borderColor: viewMode === 'scrolls' ? themeColor : ''
          }}
        >
          Scrolls
        </button>
      )}
      
      {hasWands && (
        <button 
          className={`view-mode-btn ${viewMode === 'wands' ? 'active' : ''}`}
          onClick={() => setViewMode('wands')}
          style={{ 
            backgroundColor: viewMode === 'wands' ? themeColor : '',
            borderColor: viewMode === 'wands' ? themeColor : ''
          }}
        >
          Wands
        </button>
      )}
    </div>
  );
};

export default ViewModeToggle;