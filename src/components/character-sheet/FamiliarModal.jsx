import React, { useState } from 'react';
import Modal from '../shared/Modal';
import ConditionModal from './ConditionModal';
import PenaltyDisplay from '../shared/PenaltyDisplay';
import { computeConditionEffects } from '../../utils/ConditionUtils';
import { useMinions } from '../../hooks/useMinions';
import { MINION_FAMILIAR } from '../../utils/minionUtils';
import MinionSpawnButton from '../encounter/MinionSpawnButton';
import './FamiliarModal.css';

const FamiliarModal = ({ isOpen, onClose, familiar, character, characterColor }) => {
  const [activeConditions, setActiveConditions] = useState([]);
  const [isConditionModalOpen, setIsConditionModalOpen] = useState(false);
  const { getHp } = useMinions(character?.id);

  // Keep mounted (state preserved) while Modal handles the visual hide
  if (!familiar || !character) return null;

  const themeColor = characterColor || 'var(--color-primary)';
  const familiarData = familiar;

  // Familiar conditions affect its own AC, Speed, and its use of the master's saves
  const effects = computeConditionEffects(activeConditions, '', character.level);

  const handleAdd = (condition) => {
    setActiveConditions((prev) => {
      const existing = prev.find((c) => c.id === condition.id);
      if (existing) {
        if (!condition.valued) return prev;
        return prev.map((c) =>
          c.id === condition.id
            ? { ...c, value: Math.min(c.value + 1, c.maxValue) }
            : c
        );
      }
      return [...prev, { ...condition, value: condition.valued ? 1 : null }];
    });
  };

  const handleRemove = (id) => setActiveConditions((prev) => prev.filter((c) => c.id !== id));

  const handleChangeValue = (id, delta) => {
    setActiveConditions((prev) =>
      prev.reduce((acc, c) => {
        if (c.id !== id) return [...acc, c];
        const next = c.value + delta;
        if (next <= 0) return acc;
        return [...acc, { ...c, value: Math.min(next, c.maxValue) }];
      }, [])
    );
  };

  const hasConditions = activeConditions.length > 0;

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={familiarData.name} themeColor={themeColor} maxWidth="600px">
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

          <div className="familiar-details">
            {familiarData.skills && (
              <div className="familiar-section">
                <h4 >Skills</h4>
                <p>{familiarData.skills.join(", ")}: +7</p>
                <p>All Other Skills: +3</p>
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
    </>
  );
};

export default FamiliarModal;
