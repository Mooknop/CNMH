// src/components/shared/ActionRow.js
// Compact dark-menu tap row: [glyph chip] name [right label] ›
import React from 'react';
import './ActionRow.css';

const ActionRow = ({
  glyph,           // string — glyph(s) like '1' '2' 'R' or an arrow '→'
  glyphColor,      // 'accent' | 'gold' | undefined (accent default)
  actionFont = false, // render glyph in the genuine PF2e action font
  name,
  rightLabel,      // short chip text (trait, skill, etc.)
  onClick,
  active = false,  // pinned/selected state (accent tint)
  inactive = false, // greyed-out (item not in hand)
  className = '',
}) => (
  <button
    className={[
      'action-row',
      active    ? 'action-row--active'   : '',
      inactive  ? 'action-row--inactive' : '',
      className,
    ].filter(Boolean).join(' ')}
    onClick={onClick}
    type="button"
  >
    {glyph && (
      <span className={[
        'action-row__glyph',
        glyphColor === 'gold' ? 'action-row__glyph--gold' : '',
        actionFont ? 'pf2e-action-glyph' : '',
      ].filter(Boolean).join(' ')}>
        {glyph}
      </span>
    )}
    <span className="action-row__name">{name}</span>
    {rightLabel && (
      <span className="action-row__chip">{rightLabel}</span>
    )}
    <span className="action-row__chevron" aria-hidden="true">›</span>
  </button>
);

export default ActionRow;
