// src/components/character-sheet/AnimalCompanionModal.js
import React, { useState } from 'react';
import Modal from '../shared/Modal';
import ConditionModal from './ConditionModal';
import PenaltyDisplay from '../shared/PenaltyDisplay';
import { getAbilityModifier, getProficiencyBonus, formatModifier } from '../../utils/CharacterUtils';
import { computeConditionEffects } from '../../utils/ConditionUtils';
import { useMinions } from '../../hooks/useMinions';
import { MINION_COMPANION } from '../../utils/minionUtils';
import MinionStrikeModal from '../encounter/MinionStrikeModal';
import MinionSpawnButton from '../encounter/MinionSpawnButton';
import MinionMove from '../encounter/MinionMove';
import { useEncounter } from '../../hooks/useEncounter';
import { useSession } from '../../contexts/SessionContext';
import { applyAbility } from '../../utils/applyAbility';
import './AnimalCompanionModal.css';

const AnimalCompanionModal = ({ isOpen, onClose, animalCompanion, character, characterColor }) => {
  const [activeConditions, setActiveConditions] = useState([]);
  const [isConditionModalOpen, setIsConditionModalOpen] = useState(false);
  const [strikeForRoll, setStrikeForRoll] = useState(null);
  const { getHp } = useMinions(character?.id);
  const { encounter, appendLog } = useEncounter();
  const { getState, sendUpdate } = useSession();

  // Keep mounted so condition state persists across open/close cycles
  if (!animalCompanion || !character) return null;

  const themeColor = characterColor || 'var(--color-primary)';
  const companionData = animalCompanion;

  // Support (#223) — the companion's Support benefit (e.g. Zevira's shadow
  // concealment) is a self-effect on the owner that lasts until the start of
  // their next turn. Only meaningful in an active encounter where the owner has
  // an initiative entry; routed through the shared applyAbility effect path.
  const encounterMode = !!(encounter?.active && encounter.phase === 'in-progress');
  const casterEntryId = (encounter?.order || []).find(
    (e) => e.kind === 'pc' && e.charId === character.id
  )?.entryId || null;
  const canSupport = encounterMode && !!casterEntryId;

  const handleSupport = () => {
    if (!canSupport) return;
    applyAbility({
      ability: {
        name: `${companionData.name} — Support`,
        effects: [{ effectId: 'shadow-hound-support', applyTo: 'self', duration: { until: 'caster-turn-start' } }],
      },
      caster: character,
      casterEntryId,
      targetCharIds: [],
      enemyTargetNames: [],
      order: encounter?.order || [],
      encounter,
      characters: [character],
      getState,
      sendUpdate,
      appendLog,
      verb: 'used',
    });
    appendLog({
      type: 'note',
      charId: character.id,
      text: `${companionData.name}'s Support is ready: until ${character.name}'s next turn, a damaging Strike vs a creature within the hound's reach Conceals both of them from it.`,
    });
  };

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

  const getCompanionAbilityMod = (score) => formatModifier(getAbilityModifier(score || 10));

  // Raw numeric strike bonus so PenaltyDisplay can apply the delta
  const strikeAttackNum = (strike) => {
    const bestAbilityMod = getAbilityModifier(
      Math.max(companionData.abilities?.dexterity ?? 10, companionData.abilities?.strength ?? 10)
    );
    return bestAbilityMod + getProficiencyBonus(strike.proficiency, character.level);
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={companionData.name} themeColor={themeColor} maxWidth="700px">
        <div className="companion-basic-info">
          {companionData.image && (
            <img src={`/api/images/${companionData.image}`} alt="" className="entity-image" style={companionData.imagePosition ? { objectPosition: `${companionData.imagePosition.x}% ${companionData.imagePosition.y}%` } : undefined} />
          )}
          <div className="companion-traits">
            <span className="trait-label">Type:</span>
            <span className="trait-value">{companionData.type}</span>

            <span className="trait-label">Size:</span>
            <span className="trait-value">{companionData.size}</span>

            {companionData.senses && (
              <>
                <span className="trait-label">Senses:</span>
                <span className="trait-value">{companionData.senses}</span>
              </>
            )}
          </div>
        </div>

        <div className="companion-stats">
          {/* Ability Scores */}
          <div className="companion-abilities">
            <h3>Ability Scores</h3>
            <div className="ability-scores">
              <div className="ability">
                <span className="ability-name">STR</span>
                <span className="ability-score">{getCompanionAbilityMod(companionData.abilities?.strength)}</span>
              </div>
              <div className="ability">
                <span className="ability-name">DEX</span>
                <span className="ability-score">{getCompanionAbilityMod(companionData.abilities?.dexterity)}</span>
              </div>
              <div className="ability">
                <span className="ability-name">CON</span>
                <span className="ability-score">{getCompanionAbilityMod(companionData.abilities?.constitution)}</span>
              </div>
              <div className="ability">
                <span className="ability-name">INT</span>
                <span className="ability-score">{getCompanionAbilityMod(companionData.abilities?.intelligence)}</span>
              </div>
              <div className="ability">
                <span className="ability-name">WIS</span>
                <span className="ability-score">{getCompanionAbilityMod(companionData.abilities?.wisdom)}</span>
              </div>
              <div className="ability">
                <span className="ability-name">CHA</span>
                <span className="ability-score">{getCompanionAbilityMod(companionData.abilities?.charisma)}</span>
              </div>
            </div>
          </div>

          {/* Defenses */}
          <div className="companion-defenses">
            <div className="defense">
              <span className="defense-label">AC</span>
              <span className="defense-value">
                <PenaltyDisplay base={companionData.ac} penalty={effects.ac} />
              </span>
            </div>
            <div className="defense">
              <span className="defense-label">HP</span>
              <span className="defense-value">
                {getHp(MINION_COMPANION, companionData.hp).current}
                <span className="companion-hp-sep">/</span>
                <PenaltyDisplay base={companionData.hp} penalty={effects.maxHp} />
              </span>
            </div>
            <div className="defense">
              <span className="defense-label">Speed</span>
              <span className="defense-value">
                <PenaltyDisplay base={companionData.speed} penalty={effects.speed} /> feet
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

          <MinionSpawnButton ownerId={character.id} role={MINION_COMPANION} />
          <MinionMove ownerId={character.id} role={MINION_COMPANION} />

          {/* Saves */}
          <div className="companion-saves">
            <div className="defense">
              <span className="defense-label">Fortitude</span>
              <span className="defense-value">
                <PenaltyDisplay base={companionData.saves?.fortitude || 0} penalty={effects.fort} format="modifier" />
              </span>
            </div>
            <div className="defense">
              <span className="defense-label">Reflex</span>
              <span className="defense-value">
                <PenaltyDisplay base={companionData.saves?.reflex || 0} penalty={effects.reflex} format="modifier" />
              </span>
            </div>
            <div className="defense">
              <span className="defense-label">Will</span>
              <span className="defense-value">
                <PenaltyDisplay base={companionData.saves?.will || 0} penalty={effects.will} format="modifier" />
              </span>
            </div>
          </div>

          <div className="companion-details">
            {/* Skills */}
            {companionData.skills && (
              <div className="companion-section">
                <h4 >Skills</h4>
                <p>{companionData.skills.join(", ")}</p>
              </div>
            )}

            {/* Strikes */}
            {companionData.strikes && companionData.strikes.length > 0 && (
              <div className="companion-section">
                <h4 >Strikes</h4>
                <div className="companion-strikes-list">
                  {companionData.strikes.map((strike, index) => (
                    <button
                      key={index}
                      type="button"
                      className="companion-strike companion-strike--roll"
                      onClick={() => setStrikeForRoll(strike)}
                      title={`Roll ${strike.name}`}
                    >
                      <div className="strike-header">
                        <h5>{strike.name}</h5>
                        <h5 className="strike-details">
                          <PenaltyDisplay
                            base={strikeAttackNum(strike)}
                            penalty={effects.meleeAttack}
                            format="modifier"
                          />
                        </h5>
                        <h5 className="strike-details">
                          {strike.damage} {getCompanionAbilityMod(companionData.abilities?.strength)}
                        </h5>
                        <div className="strike-traits">
                          {strike.traits && strike.traits.map((trait, i) => (
                            <span key={i} className="trait-tag">{trait}</span>
                          ))}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Support Benefit */}
            {companionData.support && (
              <div className="companion-section">
                <h4 >Support Benefit</h4>
                <p>{companionData.support}</p>
                {canSupport && (
                  <button
                    type="button"
                    className="condition-btn"
                    onClick={handleSupport}
                    title="Apply the Support benefit until the start of your next turn"
                  >
                    Support
                  </button>
                )}
              </div>
            )}

            {/* Special Abilities */}
            {companionData.abilities && companionData.abilities.length > 0 && (
              <div className="companion-section">
                <h4 >Special Abilities</h4>
                <div className="companion-abilities-list">
                  {companionData.abilities.map((ability, index) => (
                    <div key={index} className="companion-ability">
                      <h5>{ability.name}</h5>
                      <p>{ability.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Description */}
            {companionData.description && (
              <div className="companion-section">
                <h4 >Description</h4>
                <p>{companionData.description}</p>
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

      <MinionStrikeModal
        isOpen={!!strikeForRoll}
        onClose={() => setStrikeForRoll(null)}
        strike={strikeForRoll}
        companionData={companionData}
        character={character}
        role={MINION_COMPANION}
        themeColor={themeColor}
      />
    </>
  );
};

export default AnimalCompanionModal;
