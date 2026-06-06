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
  staff,
  focusLabel = "Focus Spells",
  themeColor,
  hasHarrowing
}) => {
  return (
    <div className="view-mode-toggle">
      {hasSpellcasting && (
        <button
          className={`view-mode-btn ${viewMode === 'spells' ? 'active' : ''}`}
          onClick={() => setViewMode('spells')}
        >
          Repertoire
        </button>
      )}

      {hasInnate && (
        <button
          className={`view-mode-btn ${viewMode === 'innate' ? 'active' : ''}`}
          onClick={() => setViewMode('innate')}
        >
          Innate
        </button>
      )}

      {hasFocus && (
        <button
          className={`view-mode-btn ${viewMode === 'focus' ? 'active' : ''}`}
          onClick={() => setViewMode('focus')}
        >
          {focusLabel}
        </button>
      )}

      {hasEldPowers && (
        <button
          className={`view-mode-btn ${viewMode === 'eld' ? 'active' : ''}`}
          onClick={() => setViewMode('eld')}
        >
          Eld Powers
        </button>
      )}

      {hasHarrowing && (
        <button
          className={`view-mode-btn ${viewMode === 'harrow' ? 'active' : ''}`}
          onClick={() => setViewMode('harrow')}
        >
          Harrowing
        </button>
      )}

      {hasStaff && (
        <button
          className={`view-mode-btn ${viewMode === 'staff' ? 'active' : ''}`}
          onClick={() => setViewMode('staff')}
        >
          {staff.name}
        </button>
      )}

      {hasScrolls && (
        <button
          className={`view-mode-btn ${viewMode === 'scrolls' ? 'active' : ''}`}
          onClick={() => setViewMode('scrolls')}
        >
          Scrolls
        </button>
      )}

      {hasWands && (
        <button
          className={`view-mode-btn ${viewMode === 'wands' ? 'active' : ''}`}
          onClick={() => setViewMode('wands')}
        >
          Wands
        </button>
      )}

    </div>
  );
};

export default ViewModeToggle;
