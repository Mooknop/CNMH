import React from 'react';
import './EnhancedSkillsList.css';
import CollapsibleCard from '../shared/CollapsibleCard';
import PenaltyDisplay from '../shared/PenaltyDisplay';
import ProficiencyPips from '../shared/ProficiencyPips';
import { useCharacter } from '../../hooks/useCharacter';
import { useEffects } from '../../hooks/useEffects';
import { useContent } from '../../contexts/ContentContext';
import { computeConditionEffects } from '../../utils/ConditionUtils';
import { combineModifiers, conditionalModifiersFor } from '../../utils/EffectUtils';
import { getLoreSkillModifier, formatModifier } from '../../utils/CharacterUtils';
import { SKILLS, skillsForAbility } from '../../data/skills';

const EMPTY_MOD = { total: 0, sources: [] };

// `filterAbility` (optional) narrows the list to one ability's skills — the
// Ability Dial renders one instance per selected node. Lore skills are
// Intelligence-based, so they only render unfiltered or under 'intelligence'.
const EnhancedSkillsList = ({ character, characterColor, activeConditions = [], effectBonuses = {}, filterAbility }) => {
  // Use the characterColor or default to the theme color
  const themeColor = characterColor || 'var(--color-primary)';

  // Data layer — all character reads go through this hook
  const charModel = useCharacter(character);

  // Active effects + catalog (#510): conditional ('vs X') effect modifiers can't
  // net into the always-on skill/perception number (the app can't know a roll's
  // sub-context), so they surface as a per-skill reminder hint — the same
  // pattern StatsBlock uses for conditional save modifiers (#338). Read the same
  // sources StatsBlock does.
  const { effects: activeEffects } = useEffects(character?.id || '');
  const { effects: effectCatalog } = useContent();

  const {
    skillModifiers,
    skillProficiencies,
    itemBonuses,
    abilityModifiers,
    loreSkills,
    level,
    inventory,
    flags,
  } = charModel;

  const hasUntrainedImprovisation = flags.hasUntrainedImprovisation;

  const condEffects = computeConditionEffects(activeConditions, character?.keyAbility, level);

  // Skill catalog + ability grouping now live in src/data/skills.js (shared
  // with the Ability Dial). Narrow to one ability when the dial asks for it.
  const skills = filterAbility ? skillsForAbility(filterAbility) : SKILLS;

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

  // Conditional ('vs X') effect modifiers for a skill/perception, shown as a
  // small reminder beneath the card header (#510). The `vs` text names the
  // sub-context the modifier applies to — e.g. "+1 vs Climb (Gecko Potion)",
  // "−1 vs Recall Knowledge (Drakeheart Mutagen)" — so it reads faithfully on
  // the exact roll it affects rather than the whole skill. Perception is one of
  // the skill cards, so this covers it too. Returns null when none apply.
  const renderConditionalHint = (skillId) => {
    const mods = conditionalModifiersFor(activeEffects, skillId, effectCatalog);
    if (!mods.length) return null;
    return (
      <div className="skill-conditional-hint" role="note">
        {mods.map((m, i) => (
          <span key={i} className="skill-conditional-item">
            {formatModifier(m.amount)} vs {m.vs}{' '}
            <span className="skill-conditional-src">({m.label})</span>
          </span>
        ))}
      </div>
    );
  };

  
  return (
    <div className="enhanced-skills-list" style={{ '--color-theme': themeColor }}>

      {/* Display Untrained Improvisation notice if character has it */}
      {hasUntrainedImprovisation && (
        <div className="feat-notice">
          <strong>Untrained Improvisation:</strong> Your proficiency bonus to untrained skill checks is equal to
          {level >= 7
            ? ` your full level (${level})`
            : ` half your level (${Math.floor(level / 2)})`
          } instead of +0.
        </div>
      )}
      
      <div className="skills-grid">
        {sortedSkills.map(skill => {
          const proficiency = skillProficiencies[skill.id] || 0;
          const modifier    = skillModifiers[skill.id] || 0;
          const abilityMod  = abilityModifiers[skill.ability] || 0;
          const abilityModStr = abilityMod >= 0 ? `+${abilityMod}` : String(abilityMod);
          const itemBonus   = itemBonuses[skill.id] || 0;
          // Net condition penalties with active-effect skill bonuses (#447), e.g.
          // Upstage's +1 status to skill checks. combineModifiers carries each
          // source's isBuff flag so PenaltyDisplay colours buffs vs penalties.
          const skillMods   = combineModifiers(
            condEffects.skillPenalty(skill.ability),
            effectBonuses[skill.id] ?? EMPTY_MOD
          );

          const proficiencyColorClass = getProficiencyColor(proficiency);

          const isUntrained = proficiency === 0;
          const hasImprovisedSkill = isUntrained && hasUntrainedImprovisation;

          const header = (
            <div className="skill-name-section">
              <h3>
                {skill.name}
                <div className="skill-ability">
                  {skill.ability.charAt(0).toUpperCase() + skill.ability.slice(1)} ({abilityModStr})
                </div>
              </h3>
              <div className="skill-info">
                <div className="skill-modifier">
                  <PenaltyDisplay base={modifier} penalty={skillMods} format="modifier" />
                </div>
                <div className={`skill-proficiency ${proficiencyColorClass}`}>
                  <ProficiencyPips rank={proficiency} showLabel={false} />
                  {itemBonus > 0 && (
                    <span className="item-bonus-indicator"> (+{itemBonus} item)</span>
                  )}
                </div>
              </div>
              {renderConditionalHint(skill.id)}
            </div>
          );
          
          // Create the content for the collapsible part
          const content = (
            <div className="skill-actions">
              {itemBonus > 0 && (
                <div className="skill-item-bonus">
                  <span className="item-bonus-label">Item Bonus:</span>
                  <span className="item-bonus-value">+{itemBonus} from {
                    inventory
                      .filter(item => item.bonus && item.bonus[0] === skill.id)
                      .map(item => item.name)
                      .join(', ')
                  }</span>
                </div>
              )}
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
      {(!filterAbility || filterAbility === 'intelligence') && loreSkills.map((loreSkill) => {
        const loreId = `lore-${loreSkill.name.toLowerCase().replace(/\s+/g, '-')}`;
        const loreProficiency = loreSkill.proficiency || 0;
        const loreModifier = getLoreSkillModifier(charModel, loreSkill.name);
        const lorePenalty = condEffects.skillPenalty('intelligence');

        return (
          <CollapsibleCard
            key={loreId}
            themeColor={themeColor}
            className={`skill-card ${getProficiencyColor(loreProficiency)}`}
            header={
              <div className="skill-name-section">
                <h3>
                  {loreSkill.name} Lore
                  <div className="skill-ability">(Intelligence)</div>
                </h3>
                <div className="skill-info">
                  <div className="skill-modifier">
                    <PenaltyDisplay base={loreModifier} penalty={lorePenalty} format="modifier" />
                  </div>
                  <div className={`skill-proficiency ${getProficiencyColor(loreProficiency)}`}>
                    <ProficiencyPips rank={loreProficiency} showLabel={false} />
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