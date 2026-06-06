import React from 'react';
import './PenaltyDisplay.css';

/**
 * Renders a stat value with an inline modifier tooltip.
 *
 * Props:
 *   base      – raw numeric value before modifiers
 *   penalty   – { total: N, sources: [{ label, penalty?, bonus?, isBuff? }] }
 *               from ConditionUtils, EffectUtils, or combineModifiers().
 *               total < 0 = net penalty (red), total > 0 = net bonus (green).
 *   format    – 'number' (default) | 'modifier' (prepends + sign)
 *   className – forwarded to the wrapper span
 */
const PenaltyDisplay = ({ base, penalty, format = 'number', className = '' }) => {
  if (!penalty || penalty.total === 0) {
    const display = format === 'modifier'
      ? (base >= 0 ? `+${base}` : `${base}`)
      : String(base);
    return <span className={className}>{display}</span>;
  }

  const adjusted = base + penalty.total;
  const displayAdjusted = format === 'modifier'
    ? (adjusted >= 0 ? `+${adjusted}` : `${adjusted}`)
    : String(adjusted);
  const deltaStr = penalty.total > 0 ? `+${penalty.total}` : String(penalty.total);
  const isNetBonus = penalty.total > 0;

  return (
    <span className={`pd-wrapper ${className}`}>
      <span className={isNetBonus ? 'pd-bonus' : 'pd-penalized'}>{displayAdjusted}</span>
      <span className={isNetBonus ? 'pd-delta pd-delta--bonus' : 'pd-delta'}>{deltaStr}</span>
      <div className="pd-tooltip" role="tooltip">
        <div className="pd-tooltip-title">Modifiers</div>
        {penalty.sources.map((s, i) => {
          const isBuff = s.isBuff || (s.bonus != null && s.bonus > 0 && s.penalty == null);
          const amount = s.bonus != null ? s.bonus : s.penalty;
          const displayAmount = amount > 0 ? `+${amount}` : String(amount);
          return (
            <div key={i} className="pd-tooltip-row">
              <span className="pd-tooltip-label">{s.label}</span>
              <span className={isBuff ? 'pd-tooltip-bonus' : 'pd-tooltip-penalty'}>
                {displayAmount}
              </span>
            </div>
          );
        })}
      </div>
    </span>
  );
};

export default PenaltyDisplay;
