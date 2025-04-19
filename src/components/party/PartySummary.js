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

  // Calculate skill modifiers for all characters
  const calculateSkillModifier = (character, skillName) => {
    const skills = character.skills || {};
    const skillData = skills[skillName] || { proficiency: 0 };
    
    // Determine the ability modifier for this skill
    let abilityMod = 0;
    const abilities = character.abilities || {};
    
    // Map skills to their corresponding ability scores (based on PF2E rules)
    const skillAbilities = {
      acrobatics: 'dexterity',
      arcana: 'intelligence',
      athletics: 'strength',
      crafting: 'intelligence',
      deception: 'charisma',
      diplomacy: 'charisma',
      intimidation: 'charisma',
      medicine: 'wisdom',
      nature: 'wisdom',
      occultism: 'intelligence',
      performance: 'charisma',
      religion: 'wisdom',
      society: 'intelligence',
      stealth: 'dexterity',
      survival: 'wisdom',
      thievery: 'dexterity'
    };
    
    const abilityKey = skillAbilities[skillName] || 'dexterity';
    abilityMod = getModifier(abilities[abilityKey] || 10);
    
    // Calculate proficiency bonus: Untrained (0), Trained (+2), Expert (+4), Master (+6), Legendary (+8) + level
    let profBonus = 0;
    if (skillData.proficiency > 0) {
      profBonus = skillData.proficiency * 2 + (character.level || 0);
    }
    
    return abilityMod + profBonus;
  };
  
  // Find the best character for each skill
  const findBestAtSkill = () => {
    // List of all PF2E skills
    const allSkills = [
      'acrobatics', 'arcana', 'athletics', 'crafting', 'deception', 
      'diplomacy', 'intimidation', 'medicine', 'nature', 'occultism', 
      'performance', 'religion', 'society', 'stealth', 'survival', 'thievery'
    ];
    
    const bestCharacters = {};
    
    allSkills.forEach(skill => {
      let bestChar = null;
      let bestModifier = -Infinity;
      
      characters.forEach(char => {
        const modifier = calculateSkillModifier(char, skill);
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
                    <span className="skill-modifier">{data.modifier >= 0 ? '+' : ''}{data.modifier}</span>
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