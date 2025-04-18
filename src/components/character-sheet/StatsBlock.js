import React, { useState } from 'react';
import './StatsBlock.css';

const StatsBlock = ({ character }) => {
  const [activeTab, setActiveTab] = useState('abilities'); // Default tab: 'abilities' or 'proficiencies'
  
  // Function to get modifier from ability score
  const getModifier = (value) => {
    const mod = Math.floor((value - 10) / 2);
    return mod >= 0 ? `+${mod}` : mod.toString();
  };
  
  // Calculate attack bonus based on ability modifier and proficiency
  const getAttackBonus = (abilityMod, proficiency) => {
    // In PF2E: ability modifier + proficiency bonus + level (if trained or better)
    let profBonus = 0;
    if (proficiency > 0) {
      // Trained +2, Expert +4, Master +6, Legendary +8 + level
      profBonus = proficiency * 2 + character.level;
    }
    
    const bonus = abilityMod + profBonus;
    return bonus >= 0 ? `+${bonus}` : bonus.toString();
  };
  
  // Get ability modifiers
  const strMod = Math.floor((character.abilities?.strength || 10) - 10) / 2;
  const dexMod = Math.floor((character.abilities?.dexterity || 10) - 10) / 2;
  
  // Default empty proficiencies object in case the character doesn't have it defined
  const defaultProficiencies = {
    weapons: {
      simple: { proficiency: 0, name: "Untrained" },
      martial: { proficiency: 0, name: "Untrained" },
      advanced: { proficiency: 0, name: "Untrained" },
      unarmed: { proficiency: 0, name: "Untrained" }
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
                <div className="ability-name">STR</div>
                <div className="ability-mod">{getModifier(character.abilities?.strength || 10)}</div>
              </div>
              <div className="ability">
                <div className="ability-name">DEX</div>
                <div className="ability-mod">{getModifier(character.abilities?.dexterity || 10)}</div>
              </div>
              <div className="ability">
                <div className="ability-name">CON</div>
                <div className="ability-mod">{getModifier(character.abilities?.constitution || 10)}</div>
              </div>
              <div className="ability">
                <div className="ability-name">INT</div>
                <div className="ability-mod">{getModifier(character.abilities?.intelligence || 10)}</div>
              </div>
              <div className="ability">
                <div className="ability-name">WIS</div>
                <div className="ability-mod">{getModifier(character.abilities?.wisdom || 10)}</div>
              </div>
              <div className="ability">
                <div className="ability-name">CHA</div>
                <div className="ability-mod">{getModifier(character.abilities?.charisma || 10)}</div>
              </div>
            </div>
            
            <div className="defenses-section">
              <div className="defense">
                <div className="defense-name">Fort</div>
                <div className="defense-value">{character.saves?.fortitude >= 0 ? '+' + character.saves?.fortitude : character.saves?.fortitude || 0}</div>
              </div>
              <div className="defense">
                <div className="defense-name">Ref</div>
                <div className="defense-value">{character.saves?.reflex >= 0 ? '+' + character.saves?.reflex : character.saves?.reflex || 0}</div>
              </div>
              <div className="defense">
                <div className="defense-name">Will</div>
                <div className="defense-value">{character.saves?.will >= 0 ? '+' + character.saves?.will : character.saves?.will || 0}</div>
              </div>
            </div>
          </>
        );
      
      case 'proficiencies':
        return (
          <div className="proficiencies-section">
            <div className="proficiency-group">
              <h4 className="proficiency-category">Weapons</h4>
              <div className="proficiency-items">
                {/* Simple Weapons */}
                <div className="proficiency-item weapon-proficiency">
                  <div className="weapon-category">
                    <span className="proficiency-name">Simple</span>
                    <span className={`proficiency-value prof-${proficiencies.weapons.simple?.proficiency || 0}`}>
                      {proficiencies.weapons.simple?.name || "Untrained"}
                    </span>
                  </div>
                  <div className="attack-bonuses">
                    <div className="bonus-container">
                      <div className="attack-type">Melee (STR)</div>
                      <div className="attack-bonus">
                        {getAttackBonus(strMod, proficiencies.weapons.simple?.proficiency || 0)}
                      </div>
                    </div>
                    <div className="bonus-container">
                      <div className="attack-type">Ranged (DEX)</div>
                      <div className="attack-bonus">
                        {getAttackBonus(dexMod, proficiencies.weapons.simple?.proficiency || 0)}
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Martial Weapons */}
                <div className="proficiency-item weapon-proficiency">
                  <div className="weapon-category">
                    <span className="proficiency-name">Martial</span>
                    <span className={`proficiency-value prof-${proficiencies.weapons.martial?.proficiency || 0}`}>
                      {proficiencies.weapons.martial?.name || "Untrained"}
                    </span>
                  </div>
                  <div className="attack-bonuses">
                    <div className="bonus-container">
                      <div className="attack-type">Melee (STR)</div>
                      <div className="attack-bonus">
                        {getAttackBonus(strMod, proficiencies.weapons.martial?.proficiency || 0)}
                      </div>
                    </div>
                    <div className="bonus-container">
                      <div className="attack-type">Ranged (DEX)</div>
                      <div className="attack-bonus">
                        {getAttackBonus(dexMod, proficiencies.weapons.martial?.proficiency || 0)}
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Advanced Weapons */}
                <div className="proficiency-item weapon-proficiency">
                  <div className="weapon-category">
                    <span className="proficiency-name">Advanced</span>
                    <span className={`proficiency-value prof-${proficiencies.weapons.advanced?.proficiency || 0}`}>
                      {proficiencies.weapons.advanced?.name || "Untrained"}
                    </span>
                  </div>
                  <div className="attack-bonuses">
                    <div className="bonus-container">
                      <div className="attack-type">Melee (STR)</div>
                      <div className="attack-bonus">
                        {getAttackBonus(strMod, proficiencies.weapons.advanced?.proficiency || 0)}
                      </div>
                    </div>
                    <div className="bonus-container">
                      <div className="attack-type">Ranged (DEX)</div>
                      <div className="attack-bonus">
                        {getAttackBonus(dexMod, proficiencies.weapons.advanced?.proficiency || 0)}
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Unarmed Attacks */}
                <div className="proficiency-item weapon-proficiency">
                  <div className="weapon-category">
                    <span className="proficiency-name">Unarmed</span>
                    <span className={`proficiency-value prof-${proficiencies.weapons.unarmed?.proficiency || 0}`}>
                      {proficiencies.weapons.unarmed?.name || "Untrained"}
                    </span>
                  </div>
                  <div className="attack-bonuses">
                    <div className="bonus-container">
                      <div className="attack-type">Melee (STR)</div>
                      <div className="attack-bonus">
                        {getAttackBonus(strMod, proficiencies.weapons.unarmed?.proficiency || 0)}
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
                        {proficiencies.weapons.class?.name || "Untrained"}
                      </span>
                    </div>
                    <div className="attack-bonuses">
                      <div className="bonus-container">
                        <div className="attack-type">Melee (STR)</div>
                        <div className="attack-bonus">
                          {getAttackBonus(strMod, proficiencies.weapons.class?.proficiency || 0)}
                        </div>
                      </div>
                      <div className="bonus-container">
                        <div className="attack-type">Ranged (DEX)</div>
                        <div className="attack-bonus">
                          {getAttackBonus(dexMod, proficiencies.weapons.class?.proficiency || 0)}
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
                        {proficiencies.weapons.finesse?.name || "Untrained"}
                      </span>
                    </div>
                    <div className="attack-bonuses">
                      <div className="bonus-container">
                        <div className="attack-type">Melee (STR/DEX)</div>
                        <div className="attack-bonus">
                          {getAttackBonus(Math.max(strMod, dexMod), proficiencies.weapons.finesse?.proficiency || 0)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="proficiency-group">
              <h4 className="proficiency-category">Armor</h4>
              <div className="proficiency-items">
                <div className="proficiency-item">
                  <span className="proficiency-name">Unarmored</span>
                  <span className={`proficiency-value prof-${proficiencies.armor.unarmored?.proficiency || 0}`}>
                    {proficiencies.armor.unarmored?.name || "Untrained"}
                  </span>
                </div>
                <div className="proficiency-item">
                  <span className="proficiency-name">Light</span>
                  <span className={`proficiency-value prof-${proficiencies.armor.light?.proficiency || 0}`}>
                    {proficiencies.armor.light?.name || "Untrained"}
                  </span>
                </div>
                <div className="proficiency-item">
                  <span className="proficiency-name">Medium</span>
                  <span className={`proficiency-value prof-${proficiencies.armor.medium?.proficiency || 0}`}>
                    {proficiencies.armor.medium?.name || "Untrained"}
                  </span>
                </div>
                <div className="proficiency-item">
                  <span className="proficiency-name">Heavy</span>
                  <span className={`proficiency-value prof-${proficiencies.armor.heavy?.proficiency || 0}`}>
                    {proficiencies.armor.heavy?.name || "Untrained"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };
  
  return (
    <div className="stats-block">
      <div className="core-stats">
        <div className="hp-defense">
          <div className="hp-box">
            <div className="defense-name">HP</div>
            <div className="defense-value">{character.maxHp || 0}</div>
          </div>
          <div className="ac-box">
            <div className="defense-name">AC</div>
            <div className="defense-value">{character.ac || 10}</div>
          </div>
        </div>
      </div>
      
      {/* Tab Navigation */}
      <div className="stats-tabs">
        <button 
          className={`tab-button ${activeTab === 'abilities' ? 'active' : ''}`}
          onClick={() => setActiveTab('abilities')}
        >
          Abilities & Saves
        </button>
        <button 
          className={`tab-button ${activeTab === 'proficiencies' ? 'active' : ''}`}
          onClick={() => setActiveTab('proficiencies')}
        >
          Proficiencies
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