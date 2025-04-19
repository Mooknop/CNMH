// src/components/party/PartySummary.js
import React, { useContext } from 'react';
import { CharacterContext } from '../../contexts/CharacterContext';
import { 
  getAbilityModifier, 
  formatModifier, 
  getSkillModifier,
  SKILL_ABILITY_MAP
} from '../../utils/CharacterUtils';
import './PartySummary.css';

const PartySummary = () => {
  const { characters } = useContext(CharacterContext);
  
  // Get all the ability modifiers for the party
  const abilityData = characters.map(char => {
    const abilities = char.abilities || {};
    return {
      name: char.name,
      strength: getAbilityModifier(abilities.strength || 10),
      dexterity: getAbilityModifier(abilities.dexterity || 10),
      constitution: getAbilityModifier(abilities.constitution || 10),
      intelligence: getAbilityModifier(abilities.intelligence || 10),
      wisdom: getAbilityModifier(abilities.wisdom || 10),
      charisma: getAbilityModifier(abilities.charisma || 10)
    };
  });
  
  // Find the min and max modifiers for scaling the chart
  const allModifiers = abilityData.flatMap(char => [
    char.strength, char.dexterity, char.constitution, 
    char.intelligence, char.wisdom, char.charisma
  ]);
  
  const minModifier = Math.min(...allModifiers);
  const maxModifier = Math.max(...allModifiers);
  
  // Scale value between min and max to fit within the chart (0-100)
  const scaleValue = (value) => {
    if (minModifier === maxModifier) return 50; // Prevent division by zero
    return ((value - minModifier) / (maxModifier - minModifier)) * 100;
  };
  
  // Colors for each character (will be cycled through)
  const colors = [
    '#e57373', // red
    '#64b5f6', // blue
    '#81c784', // green
    '#ba68c8', // purple
    '#ffd54f'  // yellow
  ];

  // Find the best character for each skill
  const findBestAtSkill = () => {
    // List of all PF2E skills
    const allSkills = Object.keys(SKILL_ABILITY_MAP);
    
    const bestCharacters = {};
    
    allSkills.forEach(skill => {
      let bestChar = null;
      let bestModifier = -Infinity;
      
      characters.forEach(char => {
        const modifier = getSkillModifier(char, skill);
        if (modifier > bestModifier) {
          bestModifier = modifier;
          bestChar = char;
        }
      });
      
      if (bestChar) {
        bestCharacters[skill] = {
          name: bestChar.name,
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
        <div className="ability-charts-container">
          <h3>Character Ability Modifiers</h3>
          <div className="spider-charts-grid">
            {abilityData.map((char, index) => (
              <div key={char.name} className="character-chart-container">
                <h4 className="character-chart-name">{char.name}</h4>
                <div className="spider-chart">
                  <div className="chart-labels">
                    <span className="chart-label str">STR</span>
                    <span className="chart-label dex">DEX</span>
                    <span className="chart-label con">CON</span>
                    <span className="chart-label int">INT</span>
                    <span className="chart-label wis">WIS</span>
                    <span className="chart-label cha">CHA</span>
                  </div>
                  
                  <div className="chart-polygons">
                    <div 
                      className="character-polygon"
                      style={{
                        clipPath: `polygon(
                          50% 0%, 
                          ${50 + scaleValue(char.strength) / 2}% ${5 + scaleValue(char.strength) / 5}%, 
                          100% 50%, 
                          ${50 + scaleValue(char.dexterity) / 2}% ${95 - scaleValue(char.dexterity) / 5}%, 
                          50% 100%, 
                          ${50 - scaleValue(char.constitution) / 2}% ${95 - scaleValue(char.constitution) / 5}%, 
                          0% 50%, 
                          ${50 - scaleValue(char.intelligence) / 2}% ${5 + scaleValue(char.intelligence) / 5}%
                        )`,
                        backgroundColor: `${colors[index % colors.length]}`
                      }}
                    ></div>
                  </div>
                  
                  <div className="chart-grid">
                    <div className="grid-circle circle-1"></div>
                    <div className="grid-circle circle-2"></div>
                    <div className="grid-circle circle-3"></div>
                  </div>
                </div>
                <div className="ability-values">
                  <span>STR: {formatModifier(char.strength)}</span>
                  <span>DEX: {formatModifier(char.dexterity)}</span>
                  <span>CON: {formatModifier(char.constitution)}</span>
                  <span>INT: {formatModifier(char.intelligence)}</span>
                  <span>WIS: {formatModifier(char.wisdom)}</span>
                  <span>CHA: {formatModifier(char.charisma)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="best-skills-container">
          <h3>Party Skill Specialists</h3>
          {Object.keys(bestSkillCharacters).length > 0 ? (
            <div className="best-skills-grid">
              {Object.entries(bestSkillCharacters)
                .sort((a, b) => a[0].localeCompare(b[0])) // Sort alphabetically by skill name
                .map(([skillName, data]) => (
                <div key={skillName} className="skill-card">
                  <div className="skill-name">{formatSkillName(skillName)}</div>
                  <div className="best-character">
                    <span className="character-name">{data.name}</span>
                    <span className="skill-modifier">{formatModifier(data.modifier)}</span>
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