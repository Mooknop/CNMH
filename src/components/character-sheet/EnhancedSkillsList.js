import React, { useState } from 'react';
import './EnhancedSkillsList.css';

const EnhancedSkillsList = ({ character }) => {
  const [expandedSkills, setExpandedSkills] = useState({});

  // Define skills with their key abilities and associated actions
  const skills = [
    { 
      id: 'acrobatics', 
      name: 'Acrobatics', 
      ability: 'dexterity',
      actions: [
        { name: 'Balance', description: 'Move across a narrow surface or uneven ground.' },
        { name: 'Tumble Through', description: "Move through an enemy's space." },
        { name: 'Squeeze', description: 'Contort your body to move through tight spaces.' }
      ]
    },
    { 
      id: 'arcana', 
      name: 'Arcana', 
      ability: 'intelligence',
      actions: [
        { name: 'Recall Knowledge', description: 'About arcane theories, magical traditions, creatures of arcane significance, and planes of arcane significance.' },
        { name: 'Decipher Writing', description: 'Of an arcane nature.' },
        { name: 'Identify Magic', description: 'Specifically of the arcane tradition.' }
      ]
    },
    { 
      id: 'athletics', 
      name: 'Athletics', 
      ability: 'strength',
      actions: [
        { name: 'Climb', description: 'Move up, down, or across an incline.' },
        { name: 'Force Open', description: 'Break open a door, window, container or similar.' },
        { name: 'Grapple', description: 'Grab a creature using a free hand.' },
        { name: 'High Jump', description: 'Jump vertically to reach a higher elevation.' },
        { name: 'Long Jump', description: 'Jump horizontally to clear a gap.' },
        { name: 'Shove', description: 'Push a creature away from you.' },
        { name: 'Swim', description: 'Move through water.' },
        { name: 'Trip', description: 'Try to knock a creature to the ground.' },
        { name: 'Disarm', description: "Try to knock an item out of a creature's grasp." }
      ]
    },
    { 
      id: 'crafting', 
      name: 'Crafting', 
      ability: 'intelligence',
      actions: [
        { name: 'Craft', description: 'Create or repair an item from raw materials.' },
        { name: 'Recall Knowledge', description: 'About alchemical reactions, the value of items, engineering, unusual materials, and alchemical or mechanical creatures.' },
        { name: 'Repair', description: 'Fix a damaged item.' },
        { name: 'Identify Alchemy', description: "Determine an alchemical item's precise effect." }
      ]
    },
    { 
      id: 'deception', 
      name: 'Deception', 
      ability: 'charisma',
      actions: [
        { name: 'Create a Diversion', description: 'Throw off enemies from noticing your tactics.' },
        { name: 'Impersonate', description: 'Pretend to be someone else.' },
        { name: 'Lie', description: 'Convince someone of something false.' },
        { name: 'Feint', description: 'Trick an opponent in melee combat.' }
      ]
    },
    { 
      id: 'diplomacy', 
      name: 'Diplomacy', 
      ability: 'charisma',
      actions: [
        { name: 'Gather Information', description: 'Collect information about a specific topic.' },
        { name: 'Make an Impression', description: "Improve a creature's attitude toward you." },
        { name: 'Request', description: 'Get a creature to do what you want.' }
      ]
    },
    { 
      id: 'intimidation', 
      name: 'Intimidation', 
      ability: 'charisma',
      actions: [
        { name: 'Coerce', description: 'Force someone to do what you want under threat.' },
        { name: 'Demoralize', description: 'Frighten an enemy to become off-guard.' }
      ]
    },
    { 
      id: 'medicine', 
      name: 'Medicine', 
      ability: 'wisdom',
      actions: [
        { name: 'Administer First Aid', description: 'Stabilize a dying creature or stop bleeding.' },
        { name: 'Recall Knowledge', description: 'About diseases, injuries, poisons, and other ailments.' },
        { name: 'Treat Disease', description: 'Provide care to a diseased creature.' },
        { name: 'Treat Poison', description: 'Treat a poisoned creature.' },
        { name: 'Treat Wounds', description: 'Restore Hit Points to a living creature.' }
      ]
    },
    { 
      id: 'nature', 
      name: 'Nature', 
      ability: 'wisdom',
      actions: [
        { name: 'Command an Animal', description: 'Get an animal to perform a task.' },
        { name: 'Recall Knowledge', description: 'About fauna, flora, geography, weather, creatures of natural origin, and natural planes.' },
        { name: 'Identify Magic', description: 'Specifically of the primal tradition.' }
      ]
    },
    { 
      id: 'occultism', 
      name: 'Occultism', 
      ability: 'intelligence',
      actions: [
        { name: 'Recall Knowledge', description: 'About ancient mysteries, obscure philosophies, creatures of occult significance, and esoteric planes.' },
        { name: 'Decipher Writing', description: 'Of an occult nature.' },
        { name: 'Identify Magic', description: 'Specifically of the occult tradition.' }
      ]
    },
    { 
      id: 'performance', 
      name: 'Performance', 
      ability: 'charisma',
      actions: [
        { name: 'Perform', description: 'Put on a performance for an audience.' }
      ]
    },
    { 
      id: 'religion', 
      name: 'Religion', 
      ability: 'wisdom',
      actions: [
        { name: 'Recall Knowledge', description: 'About divine agents, the finer points of theology, obscure myths, creatures of religious significance, and divine planes.' },
        { name: 'Decipher Writing', description: 'Of a religious nature.' },
        { name: 'Identify Magic', description: 'Specifically of the divine tradition.' }
      ]
    },
    { 
      id: 'society', 
      name: 'Society', 
      ability: 'intelligence',
      actions: [
        { name: 'Recall Knowledge', description: 'About local history, important personalities, legal institutions, societal structure, and humanoid cultures.' },
        { name: 'Create Forgery', description: 'Create fake documents.' },
        { name: 'Decipher Writing', description: 'In a language you know or a cypher.' },
        { name: 'Subsist', description: 'Find food and shelter in a settlement.' }
      ]
    },
    { 
      id: 'stealth', 
      name: 'Stealth', 
      ability: 'dexterity',
      actions: [
        { name: 'Conceal an Object', description: 'Hide an object from detection.' },
        { name: 'Hide', description: 'Make yourself hidden from observation.' },
        { name: 'Sneak', description: 'Move without being detected.' }
      ]
    },
    { 
      id: 'survival', 
      name: 'Survival', 
      ability: 'wisdom',
      actions: [
        { name: 'Sense Direction', description: 'Find your way in the wild.' },
        { name: 'Track', description: "Follow a creature's trail." },
        { name: 'Cover Tracks', description: 'Hide a trail you leave behind.' },
        { name: 'Subsist', description: 'Live off the land in the wilderness.' }
      ]
    },
    { 
      id: 'thievery', 
      name: 'Thievery', 
      ability: 'dexterity',
      actions: [
        { name: 'Disable Device', description: 'Disarm a trap or similar device.' },
        { name: 'Pick a Lock', description: 'Open a lock without a key.' },
        { name: 'Palm an Object', description: 'Take an object without being noticed.' },
        { name: 'Steal', description: 'Take an object from another creature.' }
      ]
    }
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

  const toggleSkill = (skillId) => {
    setExpandedSkills(prev => ({
      ...prev,
      [skillId]: !prev[skillId]
    }));
  };
  
  return (
    <div className="enhanced-skills-list">
      <h2>Skills</h2>
      
      <div className="skills-grid">
        {skills.map(skill => {
          const proficiency = character.skills?.[skill.id]?.proficiency || 0;
          const modifier = getSkillModifier(skill.id);
          const abilityMod = getModifier(skill.ability);
          const abilityModStr = abilityMod >= 0 ? `+${abilityMod}` : abilityMod.toString();
          const isExpanded = expandedSkills[skill.id];
          
          return (
            <div key={skill.id} className={`skill-card ${proficiency > 0 ? 'trained' : 'untrained'}`}>
              <div 
                className="skill-header" 
                onClick={() => toggleSkill(skill.id)}
              >
                <div className="skill-name-section">
                  <h3>{skill.name}</h3>
                  <div className="skill-ability">
                    {skill.ability.charAt(0).toUpperCase() + skill.ability.slice(1)} ({abilityModStr})
                  </div>
                </div>
                <div className="skill-info">
                  <div className="skill-modifier">
                    {modifier >= 0 ? `+${modifier}` : modifier}
                  </div>
                  <div className="skill-proficiency">
                    {getProficiencyLabel(proficiency)}
                  </div>
                  <div className="expand-icon">
                    {isExpanded ? '▼' : '▶'}
                  </div>
                </div>
              </div>
              
              {isExpanded && (
                <div className="skill-actions">
                  <h4>Skill Actions</h4>
                  <ul className="actions-list">
                    {skill.actions.map((action, index) => (
                      <li key={index} className="skill-action">
                        <span className="action-name">{action.name}</span>
                        <span className="action-description">{action.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default EnhancedSkillsList;