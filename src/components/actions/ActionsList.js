// src/components/actions/ActionsList.js
import React, { useCallback, useState } from 'react';
import CharacterActionsList from './CharacterActionsList';
import ReactionsList from './ReactionsList';
import FreeActionsList from './FreeActionsList';
import MagicModal from '../spells/MagicModal';
import UseAbilityModal from '../encounter/UseAbilityModal';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';
import { useCharacter } from '../../hooks/useCharacter';
import { useGrantedActions } from '../../hooks/useGrantedActions';
import { abilityHasStructuredEffects } from '../../utils/applyAbility';
import './ActionsList.css';

const ActionsList = ({ character, characterColor }) => {
  const [activeSection, setActiveSection] = useState('actions');
  const [isMagicOpen, setIsMagicOpen] = useState(false);
  const [usingAbility, setUsingAbility] = useState(null); // { ability, cost } | null

  const { encounter, appendLog } = useEncounter();
  const { spendActions, spendReaction } = useTurnState(character.id);
  const { flags } = useCharacter(character);
  const hasMagic = flags.hasSpellcasting || flags.hasFocusSpells || flags.hasInnateSpells
    || flags.hasScrolls || flags.hasWands || flags.hasStaff || flags.hasEldPowers || flags.hasHarrowing;
  const { grantedActions, removeGrantedAction } = useGrantedActions(character.id);

  const encounterMode = !!(encounter && encounter.active && encounter.phase === 'in-progress');

  const themeColor = characterColor || 'var(--color-primary)';

  const handleUse = useCallback(
    (item, cost) => {
      // Abilities with structured effects/grants open the targeting modal in encounter mode.
      if (encounterMode && abilityHasStructuredEffects(item)) {
        setUsingAbility({ ability: item, cost });
        return;
      }

      if (cost === 'reaction') {
        spendReaction(item.name);
        appendLog({
          type: 'action',
          charId: character.id,
          text: `${character.name} used ${item.name} (reaction)`,
        });
      } else if (cost === 'free' || cost === 0) {
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
    [character.id, character.name, spendActions, spendReaction, appendLog, encounterMode]
  );

  const handleUseGranted = useCallback(
    (grant) => {
      const cost = grant.action?.cost ?? 1;
      spendActions(cost, grant.action?.name || grant.source);
      appendLog({
        type: 'action',
        charId: character.id,
        text: `${character.name} used ${grant.action?.name || grant.source} (granted, ${cost} act)`,
      });
      removeGrantedAction(grant.id);
    },
    [character.id, character.name, spendActions, appendLog, removeGrantedAction]
  );

  return (
    <div className="actions-list">
      <h2 style={{ color: themeColor }}>Encounter</h2>

      {encounterMode && grantedActions.length > 0 && (
        <div className="granted-actions-section" aria-label="Granted actions">
          <h3 className="granted-actions-title">Granted Actions</h3>
          {grantedActions.map((grant) => (
            <div key={grant.id} className="granted-action-row">
              <span className="granted-action-name">{grant.action?.name || grant.source}</span>
              {grant.action?.description && (
                <span className="granted-action-desc">{grant.action.description}</span>
              )}
              <button
                className="btn-encounter-use"
                aria-label={`Use granted ${grant.action?.name || grant.source}`}
                onClick={() => handleUseGranted(grant)}
              >
                Use ({grant.action?.cost ?? 1} act)
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="section-tabs">
        <button
          className={`section-tab ${activeSection === 'actions' ? 'active' : ''}`}
          onClick={() => setActiveSection('actions')}
        >
          Actions
        </button>
        <button
          className={`section-tab ${activeSection === 'reactions' ? 'active' : ''}`}
          onClick={() => setActiveSection('reactions')}
        >
          Reactions
        </button>
        <button
          className={`section-tab ${activeSection === 'free' ? 'active' : ''}`}
          onClick={() => setActiveSection('free')}
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
            onMagicOpen={hasMagic ? () => setIsMagicOpen(true) : undefined}
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

      {hasMagic && (
        <MagicModal
          isOpen={isMagicOpen}
          onClose={() => setIsMagicOpen(false)}
          character={character}
          themeColor={themeColor}
        />
      )}

      {usingAbility && (
        <UseAbilityModal
          isOpen
          onClose={() => setUsingAbility(null)}
          ability={usingAbility.ability}
          cost={usingAbility.cost}
          verb="Use"
          character={character}
          themeColor={themeColor}
        />
      )}
    </div>
  );
};

export default ActionsList;
