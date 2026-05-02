// src/components/actions/ActionCardList.js
// Unified renderer for actions, reactions, and free actions.
// Replaces CharacterActionsList, ReactionsList, and FreeActionsList.
import React from 'react';
import CollapsibleCard from '../shared/CollapsibleCard';
import TraitTag from '../shared/TraitTag';
import ActionIcon from '../shared/ActionIcon';

const DEGREE_COLORS = {
  'Critical Success': 'var(--color-success)',
  'Success':          'var(--color-success-blue)',
  'Failure':          'var(--color-warning)',
  'Critical Failure': 'var(--color-crit-fail)',
};

const getDegreeColor = (degree) => {
  for (const [key, color] of Object.entries(DEGREE_COLORS)) {
    if (degree.includes(key)) return color;
  }
  return 'var(--color-text)';
};

/**
 * Renders a list of action/reaction/free-action cards in a grid.
 *
 * @param {Object[]} items   - Array of action objects from useCharacter()
 * @param {'action'|'reaction'|'free-action'} type
 * @param {string}   themeColor
 * @param {string}   emptyMessage - Shown when items is empty
 */
const ActionCardList = ({ items = [], type = 'action', themeColor, emptyMessage }) => {
  const isReactionLike = type === 'reaction' || type === 'free-action';
  const iconText = type === 'reaction' ? 'Reaction' : type === 'free-action' ? 'Free Action' : null;

  const getActionText = (item) => {
    if (iconText) return iconText;
    if (item.variableActionCount) {
      const { min, max } = item.variableActionCount;
      return `${min} to ${max} Actions`;
    }
    const count = item.actionCount || 1;
    return `${count} Action${count !== 1 ? 's' : ''}`;
  };

  if (items.length === 0) {
    return (
      <div className="empty-state">
        <p>{emptyMessage || `No ${type}s available for this character.`}</p>
      </div>
    );
  }

  return (
    <div className="cards-grid">
      {items.map((item, index) => {
        const actionText = getActionText(item);

        const header = (
          <>
            <h3 style={{ color: themeColor }}>{item.name}</h3>
            <div className={`${type}-icon`}>
              <ActionIcon actionText={item.actions || actionText} color={themeColor} />
            </div>
          </>
        );

        const content = (
          <>
            <div className={`${type}-traits`}>
              {item.traits?.map((trait, i) => <TraitTag key={i} trait={trait} />)}
            </div>

            {/* Action count label — only for standard actions */}
            {type === 'action' && (
              <div className="action-count-text">
                <span className="detail-label">Actions:</span>
                <span className="detail-value"> {actionText}</span>
              </div>
            )}

            {/* Trigger — only for reactions / free actions */}
            {isReactionLike && item.trigger && (
              <div className={`${type}-trigger`}>
                <span className="trigger-label" style={{ color: themeColor }}>Trigger</span>
                <span className="trigger-text">{item.trigger}</span>
              </div>
            )}

            {item.description && (
              <div className={`${type}-description`}>{item.description}</div>
            )}

            {/* Degrees of success — actions only */}
            {type === 'action' && item.degrees && (
              <div className="action-degrees">
                <span className="degrees-label" style={{ color: themeColor, fontWeight: 'bold', display: 'block', marginTop: '0.75rem', marginBottom: '0.5rem' }}>
                  Degrees of Success:
                </span>
                {Object.entries(item.degrees).map(([degree, effect], i) => (
                  <div key={i} className="degree-entry" style={{ marginBottom: '0.5rem', paddingLeft: '1rem' }}>
                    <span className="degree-level" style={{ fontWeight: 'bold', color: getDegreeColor(degree) }}>
                      {degree}:
                    </span>
                    <span className="degree-effect" style={{ marginLeft: '0.5rem' }}>{effect}</span>
                  </div>
                ))}
              </div>
            )}

            {item.source && (
              <div className={`${type}-source`} style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)', padding: '0.5rem 1rem', fontStyle: 'italic' }}>
                From: {item.source}
              </div>
            )}
          </>
        );

        return (
          <CollapsibleCard
            key={`${type}-${index}`}
            className={`${type}-card`}
            header={header}
            themeColor={themeColor}
            style={{ borderLeft: `4px solid ${themeColor}` }}
          >
            {content}
          </CollapsibleCard>
        );
      })}
    </div>
  );
};

export default ActionCardList;
