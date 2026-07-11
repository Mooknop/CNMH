import React, { useState } from 'react';
import './EnhancedSkillsList.css';
import PenaltyDisplay from '../shared/PenaltyDisplay';
import RankRing from '../shared/RankRing';
import SkillSheet from './SkillSheet';
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
//
// Skills render as mini rank-rings (RankRing) echoing the dial — modifier
// inside, rank = ring color, name below. Pressing a ring raises the
// SkillSheet pull-up (S3) — the single skill-detail surface.
const EnhancedSkillsList = ({ character, characterColor, activeConditions = [], effectBonuses = {}, filterAbility }) => {
  // Use the characterColor or default to the theme color
  const themeColor = characterColor || 'var(--color-primary)';

  // The raised pull-up sheet — { skill, stats } or { lore }, null when down.
  const [sheet, setSheet] = useState(null);

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

  // Skill catalog + ability grouping live in src/data/skills.js (shared
  // with the Ability Dial). Narrow to one ability when the dial asks for it.
  const skills = filterAbility ? skillsForAbility(filterAbility) : SKILLS;

  // Sort skills alphabetically
  const sortedSkills = [...skills].sort((a, b) => {
    return a.name.localeCompare(b.name);
  });

  // Lore skills ride along under Intelligence (or unfiltered).
  const showLore = !filterAbility || filterAbility === 'intelligence';
  const visibleLore = showLore ? loreSkills : [];

  // Conditional ('vs X') effect modifiers for a skill/perception, shown as a
  // small reminder under the snode name (#510). The `vs` text names the
  // sub-context the modifier applies to — e.g. "+1 vs Climb (Gecko Potion)",
  // "−1 vs Recall Knowledge (Drakeheart Mutagen)" — so it reads faithfully on
  // the exact roll it affects rather than the whole skill. Perception is one of
  // the skill snodes, so this covers it too. Returns null when none apply.
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

  // Names of the items granting a skill's item bonus — shown on the sheet's
  // Item breakdown chip.
  const itemSourcesFor = (skillId) =>
    inventory
      .filter((item) => item.bonus && item.bonus[0] === skillId)
      .map((item) => item.name)
      .join(', ');

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

      <div className="snode-wrap">
        {sortedSkills.map(skill => {
          const proficiency = skillProficiencies[skill.id] || 0;
          const modifier    = skillModifiers[skill.id] || 0;
          const itemBonus   = itemBonuses[skill.id] || 0;
          // Net condition penalties with active-effect skill bonuses (#447), e.g.
          // Upstage's +1 status to skill checks. combineModifiers carries each
          // source's isBuff flag so PenaltyDisplay colours buffs vs penalties.
          const skillMods   = combineModifiers(
            condEffects.skillPenalty(skill.ability),
            effectBonuses[skill.id] ?? EMPTY_MOD
          );

          return (
            <RankRing
              key={skill.id}
              rank={proficiency}
              name={skill.name}
              value={<PenaltyDisplay base={modifier} penalty={skillMods} format="modifier" />}
              caption={itemBonus > 0 ? `+${itemBonus} item` : undefined}
              hint={renderConditionalHint(skill.id)}
              selected={sheet?.skill?.id === skill.id}
              onClick={() =>
                setSheet({
                  skill,
                  stats: {
                    modifier,
                    rank: proficiency,
                    abilityMod: abilityModifiers[skill.ability] || 0,
                    itemBonus,
                    itemSources: itemBonus > 0 ? itemSourcesFor(skill.id) : '',
                    skillMods,
                  },
                })
              }
            />
          );
        })}
        {visibleLore.map((loreSkill) => {
          const loreId = `lore-${loreSkill.name.toLowerCase().replace(/\s+/g, '-')}`;
          const loreProficiency = loreSkill.proficiency || 0;
          const loreModifier = getLoreSkillModifier(charModel, loreSkill.name);
          const lorePenalty = condEffects.skillPenalty('intelligence');

          return (
            <RankRing
              key={loreId}
              rank={loreProficiency}
              name={`${loreSkill.name} Lore`}
              value={<PenaltyDisplay base={loreModifier} penalty={lorePenalty} format="modifier" />}
              selected={sheet?.lore?.name === loreSkill.name}
              onClick={() =>
                setSheet({
                  lore: loreSkill,
                  stats: {
                    modifier: loreModifier,
                    rank: loreProficiency,
                    abilityMod: abilityModifiers.intelligence || 0,
                    itemBonus: 0,
                    itemSources: '',
                    skillMods: lorePenalty,
                  },
                })
              }
            />
          );
        })}
      </div>
      {sheet && (
        <SkillSheet
          character={character}
          themeColor={themeColor}
          skill={sheet.skill}
          lore={sheet.lore}
          stats={sheet.stats}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
};

export default EnhancedSkillsList;
