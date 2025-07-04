import React, { useState } from 'react';
import './EnhancedSkillsList.css';
import CollapsibleCard from '../shared/CollapsibleCard';
import { 
  getSkillModifier, 
  getAbilityModifier, 
  formatModifier, 
  getProficiencyLabel, 
  getItemBonus,
  hasFeat
} from '../../utils/CharacterUtils';

const EnhancedSkillsList = ({ character, characterColor }) => {
  // Use the characterColor or default to the theme color
  const themeColor = characterColor || '#5e2929';

  // Check if character has Untrained Improvisation
  const hasUntrainedImprovisation = hasFeat(character, 'Untrained Improvisation');

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
    // { 
    //   id: 'computers', 
    //   name: 'Computers', 
    //   ability: 'intelligence',
    //   actions: [
    //     { name: 'Access Infosphere', description: 'You attempt to access a local netowkr, known as an infosphere, to come up with information on a topic.' },
    //     { name: 'Descipher Writing', description: 'Descipher what code and programming languages.' },
    //     { name: 'Disable Device', description: 'Disable computerized or virtual devices.' },
    //     { name: 'Hack', description: 'Try to access, control, or make changes to an active secured system.' },
    //     { name: 'Program', description: 'Spend time writing lines of code that can be integrated into computerized systems.' }
    //   ]
    // },
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
      id: 'perception',
      name: 'Perception',
      ability: 'wisdom',
      actions: [
        {name: 'Seek', description: 'Try to find something hidden, or a hiding creature you expect is around.'},
        {name: 'Sense Motive', description: `You try to tell whether a creature's behavior is abnormal or indicative of something.`},
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
    // { 
    //   id: 'piloting', 
    //   name: 'Piloting', 
    //   ability: 'dexterity',
    //   actions: [
    //     { name: 'Drive', description: 'Pilot a vehicle to move.' },
    //     { name: 'Navigate', description: 'Plan a short journey.' },
    //     { name: 'Plot Course', description: 'Plan a longer journey into the stars.' },
    //     { name: 'Run Over', description: 'Try to run over creatures with your vehicle.' },
    //     { name: 'Stop', description: 'Bring the vehicle to a stop.' },
    //     { name: 'Stunt', description: "Perform a stunt while Driving, temporarily improving the vehicle's effective capabilities at the risk of losing control." },
    //     { name: 'Take Control', description: 'Take control of a vehicle that was uncontrolled.' }
    //   ]
    // },
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
  // Function to get the proficiency color
  const getProficiencyColor = (proficiency) => {
    switch(proficiency) {
      case 1: return 'trained-color';      // Trained
      case 2: return 'expert-color';       // Expert
      case 3: return 'master-color';       // Master
      case 4: return 'legendary-color';    // Legendary
      default: return 'untrained-color';   // Untrained
    }
  };
  
  // Sort skills alphabetically
  const sortedSkills = [...skills].sort((a, b) => {
    return a.name.localeCompare(b.name);
  });

  const loreSkills = character.skills.lore;
  
  return (
    <div className="enhanced-skills-list">
      
      {/* Display Untrained Improvisation notice if character has it */}
      {hasUntrainedImprovisation && (
        <div className="feat-notice" style={{ 
          backgroundColor: '#f8f9fa', 
          padding: '0.75rem', 
          marginBottom: '1rem',
          borderLeft: `4px solid ${themeColor}`,
          borderRadius: '4px'
        }}>
          <strong style={{ color: themeColor }}>Untrained Improvisation:</strong> Your proficiency bonus to untrained skill checks is equal to 
          {character.level >= 7 
            ? ` your full level (${character.level})`
            : ` half your level (${Math.floor(character.level / 2)})`
          } instead of +0.
        </div>
      )}
      
      <div className="skills-grid">
        {sortedSkills.map(skill => {
          // Get the skill proficiency from character data (0 if not found)
          const proficiency = character.skills?.[skill.id]?.proficiency || 0;
          
          // Use the utility function to calculate the full skill modifier
          const modifier = getSkillModifier(character, skill.id);
          
          // Get the ability modifier for display
          const abilityMod = getAbilityModifier(character.abilities?.[skill.ability] || 10);
          const abilityModStr = formatModifier(abilityMod);
          
          // Get any item bonus for this skill
          const itemBonus = getItemBonus(character, skill.id);
          
          const proficiencyColorClass = getProficiencyColor(proficiency);
          
          // Add a class if this is an untrained skill but character has Untrained Improvisation
          const isUntrained = proficiency === 0;
          const hasImprovisedSkill = isUntrained && hasUntrainedImprovisation;
          
          // Create the header content
          const header = (
            <div className="skill-name-section">
              <h3 style={{ color: themeColor }}>
                {skill.name}
                <div className="skill-ability">
                  {skill.ability.charAt(0).toUpperCase() + skill.ability.slice(1)} ({abilityModStr})
                </div>
              </h3>
              <div className="skill-info">
                <div className="skill-modifier">
                  {formatModifier(modifier)}
                </div>
                <div className={`skill-proficiency ${proficiencyColorClass}`}>
                  {getProficiencyLabel(proficiency)}
                  {itemBonus > 0 && (
                    <span className="item-bonus-indicator"> (+{itemBonus} item)</span>
                  )}
                </div>
              </div>
            </div>
          );
          
          // Create the content for the collapsible part
          const content = (
            <div className="skill-actions">
              {itemBonus > 0 && (
                <div className="skill-item-bonus">
                  <span className="item-bonus-label" style={{ color: themeColor }}>Item Bonus:</span>
                  <span className="item-bonus-value">+{itemBonus} from {
                    character.inventory
                      .filter(item => item.bonus && item.bonus[0] === skill.id)
                      .map(item => item.name)
                      .join(', ')
                  }</span>
                </div>
              )}
              <h4 style={{ color: themeColor }}>Skill Actions</h4>
              <ul className="actions-list">
                {skill.actions.map((action, index) => (
                  <li key={index} className="skill-action">
                    <span className="action-name">{action.name}</span>
                    <span className="action-description">{action.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
          
          return (
            <CollapsibleCard 
              key={skill.id}
              className={`skill-card ${hasImprovisedSkill ? 'improvised-skill' : ''} ${proficiencyColorClass}`}
              header={header}
              themeColor={themeColor}
            >
              {content}
            </CollapsibleCard>
          );
        })}
      </div>
      {Array.isArray(character.skills.lore) && character.skills.lore.map((loreSkill, index) => {
        const loreId = `lore-${loreSkill.name.toLowerCase().replace(/\s+/g, '-')}`;
        const loreProficiency = loreSkill.proficiency || 0;
        const abilityMod = getAbilityModifier(character.abilities?.intelligence || 10);
        const loreModifier = abilityMod + character.level + loreSkill.proficiency*2;
        
        return (
          <CollapsibleCard 
            key={loreId}
            themeColor={themeColor}
            className={`skill-card ${getProficiencyColor(loreProficiency)}`}
            header={
              <div className="skill-name-section">
                <h3 style={{ color: themeColor }}>
                  {loreSkill.name} Lore
                  <div className="skill-ability">(Intelligence)</div>
                </h3>
                <div className="skill-info">
                  <div className="skill-modifier">{formatModifier(loreModifier)}</div>
                  <div className={`skill-proficiency ${getProficiencyColor(loreProficiency)}`}>
                    {getProficiencyLabel(loreProficiency)}
                  </div>
                </div>
              </div>
            }
          />
        );
      })}
    </div>
  );
};

export default EnhancedSkillsList;