// src/components/actions/ReactionsList.js
import React from 'react';
import ActionCardList from './ActionCardList';
import { useCharacter } from '../../hooks/useCharacter';

const ReactionsList = ({ character, themeColor, encounterMode, onUse }) => {
  const { reactions } = useCharacter(character);

  return (
    <div className="reactions-container">
      <ActionCardList
        items={reactions}
        type="reaction"
        themeColor={themeColor}
        emptyMessage="No reactions available for this character."
        encounterMode={encounterMode}
        onUse={onUse}
      />
    </div>
  );
};

export default ReactionsList;
