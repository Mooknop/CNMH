// src/components/shared/ActionIcon.js
// Renders action-economy glyphs using the genuine Pathfinder2eActions font
// (@font-face in pf2e-tokens.css). Parses free-form action text ("Two Actions",
// "Reaction", "One to Three Actions") into the mapped font characters.
// Color comes from CSS; no inline style needed.
import React from 'react';
import { convertWordToNumber } from '../../utils/ActionsUtils';
import { getActionGlyph, getVariableActionGlyph } from '../../utils/actionGlyph';
import './ActionIcon.css';

const GLYPH_CLASS = 'action-icon pf2e-action-glyph';

const ActionIcon = ({ actionText, size = 'medium', showTooltip = true }) => {
  if (!actionText) return null;

  const text = actionText.toLowerCase();
  const sizeClass = `action-icon-${size}`;

  if (text.includes('reaction')) {
    return (
      <span className={`action-icon-wrapper reaction-icon ${sizeClass}`} aria-label="Reaction">
        <span className={`${GLYPH_CLASS} action-icon--reaction`}>{getActionGlyph('reaction')}</span>
        {showTooltip && <div className="action-tooltip">Reaction</div>}
      </span>
    );
  }

  if (text.includes('free action')) {
    return (
      <span className={`action-icon-wrapper free-action-icon ${sizeClass}`} aria-label="Free Action">
        <span className={`${GLYPH_CLASS} action-icon--free`}>{getActionGlyph('free')}</span>
        {showTooltip && <div className="action-tooltip">Free Action</div>}
      </span>
    );
  }

  // Variable action range — "One to Three Actions"
  if (text.includes('to')) {
    const rangeMatch = text.match(/(\w+)\s+to\s+(\w+)/i);
    if (rangeMatch) {
      const startCount = convertWordToNumber(rangeMatch[1]);
      const endCount   = convertWordToNumber(rangeMatch[2]);
      if (startCount > 0 && endCount > 0) {
        const label = `${startCount}–${endCount} Actions`;
        return (
          <span className={`action-icon-wrapper variable-action-count ${sizeClass}`} aria-label={label}>
            <span className={GLYPH_CLASS}>{getVariableActionGlyph(startCount, endCount)}</span>
            {showTooltip && <div className="action-tooltip">{label}</div>}
          </span>
        );
      }
    }
  }

  // Standard 1–3 actions
  const getCount = (t) => {
    if (t.includes('one action') || t.includes('1 action')) return 1;
    if (t.includes('two action') || t.includes('2 action')) return 2;
    if (t.includes('three action') || t.includes('3 action')) return 3;
    const m = t.match(/(\d+)\s+action/i);
    return m ? parseInt(m[1]) : 0;
  };

  const count = getCount(text);
  if (count > 0) {
    const label = `${count} Action${count !== 1 ? 's' : ''}`;
    return (
      <span className={`action-icon-wrapper action-count ${sizeClass}`} aria-label={label}>
        <span className={GLYPH_CLASS}>{getActionGlyph(count)}</span>
        {showTooltip && <div className="action-tooltip">{label}</div>}
      </span>
    );
  }

  return (
    <span className={`action-icon-wrapper action-text ${sizeClass}`}>
      <span className="action-icon">{actionText}</span>
    </span>
  );
};

export default ActionIcon;
