/**
 * Component for toggling between different spell view modes
 * @param {Object} props
 * @param {string} props.viewMode - Current view mode
 * @param {function} props.setViewMode - Setter for view mode
 * @param {boolean} props.hasSpellcasting - Whether character has spellcasting
 * @param {boolean} props.hasFocus - Whether character has focus spells
 * @param {boolean} props.hasInnate - Whether character has innate spells
 * @param {boolean} props.hasStaff - Whether character has a staff
 * @param {boolean} props.hasScrolls - Whether character has scrolls
 * @param {boolean} props.hasWands - Whether character has wands
 * @param {boolean} props.hasGems - Whether character has gems
 * @param {Object} props.staff - Staff object if available
 * @param {string} props.focusLabel - Label for focus spells button
 * @param {string} props.themeColor - Theme color
 */
const ViewModeToggle = ({ 
  viewMode, 
  setViewMode, 
  hasSpellcasting,
  hasFocus,
  hasInnate,
  hasEldPowers,
  hasStaff, 
  hasScrolls,
  hasWands,
  hasGems,
  staff,
  focusLabel = "Focus Spells",
  themeColor 
}) => {
  return (
    <div className="view-mode-toggle">
      {hasSpellcasting && (
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
      )}
      
      {hasInnate && (
        <button 
          className={`view-mode-btn ${viewMode === 'innate' ? 'active' : ''}`}
          onClick={() => setViewMode('innate')}
          style={{ 
            backgroundColor: viewMode === 'innate' ? themeColor : '',
            borderColor: viewMode === 'innate' ? themeColor : ''
          }}
        >
          Innate
        </button>
      )}
      
      {hasFocus && (
        <button 
          className={`view-mode-btn ${viewMode === 'focus' ? 'active' : ''}`}
          onClick={() => setViewMode('focus')}
          style={{ 
            backgroundColor: viewMode === 'focus' ? themeColor : '',
            borderColor: viewMode === 'focus' ? themeColor : ''
          }}
        >
          {focusLabel}
        </button>
      )}

      {hasEldPowers && (
        <button 
          className={`view-mode-btn ${viewMode === 'eld' ? 'active' : ''}`}
          onClick={() => setViewMode('eld')}
          style={{ 
            backgroundColor: viewMode === 'eld' ? themeColor : '',
            borderColor: viewMode === 'eld' ? themeColor : ''
          }}
        >
          Eld Powers
        </button>
      )}
      
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
      
      {hasGems && (
        <button 
          className={`view-mode-btn ${viewMode === 'gems' ? 'active' : ''}`}
          onClick={() => setViewMode('gems')}
          style={{ 
            backgroundColor: viewMode === 'gems' ? themeColor : '',
            borderColor: viewMode === 'gems' ? themeColor : ''
          }}
        >
          Spell Gems
        </button>
      )}
    </div>
  );
};

export default ViewModeToggle;