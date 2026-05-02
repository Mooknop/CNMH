// src/components/actions/FreeActionsList.js
import React from 'react';
import ActionCardList from './ActionCardList';
import { useCharacter } from '../../hooks/useCharacter';

const FreeActionsList = ({ character, themeColor }) => {
  const { freeActions } = useCharacter(character);

  return (
    <div className="free-actions-container">
      <ActionCardList
        items={freeActions}
        type="free-action"
        themeColor={themeColor}
        emptyMessage="No free actions available for this character."
      />
    </div>
  );
};

export default FreeActionsList;
