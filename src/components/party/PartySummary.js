// src/components/party/PartySummary.js
import React, { useContext } from 'react';
import { CharacterContext } from '../../contexts/CharacterContext';
import './PartySummary.css';

const PartySummary = () => {
  const { characters } = useContext(CharacterContext);
  
  // Calculate ability modifiers for each character
  const getModifier = (abilityScore) => {
    return Math.floor((abilityScore - 10) / 2);
  };
  
  // Get all the ability modifiers for the party
  const abilityData = characters.map(char => {
    const abilities = char.abilities || {};
    return {
      name: char.name,
      strength: getModifier(abilities.strength || 10),
      dexterity: getModifier(abilities.dexterity || 10),
      constitution: getModifier(abilities.constitution || 10),
      intelligence: getModifier(abilities.intelligence || 10),
      wisdom: getModifier(abilities.wisdom || 10),
      charisma: getModifier(abilities.charisma || 10)
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
  
  // Collect all expert skills from the party
  const expertSkills = {};
  
  characters.forEach(char => {
    const skills = char.skills || {};
    
    Object.entries(skills).forEach(([skillName, skillData]) => {
      if (skillData.proficiency >= 2) { // Expert or higher
        if (!expertSkills[skillName]) {
          expertSkills[skillName] = [];
        }
        expertSkills[skillName].push({
          name: char.name,
          proficiency: skillData.proficiency
        });
      }
    });
  });
  
  // Format skill names for better display
  const formatSkillName = (name) => {
    return name.charAt(0).toUpperCase() + name.slice(1);
  };
  
  // Get proficiency label
  const getProficiencyLabel = (proficiency) => {
    switch(proficiency) {
      case 2: return 'Expert';
      case 3: return 'Master';
      case 4: return 'Legendary';
      default: return 'Trained';
    }
  };
  
  return (
    <div className="party-summary">
      <h2>Party Overview</h2>
      
      <div className="summary-content">
        <div className="ability-chart-container">
          <h3>Ability Modifiers</h3>
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
              {abilityData.map((char, index) => (
                <div 
                  key={char.name}
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
                    backgroundColor: `${colors[index % colors.length]}80` // add 80 for opacity
                  }}
                >
                  <span className="character-name">{char.name}</span>
                </div>
              ))}
            </div>
            
            <div className="chart-grid">
              <div className="grid-circle circle-1"></div>
              <div className="grid-circle circle-2"></div>
              <div className="grid-circle circle-3"></div>
            </div>
          </div>
          
          <div className="chart-legend">
            {abilityData.map((char, index) => (
              <div key={char.name} className="legend-item">
                <div 
                  className="legend-color" 
                  style={{ backgroundColor: colors[index % colors.length] }}
                ></div>
                <span className="legend-name">{char.name}</span>
                <div className="legend-stats">
                  <span>STR: {char.strength >= 0 ? '+' : ''}{char.strength}</span>
                  <span>DEX: {char.dexterity >= 0 ? '+' : ''}{char.dexterity}</span>
                  <span>CON: {char.constitution >= 0 ? '+' : ''}{char.constitution}</span>
                  <span>INT: {char.intelligence >= 0 ? '+' : ''}{char.intelligence}</span>
                  <span>WIS: {char.wisdom >= 0 ? '+' : ''}{char.wisdom}</span>
                  <span>CHA: {char.charisma >= 0 ? '+' : ''}{char.charisma}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="expert-skills-container">
          <h3>Expert+ Skills</h3>
          {Object.keys(expertSkills).length > 0 ? (
            <div className="expert-skills-grid">
              {Object.entries(expertSkills).map(([skillName, characters]) => (
                <div key={skillName} className="skill-card">
                  <h4>{formatSkillName(skillName)}</h4>
                  <div className="skill-characters">
                    {characters.map((char, index) => (
                      <div key={index} className="skill-character">
                        <span className="character-name">{char.name}</span>
                        <span className={`proficiency-badge prof-${char.proficiency}`}>
                          {getProficiencyLabel(char.proficiency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-expert-skills">
              <p>No party members have expert proficiency in any skills yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PartySummary;