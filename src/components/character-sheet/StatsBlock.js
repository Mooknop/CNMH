import React, { useState } from 'react';
import './StatsBlock.css';
import EnhancedSkillsList from '../character-sheet/EnhancedSkillsList';
import { 
  getAbilityModifier, 
  formatModifier, 
  getAttackBonus,
  getProficiencyLabel,
  calculateClassDC
} from '../../utils/CharacterUtils';

const StatsBlock = ({ character, characterColor }) => {
  const [activeTab, setActiveTab] = useState('abilities'); // Default tab: 'abilities' or 'proficiencies'
  
  // Get ability modifiers
  const strMod = getAbilityModifier(character.abilities?.strength || 10);
  const dexMod = getAbilityModifier(character.abilities?.dexterity || 10);
  
  // Use the characterColor or default to the theme color
  const themeColor = characterColor || '#5e2929';
  
  // Default empty proficiencies object in case the character doesn't have it defined
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
  
  // Use character proficiencies if available, otherwise use defaults
  const proficiencies = character.proficiencies || defaultProficiencies;
  
  // Render the appropriate tab content
  const renderTabContent = () => {
    switch(activeTab) {
      case 'abilities':
        return (
          <>
            <div className="abilities-section">
              <div className="ability">
                <div className="ability-name" style={{ color: themeColor }}>STR</div>
                <div className="ability-mod">{formatModifier(getAbilityModifier(character.abilities?.strength || 10))}</div>
              </div>
              <div className="ability">
                <div className="ability-name" style={{ color: themeColor }}>DEX</div>
                <div className="ability-mod">{formatModifier(getAbilityModifier(character.abilities?.dexterity || 10))}</div>
              </div>
              <div className="ability">
                <div className="ability-name" style={{ color: themeColor }}>CON</div>
                <div className="ability-mod">{formatModifier(getAbilityModifier(character.abilities?.constitution || 10))}</div>
              </div>
              <div className="ability">
                <div className="ability-name" style={{ color: themeColor }}>INT</div>
                <div className="ability-mod">{formatModifier(getAbilityModifier(character.abilities?.intelligence || 10))}</div>
              </div>
              <div className="ability">
                <div className="ability-name" style={{ color: themeColor }}>WIS</div>
                <div className="ability-mod">{formatModifier(getAbilityModifier(character.abilities?.wisdom || 10))}</div>
              </div>
              <div className="ability">
                <div className="ability-name" style={{ color: themeColor }}>CHA</div>
                <div className="ability-mod">{formatModifier(getAbilityModifier(character.abilities?.charisma || 10))}</div>
              </div>
            </div>
            
            <div className="defenses-section">
              <div className="defense">
                <div className="defense-name" style={{ color: themeColor }}>Fort</div>
                <div className="defense-value">{formatModifier(character.saves?.fortitude || 0)}</div>
              </div>
              <div className="defense">
                <div className="defense-name" style={{ color: themeColor }}>Ref</div>
                <div className="defense-value">{formatModifier(character.saves?.reflex || 0)}</div>
              </div>
              <div className="defense">
                <div className="defense-name" style={{ color: themeColor }}>Will</div>
                <div className="defense-value">{formatModifier(character.saves?.will || 0)}</div>
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
                    <strong>{calculateClassDC(character)}</strong>
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
                        {getAttackBonus(strMod, proficiencies.weapons.unarmed?.proficiency || 0, character.level || 0)}
                      </div>
                    </div>
                    <div className="bonus-container">
                      <div className="attack-type">Ranged (DEX)</div>
                      <div className="attack-bonus" style={{ color: themeColor }}>
                        {getAttackBonus(dexMod, proficiencies.weapons.unarmed?.proficiency || 0, character.level || 0)}
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
                        {getAttackBonus(strMod, proficiencies.weapons.simple?.proficiency || 0, character.level || 0)}
                      </div>
                    </div>
                    <div className="bonus-container">
                      <div className="attack-type">Ranged (DEX)</div>
                      <div className="attack-bonus" style={{ color: themeColor }}>
                        {getAttackBonus(dexMod, proficiencies.weapons.simple?.proficiency || 0, character.level || 0)}
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
                        {getAttackBonus(strMod, proficiencies.weapons.martial?.proficiency || 0, character.level || 0)}
                      </div>
                    </div>
                    <div className="bonus-container">
                      <div className="attack-type">Ranged (DEX)</div>
                      <div className="attack-bonus" style={{ color: themeColor }}>
                        {getAttackBonus(dexMod, proficiencies.weapons.martial?.proficiency || 0, character.level || 0)}
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
                        {getAttackBonus(strMod, proficiencies.weapons.advanced?.proficiency || 0, character.level || 0)}
                      </div>
                    </div>
                    <div className="bonus-container">
                      <div className="attack-type">Ranged (DEX)</div>
                      <div className="attack-bonus" style={{ color: themeColor }}>
                        {getAttackBonus(dexMod, proficiencies.weapons.advanced?.proficiency || 0, character.level || 0)}
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
                          {getAttackBonus(strMod, proficiencies.weapons.class?.proficiency || 0, character.level || 0)}
                        </div>
                      </div>
                      <div className="bonus-container">
                        <div className="attack-type">Ranged (DEX)</div>
                        <div className="attack-bonus" style={{ color: themeColor }}>
                          {getAttackBonus(dexMod, proficiencies.weapons.class?.proficiency || 0, character.level || 0)}
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
                          {getAttackBonus(Math.max(strMod, dexMod), proficiencies.weapons.finesse?.proficiency || 0, character.level || 0)}
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
      case 'skills':
        return <EnhancedSkillsList character={character} characterColor={themeColor} />;
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
            <div className="defense-value">{character.maxHp || 0}</div>
          </div>
          <div className="ac-box">
            <div className="defense-name">AC</div>
            <div className="defense-value">{character.ac || 10}</div>
          </div>
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
                  {character.size || 'teeny weeny'}
                </span>
              </div>
              <div className="attribute">
                <span className="attribute-label" style={{ color: themeColor, fontWeight: '600', fontSize: '0.9rem' }}>Speed</span>
                <span className="attribute-value" style={{ display: 'block', fontWeight: '700', fontSize: '1.1rem' }}>
                  {character.speed || 69} feet
                </span>
              </div>
              {character.senses && (
                <div className="attribute">
                  <span className="attribute-label" style={{ color: themeColor, fontWeight: '600', fontSize: '0.9rem' }}>Senses</span>
                  <span className="attribute-value" style={{ display: 'block', fontWeight: '700', fontSize: '1.1rem' }}>
                    {character.senses}
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
    </div>
  );
};

export default StatsBlock;