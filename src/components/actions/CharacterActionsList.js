// src/components/actions/CharacterActionsList.js
import React from 'react';
import ActionCardList from './ActionCardList';
import ThaumaturgeExploitsDisplay from './ThaumaturgeExploitsDisplay';
import { useCharacter } from '../../hooks/useCharacter';

const CharacterActionsList = ({ character, themeColor }) => {
  const { actions, flags, thaumaturge } = useCharacter(character);
  const { isThaumaturge } = flags;

  return (
    <div className="actions-container">
      {isThaumaturge && (
        <ThaumaturgeExploitsDisplay thaumaturge={thaumaturge} themeColor={themeColor} />
      )}
      <ActionCardList
        items={actions}
        type="action"
        themeColor={themeColor}
        emptyMessage="No actions available for this character."
      />
    </div>
  );
};

export default CharacterActionsList;
