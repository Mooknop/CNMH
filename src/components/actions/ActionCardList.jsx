// src/components/actions/ActionCardList.js
// Renders a flat list of ActionRows. Tapping a row opens ActionDetailModal.
// In encounterMode the modal's Use button wires to spendActions / spendReaction.
import React, { useState } from 'react';
import ActionRow from '../shared/ActionRow';
import ActionDetailModal from '../encounter/ActionDetailModal';
import { getActionGlyph, getVariableActionGlyph } from '../../utils/actionGlyph';

const getGlyph = (type, item) => {
  if (type === 'reaction')    return getActionGlyph('reaction');
  if (type === 'free-action') return getActionGlyph('free');
  if (item.variableActionCount) {
    const { min, max } = item.variableActionCount;
    return getVariableActionGlyph(min, max);
  }
  return getActionGlyph(item.actionCount || 1);
};

const isGoldType = (type) => type === 'reaction' || type === 'free-action';

const ActionCardList = ({
  items = [],
  type = 'action',
  themeColor,
  emptyMessage,
  encounterMode = false,
  onUse,
}) => {
  const [openItem, setOpenItem] = useState(null);

  if (items.length === 0) {
    return (
      <div className="empty-state">
        <p>{emptyMessage || `No ${type}s available for this character.`}</p>
      </div>
    );
  }

  return (
    <>
      <div className="action-row-list">
        {items.map((item, index) => {
          const glyph     = getGlyph(type, item);
          const goldGlyph = isGoldType(type);
          // Primary trait chip for the right label
          const rightLabel = item.traits?.[0] ?? null;

          return (
            <ActionRow
              key={`${type}-${index}`}
              glyph={glyph}
              actionFont
              glyphColor={goldGlyph ? 'gold' : undefined}
              name={item.name}
              rightLabel={rightLabel}
              inactive={item.active === false}
              onClick={() => setOpenItem(item)}
            />
          );
        })}
      </div>

      {openItem && (
        <ActionDetailModal
          item={openItem}
          type={type}
          isOpen={true}
          onClose={() => setOpenItem(null)}
          themeColor={themeColor}
          encounterMode={encounterMode}
          onUse={onUse}
        />
      )}
    </>
  );
};

export default ActionCardList;
