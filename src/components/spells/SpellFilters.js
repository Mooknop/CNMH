import React from 'react';
import { formatSpellRank } from '../../utils/SpellUtils';

/**
 * Component for spell filtering controls
 * @param {Object} props
 * @param {Array} props.rankList - List of available ranks
 * @param {string} props.activeSpellRank - Currently active rank filter
 * @param {function} props.setActiveSpellRank - Setter for active rank
 * @param {Array} props.defenseTypes - List of available defense types
 * @param {string} props.defenseFilter - Currently active defense filter
 * @param {function} props.setDefenseFilter - Setter for defense filter
 * @param {string} props.themeColor - Theme color
 */
const SpellFilters = ({ 
  rankList, 
  activeSpellRank, 
  setActiveSpellRank, 
  defenseTypes, 
  defenseFilter, 
  setDefenseFilter, 
  themeColor 
}) => {
  return (
    <div className="spell-filters-container">
      {/* Spell rank filter */}
      {(rankList.length > 2 || defenseTypes.length > 2 )&& (<div className="defense-filter">
        {rankList.length > 2 && (
          <div>
            <span className="filter-label" style={{ color: themeColor }}>
              Spell Rank:
            </span>
            <div className="spell-level-tabs">
              {rankList.map(rank => (
                <button
                  key={rank}
                  className={`spell-level-tab ${activeSpellRank === rank ? 'active' : ''}`}
                  onClick={() => setActiveSpellRank(rank)}
                  style={{ 
                    backgroundColor: activeSpellRank === rank ? themeColor : '',
                    borderColor: activeSpellRank === rank ? themeColor : ''
                  }}
                >
                  {formatSpellRank(rank)}
                </button>
              ))}
            </div>
          </div>
        )}
      
        {/* Defense type filter */}
        {defenseTypes.length > 2 && (
          <div>
            <span className="filter-label" style={{ color: themeColor }}>
              Defense:
            </span>
            <div className="defense-buttons">
              {defenseTypes.map(defense => (
                <button
                  key={defense}
                  className={`defense-filter-btn ${defenseFilter === defense ? 'active' : ''}`}
                  onClick={() => setDefenseFilter(defense)}
                  style={{ 
                    backgroundColor: defenseFilter === defense ? themeColor : '',
                    borderColor: defenseFilter === defense ? themeColor : ''
                  }}
                >
                  {defense === 'all' ? 'All' : defense === 'none' ? 'None' : defense}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )}
    </div>
  );
};

export default SpellFilters;