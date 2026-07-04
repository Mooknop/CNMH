import React, { useState } from 'react';
import Modal from '../shared/Modal';
import ConditionModal from './ConditionModal';
import PenaltyDisplay from '../shared/PenaltyDisplay';
import { computeConditionEffects } from '../../utils/ConditionUtils';
import { hydrateConditions } from '../../data/pf2eConditions';
import { formatModifier } from '../../utils/CharacterUtils';
import { useMinions } from '../../hooks/useMinions';
import { useTurnState } from '../../hooks/useTurnState';
import { useEncounter } from '../../hooks/useEncounter';
import { MINION_FAMILIAR, minionTurnId, familiarSkillBonus } from '../../utils/minionUtils';
import MinionSpawnButton from '../encounter/MinionSpawnButton';
import MinionActionBudget from '../encounter/MinionActionBudget';
import MinionMove from '../encounter/MinionMove';
import FamiliarManeuverModal from '../encounter/FamiliarManeuverModal';
import './FamiliarModal.css';

// Squox Tricks (#223) — the familiar can Disarm and Trip via Acrobatics.
const SQUOX_MANEUVERS = [
  { id: 'disarm', name: 'Disarm' },
  { id: 'trip', name: 'Trip' },
];

const FamiliarModal = ({ isOpen, onClose, familiar, character, characterColor }) => {
  const [isConditionModalOpen, setIsConditionModalOpen] = useState(false);
  const [maneuver, setManeuver] = useState(null); // a SQUOX_MANEUVERS entry while its modal is open
  const { getHp, getConditions, setConditions } = useMinions(character?.id);
  const { encounter } = useEncounter();
  // Granted-action pool (#391): a familiar spends from the actions Command grants
  // it. Hard-blocks Squox maneuvers once the pool is empty, in encounter only.
  const { turnState: familiarTurn } = useTurnState(minionTurnId(character?.id, MINION_FAMILIAR));

  // Keep mounted (state preserved) while Modal handles the visual hide
  if (!familiar || !character) return null;

  const encounterMode = !!(encounter?.active && encounter.phase === 'in-progress');
  const actionsLeft = (familiarTurn?.actionsGranted ?? 0) - (familiarTurn?.actionsSpent ?? 0);
  const maneuversBlocked = encounterMode && actionsLeft <= 0;

  const themeColor = characterColor || 'var(--color-primary)';
  const familiarData = familiar;

  // Skill modifiers (the familiar carries no ability scores; mirror the helper
  // used by the maneuver resolver so display + rolls stay in lockstep).
  const trainedSkillMod = formatModifier(familiarSkillBonus(familiarData.skills?.[0], familiarData, character.level));
  const untrainedSkillMod = formatModifier(familiarSkillBonus('__none__', familiarData, character.level));

  // Squox Tricks lets the familiar Disarm/Trip with Acrobatics (+2 vs off-guard).
  const hasSquoxTricks = (familiarData.abilities || []).some((a) => /squox tricks/i.test(a?.name || ''));

  // Familiar conditions affect its own AC, Speed, and its use of the master's
  // saves. Synced (cnmh_minions_<owner>[familiar].conditions) so they survive
  // reload, surface to the GM, and write back to the Foundry actor (#362). Only
  // the minimal {id,value} is persisted (functions don't serialize); the full
  // catalog objects ConditionModal needs are rehydrated for render/effects.
  const activeConditions = hydrateConditions(getConditions(MINION_FAMILIAR));
  const persistConditions = (list) =>
    setConditions(MINION_FAMILIAR, list.map((c) => ({ id: c.id, value: c.value })));
  const effects = computeConditionEffects(activeConditions, '', character.level);

  const handleAdd = (condition) => {
    const existing = activeConditions.find((c) => c.id === condition.id);
    if (existing) {
      if (!condition.valued) return;
      persistConditions(
        activeConditions.map((c) =>
          c.id === condition.id ? { ...c, value: Math.min(c.value + 1, c.maxValue) } : c
        )
      );
      return;
    }
    persistConditions([...activeConditions, { ...condition, value: condition.valued ? 1 : null }]);
  };

  const handleRemove = (id) =>
    persistConditions(activeConditions.filter((c) => c.id !== id));

  const handleChangeValue = (id, delta) =>
    persistConditions(
      activeConditions.reduce((acc, c) => {
        if (c.id !== id) return [...acc, c];
        const next = c.value + delta;
        if (next <= 0) return acc;
        return [...acc, { ...c, value: Math.min(next, c.maxValue) }];
      }, [])
    );

  const hasConditions = activeConditions.length > 0;

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={familiarData.name} themeColor={themeColor} maxWidth="600px">
        {encounterMode && (
          <MinionActionBudget
            granted={familiarTurn?.actionsGranted ?? 0}
            spent={familiarTurn?.actionsSpent ?? 0}
          />
        )}
        <div className="familiar-basic-info">
          {familiarData.image && (
            <img src={`/api/images/${familiarData.image}`} alt="" className="entity-image" style={familiarData.imagePosition ? { objectPosition: `${familiarData.imagePosition.x}% ${familiarData.imagePosition.y}%` } : undefined} />
          )}
          <div className="familiar-traits">
            <span className="trait-label">Type:</span>
            <span className="trait-value">{familiarData.type}</span>

            <span className="trait-label">Size:</span>
            <span className="trait-value">{familiarData.size}</span>

            {familiarData.traits && (
              <>
                <span className="trait-label">Traits:</span>
                <span className="trait-value">{familiarData.traits.join(", ")}</span>
              </>
            )}
          </div>
        </div>

        <div className="familiar-stats">
          <div className="familiar-defenses">
            <div className="defense">
              <span className="defense-label">AC</span>
              <span className="defense-value">
                <PenaltyDisplay base={familiarData.ac} penalty={effects.ac} />
              </span>
            </div>
            <div className="defense">
              <span className="defense-label">HP</span>
              <span className="defense-value">
                {getHp(MINION_FAMILIAR, familiarData.hp).current}
                <span className="familiar-hp-sep">/</span>
                <PenaltyDisplay base={familiarData.hp} penalty={effects.maxHp} />
              </span>
            </div>
            <div className="defense">
              <span className="defense-label">Speed</span>
              <span className="defense-value">
                <PenaltyDisplay base={familiarData.speed} penalty={effects.speed} />
              </span>
            </div>
            <button
              className={`defense condition-btn${hasConditions ? ' condition-btn--active' : ''}`}
              onClick={() => setIsConditionModalOpen(true)}
            >
              <span className="defense-label">
                Conditions
              </span>
              <span className="defense-value">{hasConditions ? activeConditions.length : '—'}</span>
            </button>
          </div>

          <MinionSpawnButton ownerId={character.id} role={MINION_FAMILIAR} />
          <MinionMove ownerId={character.id} role={MINION_FAMILIAR} />

          {/* Familiars use their master's saves. Guard the block: this modal is
              mounted even while closed, so a master with no `saves` object would
              otherwise crash the whole sheet on an unguarded `.fortitude` read. */}
          {character.saves && (
            <div className="familiar-defenses">
              <div className="defense">
                <span className="defense-label">Fortitude</span>
                <span className="defense-value">
                  <PenaltyDisplay base={character.saves.fortitude} penalty={effects.fort} format="modifier" />
                </span>
              </div>
              <div className="defense">
                <span className="defense-label">Reflex</span>
                <span className="defense-value">
                  <PenaltyDisplay base={character.saves.reflex} penalty={effects.reflex} format="modifier" />
                </span>
              </div>
              <div className="defense">
                <span className="defense-label">Will</span>
                <span className="defense-value">
                  <PenaltyDisplay base={character.saves.will} penalty={effects.will} format="modifier" />
                </span>
              </div>
            </div>
          )}

          <div className="familiar-details">
            {familiarData.skills && (
              <div className="familiar-section">
                <h4 >Skills</h4>
                <p>{familiarData.skills.join(", ")}: {trainedSkillMod}</p>
                <p>All Other Skills: {untrainedSkillMod}</p>
              </div>
            )}

            {hasSquoxTricks && (
              <div className="familiar-section">
                <h4>Squox Tricks</h4>
                <p>Disarm or Trip with Acrobatics; +2 circumstance vs an off-guard target.</p>
                <div className="familiar-maneuvers">
                  {SQUOX_MANEUVERS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="condition-btn"
                      onClick={() => setManeuver(m)}
                      disabled={maneuversBlocked}
                      title={maneuversBlocked ? 'No granted actions left — Command first' : m.name}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {familiarData.senses && (
              <div className="familiar-section">
                <h4 >Senses</h4>
                <p>{familiarData.senses.join(", ")}</p>
              </div>
            )}

            {familiarData.communication && (
              <div className="familiar-section">
                <h4 >Communication</h4>
                <p>{familiarData.communication}</p>
              </div>
            )}

            {familiarData.abilities && (
              <div className="familiar-section">
                <h4 >Familiar Abilities</h4>
                <div className="familiar-abilities-list">
                  {familiarData.abilities.map((ability, index) => (
                    <div key={index} className="familiar-ability">
                      <h5>{ability.name}</h5>
                      <p>{ability.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {familiarData.description && (
              <div className="familiar-section">
                <h4 >Description</h4>
                <p>{familiarData.description}</p>
              </div>
            )}
          </div>
        </div>
      </Modal>

      <ConditionModal
        isOpen={isConditionModalOpen}
        onClose={() => setIsConditionModalOpen(false)}
        themeColor={themeColor}
        activeConditions={activeConditions}
        onAdd={handleAdd}
        onRemove={handleRemove}
        onChangeValue={handleChangeValue}
        highZ
      />

      <FamiliarManeuverModal
        isOpen={!!maneuver}
        onClose={() => setManeuver(null)}
        maneuver={maneuver}
        familiarData={familiarData}
        character={character}
        themeColor={themeColor}
      />
    </>
  );
};

export default FamiliarModal;
