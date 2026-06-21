// src/components/encounter/ActionDetailModal.js
// Detail modal shown when an ActionRow is tapped. Handles both encounter
// actions (strike/action/reaction/free-action) and exploration activities.
import React from 'react';
import Modal from '../shared/Modal';
import TraitTag from '../shared/TraitTag';
import ActionIcon from '../shared/ActionIcon';
import UseActionChip from '../shared/UseActionChip';
import { formatRuneBreakdown } from '../../utils/weaponRunes';
import './ActionDetailModal.css';

// Degree label → CSS modifier
const DEGREE_MOD = {
  'Critical Success': 'crit-success',
  'Success':          'success',
  'Failure':          'failure',
  'Critical Failure': 'crit-failure',
};

const degreeModifier = (label) => {
  for (const [key, mod] of Object.entries(DEGREE_MOD)) {
    if (label.includes(key)) return mod;
  }
  return '';
};

/**
 * @param {object}   item           – action/activity data object
 * @param {'action'|'reaction'|'free-action'|'activity'} type
 * @param {boolean}  isOpen
 * @param {Function} onClose
 * @param {string}   themeColor
 * @param {boolean}  encounterMode  – show Use button (actions only)
 * @param {Function} onUse          – (item, cost) callback when Use tapped
 * @param {boolean}  isActive       – for activities: currently active
 * @param {Function} onSetActive    – for activities: set/clear active
 * @param {Function} onRoll         – for activities: open the roll modal
 */
const ActionDetailModal = ({
  item,
  type = 'action',
  isOpen,
  onClose,
  themeColor,
  encounterMode = false,
  onUse,
  isActive = false,
  onSetActive,
  onRoll,
}) => {
  if (!item) return null;

  const isActivity = type === 'activity';
  const isReactionLike = type === 'reaction' || type === 'free-action';

  const chipCost =
    type === 'reaction'    ? 'reaction'
    : type === 'free-action' ? 'free'
    : item.actionCount || 1;

  const actionText = isActivity ? null
    : type === 'reaction'    ? 'Reaction'
    : type === 'free-action' ? 'Free Action'
    : item.variableActionCount
      ? `${item.variableActionCount.min} to ${item.variableActionCount.max} Actions`
      : `${item.actionCount || 1} Action${(item.actionCount || 1) !== 1 ? 's' : ''}`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={item.name} themeColor={themeColor}>
      <div className="adm-body">

        {/* Trait chips */}
        {item.traits?.length > 0 && (
          <div className="adm-traits">
            {item.traits.map((t, i) => <TraitTag key={i} trait={t} />)}
          </div>
        )}

        {/* Action cost row */}
        {actionText && (
          <div className="adm-meta-row">
            <span className="adm-meta-label">Cost</span>
            <ActionIcon actionText={actionText} size="medium" showTooltip={false} />
          </div>
        )}

        {/* Activity: skill */}
        {isActivity && item.skill && (
          <div className="adm-meta-row">
            <span className="adm-meta-label">Skill</span>
            <span className="adm-meta-value">{item.skill}</span>
          </div>
        )}

        {/* Trigger box — reactions / free actions */}
        {isReactionLike && item.trigger && (
          <div className="adm-trigger-box">
            <span className="adm-trigger-label">Trigger</span>
            <span className="adm-trigger-text">{item.trigger}</span>
          </div>
        )}

        {/* Description */}
        {item.description && (
          <p className="adm-description">{item.description}</p>
        )}

        {/* Degrees of success */}
        {item.degrees && Object.keys(item.degrees).length > 0 && (
          <div className="adm-degrees">
            <span className="adm-section-label">Degrees of Success</span>
            {Object.entries(item.degrees).map(([degree, effect], i) => (
              <div key={i} className={`adm-degree-row adm-degree-row--${degreeModifier(degree)}`}>
                <span className="adm-degree-label">{degree}</span>
                <span className="adm-degree-effect">{effect}</span>
              </div>
            ))}
          </div>
        )}

        {/* Source attribution */}
        {item.source && (
          <p className="adm-source">From: {item.source}</p>
        )}

        {/* Rune source breakdown (#608) — where a runed strike's bonus, extra
            dice, and riders come from. */}
        {item.runeBreakdown && (
          <p className="adm-runes" data-testid="adm-runes">
            Runes: {formatRuneBreakdown(item.runeBreakdown)}
          </p>
        )}

        {/* Inactive hint */}
        {item.active === false && (
          <p className="adm-inactive-hint">Not in hand — hold this item to use it.</p>
        )}

        {/* Footer actions */}
        <div className="adm-footer">
          {/* Encounter: Use button spends action pips */}
          {encounterMode && !isActivity && (
            <UseActionChip
              cost={chipCost}
              verb="Use"
              name={item.name}
              inactive={item.active === false}
              variableRange={type === 'action' ? item.variableActionCount : undefined}
              onUse={(c) => { onUse && onUse(item, c); onClose(); }}
            />
          )}

          {/* Exploration: Roll Check button */}
          {isActivity && onRoll && item.mechanics?.roll && (
            <button
              className="adm-roll-btn"
              onClick={() => { onRoll(); onClose(); }}
            >
              Roll Check
            </button>
          )}

          {/* Exploration: Set Active toggle */}
          {isActivity && onSetActive && (
            <button
              className={`adm-set-active-btn${isActive ? ' adm-set-active-btn--on' : ''}`}
              onClick={() => { onSetActive(); onClose(); }}
            >
              {isActive ? '✓ Active — Clear' : 'Set as active'}
            </button>
          )}
        </div>

      </div>
    </Modal>
  );
};

export default ActionDetailModal;
