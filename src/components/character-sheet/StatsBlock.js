import React, { useState } from 'react';
import './StatsBlock.css';

const StatsBlock = ({ character }) => {
  const [activeTab, setActiveTab] = useState('abilities'); // Default tab: 'abilities' or 'proficiencies'
  
  const getModifier = (value) => {
    const mod = Math.floor((value - 10) / 2);
    return mod >= 0 ? `+${mod}` : mod.toString();
  };
  
  // Function to determine proficiency level name based on value
  const getProficiencyLabel = (proficiency) => {
    switch(proficiency) {
      case 0: return 'Untrained';
      case 1: return 'Trained';
      case 2: return 'Expert';
      case 3: return 'Master';
      case 4: return 'Legendary';
      default: return 'Untrained';
    }
  };
  
  // In PF2E, proficiencies are determined by class, and we need to display them
  // Since we don't have explicit proficiency data, we'll infer based on class
  const getWeaponProficiencies = () => {
    const classType = character.class?.toLowerCase();
    
    // Default proficiencies (most martial classes)
    let proficiencies = {
      simple: 1, // Trained
      martial: 0, // Untrained
      advanced: 0, // Untrained
      unarmed: 1, // Trained
      class: 0  // Class weapons
    };
    
    // Adjust based on class
    switch(classType) {
      case 'fighter':
        proficiencies.simple = 2; // Expert
        proficiencies.martial = 2; // Expert
        proficiencies.class = 2; // Expert in class weapons
        break;
      case 'barbarian':
      case 'ranger':
      case 'champion':
        proficiencies.simple = 1; // Trained
        proficiencies.martial = 1; // Trained
        break;
      case 'rogue':
        proficiencies.simple = 1; // Trained
        proficiencies.finesse = 1; // Trained in finesse weapons
        break;
      case 'bard':
      case 'cleric':
      case 'druid':
      case 'sorcerer':
      case 'wizard':
      case 'witch':
        proficiencies.simple = 1; // Trained
        proficiencies.class = character.level >= 11 ? 2 : 1; // Expert at level 11+
        break;
      case 'alchemist':
      case 'investigator':
      case 'thaumaturge':
        proficiencies.simple = 1; // Trained
        break;
      default:
        // Default to trained in simple weapons for unrecognized classes
        proficiencies.simple = 1;
    }
    
    // Add level-based progression
    if (character.level >= 13) {
      // At level 13, many classes improve weapon proficiencies
      if (['fighter'].includes(classType)) {
        proficiencies.simple = 3; // Master
        proficiencies.martial = 3; // Master
        proficiencies.class = 3; // Master
      } else if (['barbarian', 'ranger', 'champion'].includes(classType)) {
        proficiencies.simple = 2; // Expert
        proficiencies.martial = 2; // Expert
      }
    }
    
    if (character.level >= 19) {
      // At level 19, fighter gets legendary in some weapons
      if (classType === 'fighter') {
        proficiencies.class = 4; // Legendary in class weapons
      }
    }
    
    return proficiencies;
  };
  
  const getArmorProficiencies = () => {
    const classType = character.class?.toLowerCase();
    
    // Default proficiencies
    let proficiencies = {
      unarmored: 1, // Trained
      light: 0,     // Untrained
      medium: 0,    // Untrained
      heavy: 0      // Untrained
    };
    
    // Adjust based on class
    switch(classType) {
      case 'fighter':
      case 'champion':
        proficiencies.unarmored = 1; // Trained
        proficiencies.light = 1;     // Trained
        proficiencies.medium = 1;    // Trained
        proficiencies.heavy = 1;     // Trained
        break;
      case 'barbarian':
      case 'ranger':
      case 'rogue':
        proficiencies.unarmored = 1; // Trained
        proficiencies.light = 1;     // Trained
        proficiencies.medium = 1;    // Trained
        break;
      case 'bard':
      case 'druid':
        proficiencies.unarmored = 1; // Trained
        proficiencies.light = 1;     // Trained
        break;
      case 'alchemist':
      case 'investigator':
      case 'thaumaturge':
        proficiencies.unarmored = 1; // Trained
        proficiencies.light = 1;     // Trained
        break;
      case 'cleric':
        proficiencies.unarmored = 1; // Trained
        proficiencies.light = 1;     // Trained
        proficiencies.medium = 1;    // Trained
        break;
      case 'sorcerer':
      case 'wizard':
      case 'witch':
        proficiencies.unarmored = 1; // Trained
        break;
      default:
        // Default to trained in unarmored for unrecognized classes
        proficiencies.unarmored = 1;
    }
    
    // Add level-based progression
    if (character.level >= 13) {
      // At level 13, many classes improve armor proficiencies
      if (['fighter', 'champion'].includes(classType)) {
        proficiencies.unarmored = 2; // Expert
        proficiencies.light = 2;     // Expert
        proficiencies.medium = 2;    // Expert
        proficiencies.heavy = 2;     // Expert
      } else if (['barbarian', 'ranger'].includes(classType)) {
        proficiencies.unarmored = 2; // Expert
        proficiencies.light = 2;     // Expert
        proficiencies.medium = 2;    // Expert
      }
    }
    
    if (character.level >= 19) {
      // At level 19, champions get legendary in heavy armor
      if (classType === 'champion') {
        proficiencies.heavy = 4; // Legendary
      }
    }
    
    return proficiencies;
  };
  
  const weaponProfs = getWeaponProficiencies();
  const armorProfs = getArmorProficiencies();
  
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
                <div className="defense-value">{`+` + character.saves?.fortitude || 0}</div>
              </div>
              <div className="defense">
                <div className="defense-name">Ref</div>
                <div className="defense-value">{`+` + character.saves?.reflex || 0}</div>
              </div>
              <div className="defense">
                <div className="defense-name">Will</div>
                <div className="defense-value">{`+` + character.saves?.will || 0}</div>
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
                <div className="proficiency-item">
                  <span className="proficiency-name">Simple</span>
                  <span className={`proficiency-value prof-${weaponProfs.simple}`}>
                    {getProficiencyLabel(weaponProfs.simple)}
                  </span>
                </div>
                <div className="proficiency-item">
                  <span className="proficiency-name">Martial</span>
                  <span className={`proficiency-value prof-${weaponProfs.martial}`}>
                    {getProficiencyLabel(weaponProfs.martial)}
                  </span>
                </div>
                <div className="proficiency-item">
                  <span className="proficiency-name">Advanced</span>
                  <span className={`proficiency-value prof-${weaponProfs.advanced}`}>
                    {getProficiencyLabel(weaponProfs.advanced)}
                  </span>
                </div>
                <div className="proficiency-item">
                  <span className="proficiency-name">Unarmed</span>
                  <span className={`proficiency-value prof-${weaponProfs.unarmed}`}>
                    {getProficiencyLabel(weaponProfs.unarmed)}
                  </span>
                </div>
                {weaponProfs.class > 0 && (
                  <div className="proficiency-item">
                    <span className="proficiency-name">Class Weapons</span>
                    <span className={`proficiency-value prof-${weaponProfs.class}`}>
                      {getProficiencyLabel(weaponProfs.class)}
                    </span>
                  </div>
                )}
                {weaponProfs.finesse > 0 && (
                  <div className="proficiency-item">
                    <span className="proficiency-name">Finesse</span>
                    <span className={`proficiency-value prof-${weaponProfs.finesse}`}>
                      {getProficiencyLabel(weaponProfs.finesse)}
                    </span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="proficiency-group">
              <h4 className="proficiency-category">Armor</h4>
              <div className="proficiency-items">
                <div className="proficiency-item">
                  <span className="proficiency-name">Unarmored</span>
                  <span className={`proficiency-value prof-${armorProfs.unarmored}`}>
                    {getProficiencyLabel(armorProfs.unarmored)}
                  </span>
                </div>
                <div className="proficiency-item">
                  <span className="proficiency-name">Light</span>
                  <span className={`proficiency-value prof-${armorProfs.light}`}>
                    {getProficiencyLabel(armorProfs.light)}
                  </span>
                </div>
                <div className="proficiency-item">
                  <span className="proficiency-name">Medium</span>
                  <span className={`proficiency-value prof-${armorProfs.medium}`}>
                    {getProficiencyLabel(armorProfs.medium)}
                  </span>
                </div>
                <div className="proficiency-item">
                  <span className="proficiency-name">Heavy</span>
                  <span className={`proficiency-value prof-${armorProfs.heavy}`}>
                    {getProficiencyLabel(armorProfs.heavy)}
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