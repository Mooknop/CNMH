import React, { useState } from 'react';
import './StatsBlock.css';
import EnhancedSkillsList from '../character-sheet/EnhancedSkillsList';
import FeatsList from '../character-sheet/FeatsList';
import ConditionModal from './ConditionModal';
import PenaltyDisplay from '../shared/PenaltyDisplay';
import { formatModifier, getProficiencyBonus, getProficiencyLabel } from '../../utils/CharacterUtils';
import { useCharacter } from '../../hooks/useCharacter';
import { computeConditionEffects } from '../../utils/ConditionUtils';
import { useSyncedState as useLocalStorage } from '../../hooks/useSyncedState';

const StatsBlock = ({ character, characterColor }) => {
  const [activeTab, setActiveTab] = useState('abilities');
  const characterKey = character?.id || 'unknown';
  const [activeConditions, setActiveConditions] = useLocalStorage(`cnmh_conditions_${characterKey}`, []);
  const [isConditionModalOpen, setIsConditionModalOpen] = useState(false);

  const handleAddCondition = (condition) => {
    setActiveConditions((prev) => {
      const alreadyActive = prev.find((c) => c.id === condition.id);
      if (alreadyActive) {
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

  const handleRemoveCondition = (id) => {
    setActiveConditions((prev) => prev.filter((c) => c.id !== id));
  };

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

  // Data layer — all character reads go through this hook
  const charData = useCharacter(character);
  if (!charData) return null;

  const {
    abilityModifiers,
    saves,
    proficiencies: rawProficiencies,
    classDC,
    level,
    maxHp,
    ac,
    size,
    speed,
    senses,
  } = charData;

  const themeColor = characterColor || 'var(--color-primary)';
  const strMod = abilityModifiers.strength;
  const dexMod = abilityModifiers.dexterity;

  const defaultProficiencies = {
    weapons: {
      unarmed: { proficiency: 0, name: "Untrained" },
      simple: { proficiency: 0, name: "Untrained" },
      martial: { proficiency: 0, name: "Untrained" },
      advanced: { proficiency: 0, name: "Untrained" }
    },
    armor: {
      unarmored: { proficiency: 0, name: "Untrained" },
      light: { proficiency: 0, name: "Untrained" },
      medium: { proficiency: 0, name: "Untrained" },
      heavy: { proficiency: 0, name: "Untrained" }
    }
  };

  const proficiencies = rawProficiencies.weapons ? rawProficiencies : defaultProficiencies;

  // Compute condition penalties for every displayed stat
  const effects = computeConditionEffects(activeConditions, character?.keyAbility, level);

  // Helper: raw attack bonus as a number (no formatting) so PenaltyDisplay can apply the delta
  const attackNum = (abilityMod, proficiency) =>
    abilityMod + getProficiencyBonus(proficiency, level);

  // Render an attack-bonus cell with condition penalty wired in
  const renderAttackBonus = (abilityMod, proficiency, penaltyObj) => (
    <PenaltyDisplay
      base={attackNum(abilityMod, proficiency)}
      penalty={penaltyObj}
      format="modifier"
    />
  );

  const renderTabContent = () => {
    switch(activeTab) {
      case 'abilities':
        return (
          <>
            <div className="abilities-section">
              <div className="ability">
                <div className="ability-name" style={{ color: themeColor }}>STR</div>
                <div className="ability-mod">{formatModifier(abilityModifiers.strength)}</div>
              </div>
              <div className="ability">
                <div className="ability-name" style={{ color: themeColor }}>DEX</div>
                <div className="ability-mod">{formatModifier(abilityModifiers.dexterity)}</div>
              </div>
              <div className="ability">
                <div className="ability-name" style={{ color: themeColor }}>CON</div>
                <div className="ability-mod">{formatModifier(abilityModifiers.constitution)}</div>
              </div>
              <div className="ability">
                <div className="ability-name" style={{ color: themeColor }}>INT</div>
                <div className="ability-mod">{formatModifier(abilityModifiers.intelligence)}</div>
              </div>
              <div className="ability">
                <div className="ability-name" style={{ color: themeColor }}>WIS</div>
                <div className="ability-mod">{formatModifier(abilityModifiers.wisdom)}</div>
              </div>
              <div className="ability">
                <div className="ability-name" style={{ color: themeColor }}>CHA</div>
                <div className="ability-mod">{formatModifier(abilityModifiers.charisma)}</div>
              </div>
            </div>

            <div className="defenses-section">
              <div className="defense">
                <div className="defense-name" style={{ color: themeColor }}>Fort</div>
                <div className="defense-value">
                  <PenaltyDisplay base={saves.fortitude} penalty={effects.fort} format="modifier" />
                </div>
              </div>
              <div className="defense">
                <div className="defense-name" style={{ color: themeColor }}>Ref</div>
                <div className="defense-value">
                  <PenaltyDisplay base={saves.reflex} penalty={effects.reflex} format="modifier" />
                </div>
              </div>
              <div className="defense">
                <div className="defense-name" style={{ color: themeColor }}>Will</div>
                <div className="defense-value">
                  <PenaltyDisplay base={saves.will} penalty={effects.will} format="modifier" />
                </div>
              </div>
            </div>
          </>
        );

      case 'proficiencies':
        return (
          <div className="proficiencies-section">
            <div className="proficiency-group">
              <h4 className="proficiency-category" style={{ color: themeColor }}>Class DC</h4>
              <div className="proficiency-items">
                <div className="proficiency-item">
                  <span className="proficiency-name" style={{ color: themeColor }}>
                    <strong>
                      <PenaltyDisplay base={classDC} penalty={effects.classDC} />
                    </strong>
                  </span>
                </div>
              </div>

              <h4 className="proficiency-category" style={{ color: themeColor }}>Weapons</h4>
              <div className="proficiency-items">
                {/* Unarmed Attacks */}
                <div className="proficiency-item weapon-proficiency">
                  <div className="weapon-category">
                    <span className="proficiency-name">Unarmed</span>
                    <span className={`proficiency-value prof-${proficiencies.weapons.unarmed?.proficiency || 0}`}>
                      {getProficiencyLabel(proficiencies.weapons.unarmed?.proficiency || 0)}
                    </span>
                  </div>
                  <div className="attack-bonuses">
                    <div className="bonus-container">
                      <div className="attack-type">Melee (STR)</div>
                      <div className="attack-bonus" style={{ color: themeColor }}>
                        {renderAttackBonus(strMod, proficiencies.weapons.unarmed?.proficiency || 0, effects.meleeAttack)}
                      </div>
                    </div>
                    <div className="bonus-container">
                      <div className="attack-type">Ranged (DEX)</div>
                      <div className="attack-bonus" style={{ color: themeColor }}>
                        {renderAttackBonus(dexMod, proficiencies.weapons.unarmed?.proficiency || 0, effects.rangedAttack)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Simple Weapons */}
                <div className="proficiency-item weapon-proficiency">
                  <div className="weapon-category">
                    <span className="proficiency-name">Simple</span>
                    <span className={`proficiency-value prof-${proficiencies.weapons.simple?.proficiency || 0}`}>
                      {getProficiencyLabel(proficiencies.weapons.simple?.proficiency || 0)}
                    </span>
                  </div>
                  <div className="attack-bonuses">
                    <div className="bonus-container">
                      <div className="attack-type">Melee (STR)</div>
                      <div className="attack-bonus" style={{ color: themeColor }}>
                        {renderAttackBonus(strMod, proficiencies.weapons.simple?.proficiency || 0, effects.meleeAttack)}
                      </div>
                    </div>
                    <div className="bonus-container">
                      <div className="attack-type">Ranged (DEX)</div>
                      <div className="attack-bonus" style={{ color: themeColor }}>
                        {renderAttackBonus(dexMod, proficiencies.weapons.simple?.proficiency || 0, effects.rangedAttack)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Martial Weapons */}
                <div className="proficiency-item weapon-proficiency">
                  <div className="weapon-category">
                    <span className="proficiency-name">Martial</span>
                    <span className={`proficiency-value prof-${proficiencies.weapons.martial?.proficiency || 0}`}>
                      {getProficiencyLabel(proficiencies.weapons.martial?.proficiency || 0)}
                    </span>
                  </div>
                  <div className="attack-bonuses">
                    <div className="bonus-container">
                      <div className="attack-type">Melee (STR)</div>
                      <div className="attack-bonus" style={{ color: themeColor }}>
                        {renderAttackBonus(strMod, proficiencies.weapons.martial?.proficiency || 0, effects.meleeAttack)}
                      </div>
                    </div>
                    <div className="bonus-container">
                      <div className="attack-type">Ranged (DEX)</div>
                      <div className="attack-bonus" style={{ color: themeColor }}>
                        {renderAttackBonus(dexMod, proficiencies.weapons.martial?.proficiency || 0, effects.rangedAttack)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Advanced Weapons */}
                <div className="proficiency-item weapon-proficiency">
                  <div className="weapon-category">
                    <span className="proficiency-name">Advanced</span>
                    <span className={`proficiency-value prof-${proficiencies.weapons.advanced?.proficiency || 0}`}>
                      {getProficiencyLabel(proficiencies.weapons.advanced?.proficiency || 0)}
                    </span>
                  </div>
                  <div className="attack-bonuses">
                    <div className="bonus-container">
                      <div className="attack-type">Melee (STR)</div>
                      <div className="attack-bonus" style={{ color: themeColor }}>
                        {renderAttackBonus(strMod, proficiencies.weapons.advanced?.proficiency || 0, effects.meleeAttack)}
                      </div>
                    </div>
                    <div className="bonus-container">
                      <div className="attack-type">Ranged (DEX)</div>
                      <div className="attack-bonus" style={{ color: themeColor }}>
                        {renderAttackBonus(dexMod, proficiencies.weapons.advanced?.proficiency || 0, effects.rangedAttack)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Class Weapons (if available) */}
                {proficiencies.weapons.class && (
                  <div className="proficiency-item weapon-proficiency">
                    <div className="weapon-category">
                      <span className="proficiency-name">Class Weapons</span>
                      <span className={`proficiency-value prof-${proficiencies.weapons.class?.proficiency || 0}`}>
                        {getProficiencyLabel(proficiencies.weapons.class?.proficiency || 0)}
                      </span>
                    </div>
                    <div className="attack-bonuses">
                      <div className="bonus-container">
                        <div className="attack-type">Melee (STR)</div>
                        <div className="attack-bonus" style={{ color: themeColor }}>
                          {renderAttackBonus(strMod, proficiencies.weapons.class?.proficiency || 0, effects.meleeAttack)}
                        </div>
                      </div>
                      <div className="bonus-container">
                        <div className="attack-type">Ranged (DEX)</div>
                        <div className="attack-bonus" style={{ color: themeColor }}>
                          {renderAttackBonus(dexMod, proficiencies.weapons.class?.proficiency || 0, effects.rangedAttack)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Finesse Weapons (if available) */}
                {proficiencies.weapons.finesse && (
                  <div className="proficiency-item weapon-proficiency">
                    <div className="weapon-category">
                      <span className="proficiency-name">Finesse</span>
                      <span className={`proficiency-value prof-${proficiencies.weapons.finesse?.proficiency || 0}`}>
                        {getProficiencyLabel(proficiencies.weapons.finesse?.proficiency || 0)}
                      </span>
                    </div>
                    <div className="attack-bonuses">
                      <div className="bonus-container">
                        <div className="attack-type">Melee (STR/DEX)</div>
                        <div className="attack-bonus" style={{ color: themeColor }}>
                          {renderAttackBonus(Math.max(strMod, dexMod), proficiencies.weapons.finesse?.proficiency || 0, effects.meleeAttack)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="proficiency-group">
              <h4 className="proficiency-category" style={{ color: themeColor }}>Armor</h4>
              <div className="proficiency-items">
                <div className="proficiency-item">
                  <span className="proficiency-name">Unarmored</span>
                  <span className={`proficiency-value prof-${proficiencies.armor.unarmored?.proficiency || 0}`}>
                    {getProficiencyLabel(proficiencies.armor.unarmored?.proficiency || 0)}
                  </span>
                </div>
                <div className="proficiency-item">
                  <span className="proficiency-name">Light</span>
                  <span className={`proficiency-value prof-${proficiencies.armor.light?.proficiency || 0}`}>
                    {getProficiencyLabel(proficiencies.armor.light?.proficiency || 0)}
                  </span>
                </div>
                <div className="proficiency-item">
                  <span className="proficiency-name">Medium</span>
                  <span className={`proficiency-value prof-${proficiencies.armor.medium?.proficiency || 0}`}>
                    {getProficiencyLabel(proficiencies.armor.medium?.proficiency || 0)}
                  </span>
                </div>
                <div className="proficiency-item">
                  <span className="proficiency-name">Heavy</span>
                  <span className={`proficiency-value prof-${proficiencies.armor.heavy?.proficiency || 0}`}>
                    {getProficiencyLabel(proficiencies.armor.heavy?.proficiency || 0)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      case 'feats':
        return (
          <FeatsList character={character} characterColor={themeColor} />
        );
      case 'skills':
        return (
          <EnhancedSkillsList
            character={character}
            characterColor={themeColor}
            activeConditions={activeConditions}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="stats-block">
      <div className="core-stats">
        <div className="hp-defense">
          <div className="hp-box" style={{ borderColor: themeColor }}>
            <div className="defense-name" style={{ color: themeColor }}>HP</div>
            <div className="defense-value">
              <PenaltyDisplay base={maxHp} penalty={effects.maxHp} />
            </div>
          </div>
          <div className="ac-box">
            <div className="defense-name">AC</div>
            <div className="defense-value">
              <PenaltyDisplay base={ac} penalty={effects.ac} />
            </div>
          </div>
          <button
            className={`condition-box${activeConditions.length > 0 ? ' condition-box--active' : ''}`}
            onClick={() => setIsConditionModalOpen(true)}
            style={activeConditions.length > 0 ? { borderColor: '#d4a017' } : {}}
          >
            <div className="defense-name" style={{ color: activeConditions.length > 0 ? '#d4a017' : undefined }}>
              CONDITIONS
            </div>
            <div className="defense-value condition-count">
              {activeConditions.length > 0 ? activeConditions.length : '—'}
            </div>
          </button>
        </div>
      </div>

      {/* Size and Speed Section */}
      <div className="character-attributes" style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '0.75rem',
              borderRadius: '4px',
              marginBottom: '1rem'
            }}>
              <div className="attribute">
                <span className="attribute-label" style={{ color: themeColor, fontWeight: '600', fontSize: '0.9rem' }}>Size</span>
                <span className="attribute-value" style={{ display: 'block', fontWeight: '700', fontSize: '1.1rem' }}>
                  {size || 'teeny weeny'}
                </span>
              </div>
              <div className="attribute">
                <span className="attribute-label" style={{ color: themeColor, fontWeight: '600', fontSize: '0.9rem' }}>Speed</span>
                <span className="attribute-value" style={{ display: 'block', fontWeight: '700', fontSize: '1.1rem' }}>
                  <PenaltyDisplay base={speed || 69} penalty={effects.speed} /> feet
                </span>
              </div>
              {senses && (
                <div className="attribute">
                  <span className="attribute-label" style={{ color: themeColor, fontWeight: '600', fontSize: '0.9rem' }}>Senses</span>
                  <span className="attribute-value" style={{ display: 'block', fontWeight: '700', fontSize: '1.1rem' }}>
                    {senses}
                  </span>
                </div>
              )}
            </div>

      {/* Tab Navigation */}
      <div className="stats-tabs">
        <button
          className={`tab-button ${activeTab === 'abilities' ? 'active' : ''}`}
          onClick={() => setActiveTab('abilities')}
          style={{ backgroundColor: activeTab === 'abilities' ? themeColor : '' }}
        >
          Abilities & Saves
        </button>
        <button
          className={`tab-button ${activeTab === 'proficiencies' ? 'active' : ''}`}
          onClick={() => setActiveTab('proficiencies')}
          style={{ backgroundColor: activeTab === 'proficiencies' ? themeColor : '' }}
        >
          Proficiencies
        </button>
        <button
          className={`tab-button ${activeTab === 'feats' ? 'active' : ''}`}
          onClick={() => setActiveTab('feats')}
          style={{ backgroundColor: activeTab === 'feats' ? themeColor : '' }}
        >
          Feats
        </button>
        <button
          className={`tab-button ${activeTab === 'skills' ? 'active' : ''}`}
          onClick={() => setActiveTab('skills')}
          style={{ backgroundColor: activeTab === 'skills' ? themeColor : '' }}
        >
          Skills
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {renderTabContent()}
      </div>

      <ConditionModal
        isOpen={isConditionModalOpen}
        onClose={() => setIsConditionModalOpen(false)}
        themeColor={themeColor}
        activeConditions={activeConditions}
        onAdd={handleAddCondition}
        onRemove={handleRemoveCondition}
        onChangeValue={handleChangeValue}
      />
    </div>
  );
};

export default StatsBlock;
