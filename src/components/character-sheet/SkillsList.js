import React from 'react';
import './SkillsList.css';

const SkillsList = ({ character }) => {
  const skills = [
    { id: 'acrobatics', name: 'Acrobatics', ability: 'dexterity' },
    { id: 'arcana', name: 'Arcana', ability: 'intelligence' },
    { id: 'athletics', name: 'Athletics', ability: 'strength' },
    { id: 'crafting', name: 'Crafting', ability: 'intelligence' },
    { id: 'deception', name: 'Deception', ability: 'charisma' },
    { id: 'diplomacy', name: 'Diplomacy', ability: 'charisma' },
    { id: 'intimidation', name: 'Intimidation', ability: 'charisma' },
    { id: 'medicine', name: 'Medicine', ability: 'wisdom' },
    { id: 'nature', name: 'Nature', ability: 'wisdom' },
    { id: 'occultism', name: 'Occultism', ability: 'intelligence' },
    { id: 'performance', name: 'Performance', ability: 'charisma' },
    { id: 'religion', name: 'Religion', ability: 'wisdom' },
    { id: 'society', name: 'Society', ability: 'intelligence' },
    { id: 'stealth', name: 'Stealth', ability: 'dexterity' },
    { id: 'survival', name: 'Survival', ability: 'wisdom' },
    { id: 'thievery', name: 'Thievery', ability: 'dexterity' }
  ];
  
  const getModifier = (ability) => {
    const abilityValue = character.abilities ? character.abilities[ability] || 10 : 10;
    return Math.floor((abilityValue - 10) / 2);
  };
  
  const getSkillModifier = (skillId) => {
    const skill = skills.find(s => s.id === skillId);
    const abilityMod = getModifier(skill.ability);
    const proficiencyValue = character.skills && character.skills[skillId] ? 
      character.skills[skillId].proficiency || 0 : 0;
    
    let proficiencyMod = 0;
    if (proficiencyValue > 0) {
      // Trained (+2), Expert (+4), Master (+6), Legendary (+8)
      proficiencyMod = proficiencyValue * 2 + character.level;
    }
    
    return abilityMod + proficiencyMod;
  };
  
  const getProficiencyLabel = (proficiency) => {
    switch(proficiency) {
      case 1: return 'Trained';
      case 2: return 'Expert';
      case 3: return 'Master';
      case 4: return 'Legendary';
      default: return 'Untrained';
    }
  };
  
  return (
    <div className="skills-list">
      <h2>Skills</h2>
      
      <table>
        <thead>
          <tr>
            <th>Skill</th>
            <th>Key Ability</th>
            <th>Modifier</th>
            <th>Proficiency</th>
          </tr>
        </thead>
        <tbody>
          {skills.map(skill => {
            const proficiency = character.skills?.[skill.id]?.proficiency || 0;
            const modifier = getSkillModifier(skill.id);
            const abilityMod = getModifier(skill.ability);
            const abilityModStr = abilityMod >= 0 ? `+${abilityMod}` : abilityMod.toString();
            
            return (
              <tr key={skill.id}>
                <td>{skill.name}</td>
                <td className="ability-column">{skill.ability.substring(0, 3).toUpperCase()} ({abilityModStr})</td>
                <td className="modifier-column">{modifier >= 0 ? `+${modifier}` : modifier}</td>
                <td className="proficiency-column">{getProficiencyLabel(proficiency)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default SkillsList;