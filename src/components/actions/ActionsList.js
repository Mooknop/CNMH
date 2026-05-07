// src/components/actions/ActionsList.js
import React, { useState } from 'react';
import CharacterActionsList from './CharacterActionsList';
import ReactionsList from './ReactionsList';
import FreeActionsList from './FreeActionsList';
import './ActionsList.css';

const ActionsList = ({ character, characterColor }) => {
  const [activeSection, setActiveSection] = useState('actions');

  const themeColor = characterColor || 'var(--color-primary)';

  return (
    <div className="actions-list">
      <h2 style={{ color: themeColor }}>Encounter</h2>

      <div className="section-tabs">
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

      <div className="section-content">
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