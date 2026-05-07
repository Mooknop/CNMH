// src/components/actions/FreeActionsList.js
import React from 'react';
import ActionCardList from './ActionCardList';
import { useCharacter } from '../../hooks/useCharacter';
import { BASIC_ENCOUNTER_FREE_ACTIONS } from '../../data/encounterActions';

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

const FreeActionsList = ({ character, themeColor }) => {
  const { freeActions } = useCharacter(character);

  return (
    <div className="free-actions-container">
      <ActionCardList
        items={freeActions}
        type="free-action"
        themeColor={themeColor}
        emptyMessage="No unique free actions available for this character."
      />
      <SectionDivider label="Basic" themeColor={themeColor} />
      <ActionCardList
        items={BASIC_ENCOUNTER_FREE_ACTIONS}
        type="free-action"
        themeColor={themeColor}
      />
    </div>
  );
};

export default FreeActionsList;
