// src/components/actions/ActionsList.js
import React, { useState } from 'react';
import CollapsibleCard from '../shared/CollapsibleCard';
import TraitTag from '../shared/TraitTag';
import ActionIcon from '../shared/ActionIcon';
import StrikesList from './StrikesList';
import CharacterActionsList from './CharacterActionsList';
import ReactionsList from './ReactionsList';
import FreeActionsList from './FreeActionsList';
import './ActionsList.css';

/**
 * Main component for displaying all character action types
 * @param {Object} props - Component props
 * @param {Object} props.character - Character data
 * @param {string} props.characterColor - Character color theme
 */
const ActionsList = ({ character, characterColor }) => {
  const [activeSection, setActiveSection] = useState('strikes');
  
  // Use the characterColor or default to the theme color
  const themeColor = characterColor || '#5e2929';
  
  return (
    <div className="actions-list">
      <h2 style={{ color: themeColor }}>Actions</h2>
      
      {/* Tabs for action categories */}
      <div className="section-tabs">
        <button 
          className={`section-tab ${activeSection === 'strikes' ? 'active' : ''}`}
          onClick={() => setActiveSection('strikes')}
          style={{ backgroundColor: activeSection === 'strikes' ? themeColor : '' }}
        >
          Strikes
        </button>
        <button 
          className={`section-tab ${activeSection === 'actions' ? 'active' : ''}`}
          onClick={() => setActiveSection('actions')}
          style={{ backgroundColor: activeSection === 'actions' ? themeColor : '' }}
        >
          Actions
        </button>
        <button 
          className={`section-tab ${activeSection === 'reactions' ? 'active' : ''}`}
          onClick={() => setActiveSection('reactions')}
          style={{ backgroundColor: activeSection === 'reactions' ? themeColor : '' }}
        >
          Reactions
        </button>
        <button 
          className={`section-tab ${activeSection === 'free' ? 'active' : ''}`}
          onClick={() => setActiveSection('free')}
          style={{ backgroundColor: activeSection === 'free' ? themeColor : '' }}
        >
          Free Actions
        </button>
      </div>
      
      {/* Content container */}
      <div className="section-content">
        {activeSection === 'strikes' && (
          <StrikesList character={character} themeColor={themeColor} />
        )}
        {activeSection === 'actions' && (
          <CharacterActionsList character={character} themeColor={themeColor} />
        )}
        {activeSection === 'reactions' && (
          <ReactionsList character={character} themeColor={themeColor} />
        )}
        {activeSection === 'free' && (
          <FreeActionsList character={character} themeColor={themeColor} />
        )}
      </div>
    </div>
  );
};

export default ActionsList;