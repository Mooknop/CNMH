// src/components/actions/ActionsList.js
import React, { useCallback, useState } from 'react';
import CharacterActionsList from './CharacterActionsList';
import ReactionsList from './ReactionsList';
import FreeActionsList from './FreeActionsList';
import MagicModal from '../spells/MagicModal';
import UseAbilityModal from '../encounter/UseAbilityModal';
import TreatWoundsModal from '../encounter/TreatWoundsModal';
import HuntPreyModal from '../encounter/HuntPreyModal';
import SkillActionModal from '../encounter/SkillActionModal';
import { skillActionsFor } from '../../data/skillActions';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';
import { useCharacter } from '../../hooks/useCharacter';
import { useGrantedActions } from '../../hooks/useGrantedActions';
import { useStance } from '../../hooks/useStance';
import './ActionsList.css';

const ActionsList = ({ character, characterColor }) => {
  const [activeSection, setActiveSection] = useState('actions');
  const [isMagicOpen, setIsMagicOpen] = useState(false);
  const [usingAbility, setUsingAbility] = useState(null); // { ability, cost } | null
  const [treatWoundsMode, setTreatWoundsMode] = useState(null); // 'battle-medicine' | 'staunch-bleeding' | null
  const [huntPreyCost, setHuntPreyCost] = useState(null); // action cost when the Hunt Prey modal is open, else null
  const [skillAction, setSkillAction] = useState(null); // a skillActions.js entry while its modal is open, else null

  const { encounter, appendLog } = useEncounter();
  const { spendActions, spendReaction } = useTurnState(character.id);
  const { flags } = useCharacter(character);
  const hasMagic = flags.hasSpellcasting || flags.hasFocusSpells || flags.hasInnateSpells
    || flags.hasScrolls || flags.hasWands || flags.hasStaff || flags.hasEldPowers || flags.hasHarrowing;
  const { grantedActions, removeGrantedAction } = useGrantedActions(character.id);
  const { enter: enterStance } = useStance(character.id);

  const encounterMode = !!(encounter && encounter.active && encounter.phase === 'in-progress');

  const themeColor = characterColor || 'var(--color-primary)';

  // Player-initiated skill actions (#260) — Demoralize today. Only in encounter.
  const skillActions = skillActionsFor(character, { encounterMode });

  const handleUse = useCallback(
    (item, cost) => {
      // Battle Medicine has its own resolution flow.
      if (item.name === 'Battle Medicine') {
        setTreatWoundsMode('battle-medicine');
        return;
      }

      // Staunch Bleeding (#224) — a Treat Wounds variant that stops bleeding;
      // routes to the same modal in its own mode (handles its 1–2 action cost).
      if (item.name === 'Staunch Bleeding') {
        setTreatWoundsMode('staunch-bleeding');
        return;
      }

      // Hunt Prey (#223) — designating prey picks an enemy and sets synced
      // state; the modal handles the pick + the 1-action spend in encounter.
      if (item.name === 'Hunt Prey') {
        setHuntPreyCost(encounterMode ? 1 : 0);
        return;
      }

      // Stances (#224) — entering toggles synced state and spends the action;
      // there's no target or roll, so skip the modal. Entering a new stance
      // overwrites any current one (you can only be in one stance).
      if (item.traits?.includes('Stance')) {
        enterStance(item.name);
        if (encounterMode) {
          spendActions(cost, item.name);
          appendLog({
            type: 'action',
            charId: character.id,
            text: `${character.name} entered ${item.name} (${cost} act)`,
          });
        } else {
          appendLog({
            type: 'action',
            charId: character.id,
            text: `${character.name} entered ${item.name}`,
          });
        }
        return;
      }

      // Open the targeting modal in encounter mode unless the action explicitly
      // opts out (requiresTarget: false — pure movement like Stride, Stand, etc.).
      if (encounterMode && item.requiresTarget !== false) {
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
    [character.id, character.name, spendActions, spendReaction, appendLog, encounterMode, enterStance]
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

      {encounterMode && skillActions.length > 0 && (
        <div className="granted-actions-section" aria-label="Skill actions">
          <h3 className="granted-actions-title">Skill Actions</h3>
          {skillActions.map((sa) => (
            <div key={sa.id} className="granted-action-row">
              <span className="granted-action-name">{sa.name}</span>
              <button
                className="btn-encounter-use"
                aria-label={`Use ${sa.name}`}
                onClick={() => setSkillAction(sa)}
              >
                Use ({sa.actionCost} act)
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

      {treatWoundsMode && (
        <TreatWoundsModal
          isOpen
          onClose={() => setTreatWoundsMode(null)}
          mode={treatWoundsMode}
          healer={character}
          themeColor={themeColor}
          actionCost={treatWoundsMode === 'battle-medicine' && encounterMode ? 1 : 0}
        />
      )}

      {huntPreyCost !== null && (
        <HuntPreyModal
          isOpen
          onClose={() => setHuntPreyCost(null)}
          character={character}
          themeColor={themeColor}
          actionCost={huntPreyCost}
        />
      )}

      {skillAction && (
        <SkillActionModal
          isOpen
          onClose={() => setSkillAction(null)}
          action={skillAction}
          character={character}
          themeColor={themeColor}
        />
      )}
    </div>
  );
};

export default ActionsList;
