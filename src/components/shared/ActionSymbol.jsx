import React from 'react';
import { convertWordToNumber } from '../../utils/ActionsUtils';
import { getActionGlyph, getVariableActionGlyph, isGoldCost } from '../../utils/actionGlyph';
import './ActionSymbol.css';

const LABELS = { reaction: 'reaction', free: 'free action', passive: 'passive' };

// Glyph spans on the legacy presentation path carry both the wrapper-scoped
// class (sized/colored by ActionSymbol.css and per-surface CSS) and the font
// class that maps characters to the genuine PF2e action symbols.
const GLYPH_CLASS = 'action-icon pf2e-action-glyph';

// Legacy presentation path (former ActionIcon, merged here — #1316).
// Parses free-form action text ("Two Actions", "Reaction", "One to Three
// Actions") into the mapped font characters and renders a sized wrapper with
// an optional hover tooltip. Color comes from CSS; no inline style needed.
const renderActionText = (actionText, size, showTooltip) => {
  if (!actionText) return null;

  const text = String(actionText).toLowerCase();
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

/**
 * Renders a PF2e action-economy symbol using the genuine Pathfinder2eActions
 * font (@font-face in pf2e-tokens.css). Accepts numbers, keywords, or catalog
 * word-strings ('Two Actions'). Costs the font has no glyph for — durations
 * like '1 Minute', or 'passive' — fall back to their text.
 *
 * Two presentation APIs (merged from the former ActionIcon — #1316):
 * - `cost`: bare `.action-sym` glyph span (compact, inherits surface sizing).
 * - `actionText` (+ `size`, `showTooltip`): `.action-icon-wrapper` markup with
 *   size classes and an optional hover tooltip, styled by ActionSymbol.css.
 *
 * @param {number|string} cost - 1, 2, 3, 'reaction', 'free', 'passive', or a
 *   free-text action phrase.
 * @param {string} actionText - Legacy free-form action text; when provided the
 *   component renders the wrapper/tooltip markup instead of the bare glyph.
 * @param {'small'|'medium'|'large'} size - Wrapper size class (actionText only).
 * @param {boolean} showTooltip - Hover tooltip toggle (actionText only).
 */
const ActionSymbol = ({ cost, actionText, size = 'medium', showTooltip = true }) => {
  if (actionText !== undefined) return renderActionText(actionText, size, showTooltip);

  const glyph = getActionGlyph(cost);
  const label = typeof cost === 'number'
    ? `${cost} action${cost === 1 ? '' : 's'}`
    : (LABELS[cost] ?? String(cost ?? ''));

  if (!glyph) {
    const text = cost === null || cost === undefined || cost === '' ? '—' : String(cost);
    return <span className="action-sym action-sym--text" aria-label={label}>{text}</span>;
  }

  const className = `action-sym pf2e-action-glyph${isGoldCost(cost) ? ' pf2e-action-glyph--gold' : ''}`;
  return (
    <span className={className} aria-label={label}>
      {glyph}
    </span>
  );
};

export default ActionSymbol;
