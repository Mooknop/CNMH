// src/components/actions/CharacterActionsList.js
import React from 'react';
import ActionCardList from './ActionCardList';
import StrikesList from './StrikesList';
import ThaumaturgeExploitsDisplay from './ThaumaturgeExploitsDisplay';
import { useCharacter } from '../../hooks/useCharacter';
import {
  BASIC_ACTIONS_OFFENSIVE,
  BASIC_ACTIONS_DEFENSIVE,
  BASIC_ACTIONS_MOVEMENT,
} from '../../data/encounterActions';

const SectionDivider = ({ label, themeColor }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    margin: '1.5rem 0 0.5rem',
  }}>
    <span style={{ color: themeColor, fontWeight: '700', fontSize: '0.8rem', letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
      {label}
    </span>
    <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--color-border)' }} />
  </div>
);

const profLabel = (rank) => {
  if (rank >= 4) return 'Legendary';
  if (rank >= 3) return 'Master';
  if (rank >= 2) return 'Expert';
  return null;
};

const CharacterActionsList = ({ character, themeColor }) => {
  const { actions, flags, thaumaturge, skillProficiencies } = useCharacter(character);
  const { isThaumaturge } = flags;

  const withHighlights = (items) =>
    items.map((action) => {
      if (!action.highlightSkill) return action;
      const label = profLabel(skillProficiencies[action.highlightSkill] || 0);
      return label ? { ...action, highlight: label } : action;
    });

  return (
    <div className="actions-container">
      <StrikesList character={character} themeColor={themeColor} />
      {isThaumaturge && (
        <ThaumaturgeExploitsDisplay thaumaturge={thaumaturge} themeColor={themeColor} />
      )}
      <ActionCardList
        items={actions}
        type="action"
        themeColor={themeColor}
        emptyMessage="No unique actions available for this character."
      />

      <SectionDivider label="Offensive" themeColor={themeColor} />
      <ActionCardList items={withHighlights(BASIC_ACTIONS_OFFENSIVE)} type="action" themeColor={themeColor} />

      <SectionDivider label="Defensive" themeColor={themeColor} />
      <ActionCardList items={withHighlights(BASIC_ACTIONS_DEFENSIVE)} type="action" themeColor={themeColor} />

      <SectionDivider label="Movement" themeColor={themeColor} />
      <ActionCardList items={withHighlights(BASIC_ACTIONS_MOVEMENT)} type="action" themeColor={themeColor} />
    </div>
  );
};

export default CharacterActionsList;
