import React from 'react';
import ActionCardList from './ActionCardList';
import { BASIC_ENCOUNTER_ACTIONS, BASIC_ENCOUNTER_FREE_ACTIONS } from '../../data/encounterActions';

const BasicActionsList = ({ themeColor }) => (
  <div className="basic-actions-list">
    <ActionCardList
      items={BASIC_ENCOUNTER_ACTIONS}
      type="action"
      themeColor={themeColor}
    />
    <h3 style={{ color: themeColor, marginTop: '1.5rem', marginBottom: '0.5rem' }}>Free Actions</h3>
    <ActionCardList
      items={BASIC_ENCOUNTER_FREE_ACTIONS}
      type="free-action"
      themeColor={themeColor}
    />
  </div>
);

export default BasicActionsList;
