import React, { useContext } from 'react';
import { CharacterContext } from '../../contexts/CharacterContext';
import { 
  getAbilityModifier, 
  formatModifier, 
  getSkillModifier,
  SKILL_ABILITY_MAP,
  CHARACTER_COLORS, // Import the color constants
  getCharacterColor  // Import the utility function
} from '../../utils/CharacterUtils';
import './PartySummary.css';

const PartySummary = () => {
  const { characters } = useContext(CharacterContext);

  // Get ability data for all party members
  const getAbilityData = () => {
    const abilityData = characters.map((char, index) => {
      const abilities = char.abilities || {};
      return {
        name: char.name,
        color: getCharacterColor(index), // Use the utility function
        class: char.class,
        abilities: {
          strength: getAbilityModifier(abilities.strength || 10),
          dexterity: getAbilityModifier(abilities.dexterity || 10),
          constitution: getAbilityModifier(abilities.constitution || 10),
          intelligence: getAbilityModifier(abilities.intelligence || 10),
          wisdom: getAbilityModifier(abilities.wisdom || 10),
          charisma: getAbilityModifier(abilities.charisma || 10)
        }
      };
    });
    
    return abilityData;
  };

  const partyAbilityData = getAbilityData();
  
  // Find min and max modifiers across all characters for scaling
  const allModifiers = partyAbilityData.flatMap(char => 
    Object.values(char.abilities)
  );
  
  const minModifier = Math.min(...allModifiers);
  const maxModifier = Math.max(...allModifiers);
  
  // Calculate bar width percentage
  const getBarWidth = (value) => {
    const range = maxModifier - minModifier;
    if (range === 0) return 50; // Default for no variation
    
    // Scale to 10-100% range
    return 10 + ((value - minModifier) / range) * 90;
  };
  
  // Find the best character for each skill
  const findBestAtSkill = () => {
    // List of all PF2E skills
    const allSkills = Object.keys(SKILL_ABILITY_MAP);
    
    const bestCharacters = {};
    
    allSkills.forEach(skill => {
      let bestChar = null;
      let bestModifier = -Infinity;
      
      characters.forEach((char, index) => {
        const modifier = getSkillModifier(char, skill);
        if (modifier > bestModifier) {
          bestModifier = modifier;
          bestChar = {
            ...char,
            colorIndex: index
          };
        }
      });
      
      if (bestChar) {
        bestCharacters[skill] = {
          name: bestChar.name,
          class: bestChar.class,
          color: getCharacterColor(bestChar.colorIndex), // Use the utility function
          modifier: bestModifier
        };
      }
    });
    
    return bestCharacters;
  };
  
  const bestSkillCharacters = findBestAtSkill();
  
  // Format skill names for better display
  const formatSkillName = (name) => {
    return name.charAt(0).toUpperCase() + name.slice(1);
  };
  
  return (
    <div className="party-summary">
      <h2>Party Overview</h2>
      
      <div className="summary-content">
        <div className="ability-comparison-container">          
          <div className="ability-comparison">
            <div className="character-column-headers">
              {partyAbilityData.map((char) => (
                <div 
                  key={`header-${char.name}`} 
                  className="character-column-header"
                  style={{ 
                    flexBasis: `${100 / partyAbilityData.length}%`,
                    color: char.color 
                  }}
                >
                  <span className="char-name">{char.name}</span>
                  <span className="char-class">{char.class}</span>
                </div>
              ))}
            </div>
            {['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].map(ability => (
              <div key={ability} className="ability-row">
                <div className="ability-label">
                  {ability.substring(0, 3).toUpperCase()}
                </div>
                <div className="ability-bars">
                  {partyAbilityData.map((char, index) => (
                    <div 
                      key={`${char.name}-${ability}`} 
                      className="char-ability-bar-container"
                      style={{ flexBasis: `${100 / partyAbilityData.length}%` }}
                    >
                      <div 
                        className="char-ability-bar" 
                        style={{ 
                          width: `${getBarWidth(char.abilities[ability])}%`,
                          backgroundColor: char.color,
                        }}
                      >
                        <span className="char-ability-value">
                          {formatModifier(char.abilities[ability])}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>        
        <div className="skill-specialists-container">
          <h3>Party Skill Specialists</h3>
          {Object.keys(bestSkillCharacters).length > 0 ? (
            <div className="skill-specialists-grid">
              {Object.entries(bestSkillCharacters)
                .sort((a, b) => a[0].localeCompare(b[0])) // Sort alphabetically by skill name
                .map(([skillName, data]) => (
                <div 
                  key={skillName} 
                  className="skill-specialist-card" 
                  style={{ borderLeftColor: data.color }}
                >
                  <div className="skill-name">{formatSkillName(skillName)}</div>
                  <div className="specialist-info">
                    <div className="specialist-details">
                      <div className="specialist-name">{data.name}</div>
                      <div className="specialist-class">{data.class}</div>
                    </div>
                    <div className="skill-modifier" style={{ backgroundColor: data.color }}>
                      {formatModifier(data.modifier)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-skill-data">
              <p>No skill data available for the party.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PartySummary;