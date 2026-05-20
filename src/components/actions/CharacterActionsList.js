// src/components/actions/CharacterActionsList.js
import React, { useState } from 'react';
import ActionCardList from './ActionCardList';
import ActionCategoryModal from './ActionCategoryModal';
import ThaumaturgeExploitsDisplay from './ThaumaturgeExploitsDisplay';
import { useCharacter } from '../../hooks/useCharacter';
import {
  BASIC_ACTIONS_OFFENSIVE,
  BASIC_ACTIONS_DEFENSIVE,
  BASIC_ACTIONS_MOVEMENT,
} from '../../data/encounterActions';
import './CharacterActionsList.css';

const profLabel = (rank) => {
  if (rank >= 4) return 'Legendary';
  if (rank >= 3) return 'Master';
  if (rank >= 2) return 'Expert';
  return null;
};

const CharacterActionsList = ({ character, themeColor, encounterMode, onUse, onMagicOpen }) => {
  const { actions, flags, thaumaturge, skillProficiencies } = useCharacter(character);
  const { isThaumaturge } = flags;

  const [openModal, setOpenModal] = useState(null); // 'offensive'|'defensive'|'movement'|null

  const withHighlights = (items) =>
    items.map((action) => {
      if (!action.highlightSkill) return action;
      const label = profLabel(skillProficiencies[action.highlightSkill] || 0);
      return label ? { ...action, highlight: label } : action;
    });

  const categoryButtons = [
    { key: 'offensive', label: 'Offensive' },
    { key: 'defensive', label: 'Defensive' },
    { key: 'movement', label: 'Movement' },
    { key: 'magic', label: 'Magic' },
  ];

  return (
    <div className="actions-container">
      {/* Character-specific custom actions stay inline */}
      {isThaumaturge && (
        <ThaumaturgeExploitsDisplay thaumaturge={thaumaturge} themeColor={themeColor} />
      )}
      {actions.length > 0 && (
        <ActionCardList
          items={actions}
          type="action"
          themeColor={themeColor}
          emptyMessage=""
          encounterMode={encounterMode}
          onUse={onUse}
        />
      )}

      {/* Category buttons */}
      <div className="action-category-buttons">
        {categoryButtons.map(({ key, label }) => (
          <button
            key={key}
            className="action-category-btn"
            style={{ '--category-color': themeColor }}
            onClick={() => key === 'magic' ? onMagicOpen?.() : setOpenModal(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Offensive modal */}
      <ActionCategoryModal
        isOpen={openModal === 'offensive'}
        onClose={() => setOpenModal(null)}
        title="Offensive"
        themeColor={themeColor}
        items={withHighlights(BASIC_ACTIONS_OFFENSIVE)}
        showStrikes
        character={character}
        encounterMode={encounterMode}
        onUse={onUse}
      />

      {/* Defensive modal */}
      <ActionCategoryModal
        isOpen={openModal === 'defensive'}
        onClose={() => setOpenModal(null)}
        title="Defensive"
        themeColor={themeColor}
        items={withHighlights(BASIC_ACTIONS_DEFENSIVE)}
        encounterMode={encounterMode}
        onUse={onUse}
      />

      {/* Movement modal */}
      <ActionCategoryModal
        isOpen={openModal === 'movement'}
        onClose={() => setOpenModal(null)}
        title="Movement"
        themeColor={themeColor}
        items={withHighlights(BASIC_ACTIONS_MOVEMENT)}
        encounterMode={encounterMode}
        onUse={onUse}
      />
    </div>
  );
};

export default CharacterActionsList;
