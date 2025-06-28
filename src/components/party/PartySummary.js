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

  // Custom tick formatter to show +/- modifiers
  const formatTick = (value) => {
    if (value === 0) return '0';
    return value > 0 ? `+${value}` : `${value}`;
  };
  
  return (
    <div className="party-summary">
      {/* Character Details Grid */}
      <div className="summary-content">
            <h3>Party Members</h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '1rem'
            }}>
              {partyAbilityData.map((char, index) => (
                <div key={char.name} style={{
                  background: 'rgba(255, 255, 255, 0.7)',
                  borderRadius: '8px',
                  padding: '1rem',
                  border: `3px solid ${char.color}`,
                  boxShadow: '0 4px 12px rgba(255, 255, 255, 0.1)',
                  backdropFilter: 'blur(3px)'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: '0.75rem'
                  }}>
                    <div style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      backgroundColor: char.color,
                      marginRight: '0.5rem'
                    }}></div>
                    <div>
                      <h4 style={{ 
                        margin: 0, 
                        color: char.color,
                        fontSize: '1.1rem',
                        fontWeight: '700',
                        textShadow: '2px 2px 4px rgba(255, 255, 255, 0.8)'
                      }}>
                        {char.name}
                      </h4>
                      <p style={{ 
                        margin: 0, 
                        color: '#666',
                        fontSize: '0.9rem',
                        fontWeight: '500'
                      }}>
                        {char.class}
                      </p>
                    </div>
                  </div>
                  
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '0.5rem',
                    fontSize: '0.85rem'
                  }}>
                    {Object.entries(char.abilities).map(([ability, modifier]) => (
                      <div key={ability} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '0.25rem 0.5rem',
                        background: 'rgba(94, 41, 41, 0.1)',
                        borderRadius: '4px'
                      }}>
                        <span style={{ 
                          fontWeight: '600',
                          color: '#5e2929',
                          textTransform: 'capitalize'
                        }}>
                          {ability.slice(0, 3)}:
                        </span>
                        <span style={{ 
                          fontWeight: '700',
                          color: modifier >= 0 ? '#228B22' : '#DC143C'
                        }}>
                          {modifier >= 0 ? `+${modifier}` : modifier}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
        </div>
      <div className="summary-content">
        <div className="ability-comparison-container">
          <h3>Ability Comparison</h3>
          {/* Enhanced Radar Chart */}
            <div style={{ 
              width: '100%', 
              height: '500px', 
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              padding: '1rem',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
              border: '1px solid rgba(94, 41, 41, 0.2)'
            }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart 
                  outerRadius={150} 
                  data={radarData}
                  margin={{ top: 20, right: 40, bottom: 60, left: 40 }}
                >
                  {/* Enhanced polar grid with better contrast */}
                  <PolarGrid 
                    stroke="#5e2929" 
                    strokeWidth={1.5}
                    strokeOpacity={0.6}
                    fill="rgba(94, 41, 41, 0.02)"
                  />
                  
                  {/* Enhanced angle axis with better readability */}
                  <PolarAngleAxis 
                    dataKey="ability" 
                    tick={{ 
                      fill: '#2c1810', 
                      fontSize: 14, 
                      fontWeight: '700',
                      textAnchor: 'middle'
                    }}
                    tickSize={8}
                    stroke="#5e2929"
                    strokeWidth={2}
                  />
                  
                  {/* Enhanced radius axis with clear modifiers */}
                  <PolarRadiusAxis 
                    angle={30} 
                    domain={[domainMin, domainMax]}
                    tick={{ 
                      fill: '#5e2929', 
                      fontSize: 12, 
                      fontWeight: '600'
                    }}
                    tickFormatter={formatTick}
                    stroke="#8b4513"
                    strokeWidth={1}
                    strokeOpacity={0.7}
                  />
                  
                  {/* Create enhanced Radar for each character */}
                  {partyAbilityData.map((char, index) => (
                    <Radar
                      key={`radar-${char.name}`}
                      name={char.name}
                      dataKey={char.name}
                      stroke={char.color}
                      strokeWidth={3}
                      fill={char.color}
                      fillOpacity={0.15}
                      dot={{ 
                        fill: char.color, 
                        strokeWidth: 2, 
                        stroke: '#fff',
                        r: 5
                      }}
                    />
                  ))}
                </RadarChart>
              </ResponsiveContainer>
            </div>
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
  );
};

export default PartySummary;