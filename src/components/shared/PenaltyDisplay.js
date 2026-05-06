import React from 'react';
import './PenaltyDisplay.css';

/**
 * Renders a stat value with an inline condition-penalty tooltip.
 *
 * Props:
 *   base      – raw numeric value before penalties
 *   penalty   – { total: -N, sources: [{ label, penalty }] }  from ConditionUtils
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

  return (
    <span className={`pd-wrapper ${className}`}>
      <span className="pd-penalized">{displayAdjusted}</span>
      <span className="pd-delta">{deltaStr}</span>
      <div className="pd-tooltip" role="tooltip">
        <div className="pd-tooltip-title">Condition Penalty</div>
        {penalty.sources.map((s, i) => (
          <div key={i} className="pd-tooltip-row">
            <span className="pd-tooltip-label">{s.label}</span>
            <span className="pd-tooltip-penalty">{s.penalty > 0 ? `+${s.penalty}` : s.penalty}</span>
          </div>
        ))}
      </div>
    </span>
  );
};

export default PenaltyDisplay;
