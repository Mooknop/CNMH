// src/components/actions/ActionsList.js
import React, { useCallback, useState } from 'react';
import CharacterActionsList from './CharacterActionsList';
import ReactionsList from './ReactionsList';
import FreeActionsList from './FreeActionsList';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';
import './ActionsList.css';

const ActionsList = ({ character, characterColor }) => {
  const [activeSection, setActiveSection] = useState('actions');

  const { encounter, appendLog } = useEncounter();
  const { spendActions, spendReaction } = useTurnState(character.id);

  const encounterMode = !!(encounter && encounter.active && encounter.phase === 'in-progress');

  const themeColor = characterColor || 'var(--color-primary)';

  const handleUse = useCallback(
    (item, cost) => {
      if (cost === 'reaction') {
        spendReaction(item.name);
        appendLog({
          type: 'action',
          charId: character.id,
          text: `${character.name} used ${item.name} (reaction)`,
        });
      } else if (cost === 0) {
        appendLog({
          type: 'action',
          charId: character.id,
          text: `${character.name} used ${item.name} (free action)`,
        });
      } else {
        spendActions(cost, item.name);
        appendLog({
          type: 'action',
          charId: character.id,
          text: `${character.name} used ${item.name} (${cost} act)`,
        });
      }
    },
    [character.id, character.name, spendActions, spendReaction, appendLog]
  );

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
          <CharacterActionsList
            character={character}
            themeColor={themeColor}
            encounterMode={encounterMode}
            onUse={handleUse}
          />
        )}
        {activeSection === 'reactions' && (
          <ReactionsList
            character={character}
            themeColor={themeColor}
            encounterMode={encounterMode}
            onUse={handleUse}
          />
        )}
        {activeSection === 'free' && (
          <FreeActionsList
            character={character}
            themeColor={themeColor}
            encounterMode={encounterMode}
            onUse={handleUse}
          />
        )}
      </div>
    </div>
  );
};

export default ActionsList;
