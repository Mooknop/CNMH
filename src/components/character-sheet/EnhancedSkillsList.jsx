import React, { useState } from 'react';
import './EnhancedSkillsList.css';
import PenaltyDisplay from '../shared/PenaltyDisplay';
import RankRing from '../shared/RankRing';
import { useCharacter } from '../../hooks/useCharacter';
import { useEffects } from '../../hooks/useEffects';
import { useContent } from '../../contexts/ContentContext';
import { computeConditionEffects } from '../../utils/ConditionUtils';
import { combineModifiers, conditionalModifiersFor } from '../../utils/EffectUtils';
import { getLoreSkillModifier, formatModifier } from '../../utils/CharacterUtils';
import { SKILLS, skillsForAbility } from '../../data/skills';

const EMPTY_MOD = { total: 0, sources: [] };
const RANK_LABELS = ['Untrained', 'Trained', 'Expert', 'Master', 'Legendary'];

// `filterAbility` (optional) narrows the list to one ability's skills — the
// Ability Dial renders one instance per selected node. Lore skills are
// Intelligence-based, so they only render unfiltered or under 'intelligence'.
//
// Ability Dial S2: skills render as mini rank-rings (RankRing) echoing the
// dial — modifier inside, rank = ring color, name below. Pressing a ring
// opens a detail strip under the cluster with the skill's actions; the S3
// pull-up sheet replaces that strip as the single skill-detail surface.
const EnhancedSkillsList = ({ character, characterColor, activeConditions = [], effectBonuses = {}, filterAbility }) => {
  // Use the characterColor or default to the theme color
  const themeColor = characterColor || 'var(--color-primary)';

  // Which snode's detail strip is open (skill id / lore id, or null).
  const [detailId, setDetailId] = useState(null);
  const toggleDetail = (id) => setDetailId((prev) => (prev === id ? null : id));

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

  // The open snode's detail strip — the old collapsed-card body made
  // cluster-level: skill meta, item-bonus sources, and the action list.
  const renderDetail = () => {
    const skill = sortedSkills.find((s) => s.id === detailId);
    const lore = visibleLore.find(
      (l) => `lore-${l.name.toLowerCase().replace(/\s+/g, '-')}` === detailId
    );
    if (!skill && !lore) return null;

    if (lore) {
      return (
        <div className="snode-detail">
          <div className="snode-detail-h">
            <h4>{lore.name} Lore</h4>
            <span className="snode-detail-meta">
              Intelligence · {RANK_LABELS[lore.proficiency || 0]}
            </span>
          </div>
        </div>
      );
    }

    const itemBonus = itemBonuses[skill.id] || 0;
    const abilityMod = abilityModifiers[skill.ability] || 0;
    return (
      <div className="snode-detail">
        <div className="snode-detail-h">
          <h4>{skill.name}</h4>
          <span className="snode-detail-meta">
            {skill.ability.charAt(0).toUpperCase() + skill.ability.slice(1)}{' '}
            ({formatModifier(abilityMod)}) · {RANK_LABELS[skillProficiencies[skill.id] || 0]}
          </span>
        </div>
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
              selected={detailId === skill.id}
              onClick={() => toggleDetail(skill.id)}
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
              selected={detailId === loreId}
              onClick={() => toggleDetail(loreId)}
            />
          );
        })}
      </div>
      {renderDetail()}
    </div>
  );
};

export default EnhancedSkillsList;
