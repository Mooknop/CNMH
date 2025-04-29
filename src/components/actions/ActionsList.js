// src/components/actions/ActionsList.js
import React, { useState, useEffect } from 'react';
import './ActionsList.css';
import StrikesList from './StrikesList';
import CharacterActionsList from './CharacterActionsList';
import ReactionsList from './ReactionsList';
import FreeActionsList from './FreeActionsList';
import { 
  getStrikes, 
  getActions, 
  getReactions, 
  getFreeActions 
} from '../../utils/ActionsUtils';

/**
 * Main component to display character actions with tabs
 * @param {Object} props - Component props
 * @param {Object} props.character - Character data
 * @param {string} props.characterColor - Character color theme
 */
const ActionsList = ({ character, characterColor }) => {
  const [availableSections, setAvailableSections] = useState([]);
  const [activeSection, setActiveSection] = useState(null); // Will be set after determining available sections
  
  // Use the characterColor or default to the theme color
  const themeColor = characterColor || '#5e2929';
  
  // Process character data to determine available sections
  useEffect(() => {
    const sections = [];
    
    // Check for strikes
    const hasStrikes = getStrikes(character).length > 0;
    if (hasStrikes) sections.push('strikes');
    
    // Check for actions
    const hasActions = getActions(character).length > 0;
    if (hasActions) sections.push('actions');
    
    // Check for reactions
    const hasReactions = getReactions(character).length > 0;
    if (hasReactions) sections.push('reactions');
    
    // Check for free actions
    const hasFreeActions = getFreeActions(character).length > 0;
    if (hasFreeActions) sections.push('freeActions');
    
    setAvailableSections(sections);
    
    // Set default active section to the first available one
    if (sections.length > 0 && !activeSection) {
      setActiveSection(sections[0]);
    }
  }, [character, activeSection]);
  
  // If no sections are available, show a message
  if (availableSections.length === 0) {
    return (
      <div className="actions-list">
        <div className="empty-state">
          <p>No actions available for this character.</p>
        </div>
      </div>
    );
  }
  
  // Function to map section ID to label
  const getSectionLabel = (sectionId) => {
    switch(sectionId) {
      case 'strikes': return 'Strikes';
      case 'actions': return 'Actions';
      case 'reactions': return 'Reactions';
      case 'freeActions': return 'Free Actions';
      default: return '';
    }
  };
  
  // Function to render the active section content
  const renderActiveSection = () => {
    switch(activeSection) {
      case 'strikes': 
        return <StrikesList character={character} themeColor={themeColor} />;
      case 'actions': 
        return <CharacterActionsList character={character} themeColor={themeColor} />;
      case 'reactions': 
        return <ReactionsList character={character} themeColor={themeColor} />;
      case 'freeActions': 
        return <FreeActionsList character={character} themeColor={themeColor} />;
      default: 
        return null;
    }
  };
  
  return (
    <div className="actions-list">
      <div className="section-tabs">
        {availableSections.map(section => (
          <button 
            key={section}
            className={`section-tab ${activeSection === section ? 'active' : ''}`}
            onClick={() => setActiveSection(section)}
            style={{ backgroundColor: activeSection === section ? themeColor : '' }}
          >
            {getSectionLabel(section)}
          </button>
        ))}
      </div>
      
      <div className="section-content">
        {renderActiveSection()}
      </div>
    </div>
  );
};

export default ActionsList;