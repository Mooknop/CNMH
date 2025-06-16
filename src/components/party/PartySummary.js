import React, { useContext } from 'react';
import { 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  Radar, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { CharacterContext } from '../../contexts/CharacterContext';
import { 
  getAbilityModifier, 
  formatModifier, 
  getSkillModifier,
  SKILL_ABILITY_MAP,
  getCharacterColor
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
        color: getCharacterColor(index),
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
  
  // Format data for radar chart
  const formatDataForRadarChart = () => {
    const abilities = ['strength', 'constitution', 'wisdom', 'charisma', 'intelligence', 'dexterity'];
    
    return abilities.map(ability => {
      const dataPoint = {
        ability: ability.substring(0, 3).toUpperCase(),
      };
      
      // Add each character's value for this ability
      partyAbilityData.forEach(char => {
        dataPoint[char.name] = char.abilities[ability];
      });
      
      return dataPoint;
    });
  };
  
  const radarData = formatDataForRadarChart();
  
  // Find min and max modifiers across all characters for radar chart scaling
  const allModifiers = partyAbilityData.flatMap(char => 
    Object.values(char.abilities)
  );
  
  const minModifier = Math.min(...allModifiers);
  const maxModifier = Math.max(...allModifiers);
  
  // Determine domain for radar chart
  // Add a small buffer to min/max for better visualization
  const domainMin = Math.floor(minModifier) - 1;
  const domainMax = Math.ceil(maxModifier) + 1;
  
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
          color: getCharacterColor(bestChar.colorIndex),
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
      <div className="summary-content">
        <div className="ability-comparison-container">
          <h3>Ability Comparison</h3>
          
          {/* Radar Chart with integrated Legend */}
          <div className="radar-chart-container" style={{ width: '100%', height: 400, marginTop: '1rem' }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart 
                outerRadius={130} 
                data={radarData}
                margin={{ top: 10, right: 30, bottom: 30, left: 30 }}
              >
                <PolarGrid />
                <PolarAngleAxis dataKey="ability" />
                <PolarRadiusAxis angle={30} domain={[domainMin, domainMax]} />
                
                {/* Create a Radar for each character */}
                {partyAbilityData.map((char) => (
                  <Radar
                    key={`radar-${char.name}`}
                    name={`${char.name}`}
                    dataKey={char.name}
                    stroke={char.color}
                    fill={char.color}
                    fillOpacity={0.2}
                  />
                ))}
                
                <Legend 
                  layout="horizontal" 
                  align="center" 
                  verticalAlign="bottom"
                  wrapperStyle={{ paddingTop: '20px' }}
                />
              </RadarChart>
            </ResponsiveContainer>
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