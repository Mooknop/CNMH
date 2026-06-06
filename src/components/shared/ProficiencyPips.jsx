import React from 'react';
import './ProficiencyPips.css';

const RANK_META = [
  { label: 'Untrained' },
  { label: 'Trained' },
  { label: 'Expert' },
  { label: 'Master' },
  { label: 'Legendary' },
];

/**
 * Five proficiency rank pips for a PF2e skill or weapon.
 * Legendary pips use gold; all others use --color-theme.
 *
 * @param {number} rank - 0 (Untrained) through 4 (Legendary)
 * @param {boolean} showLabel - Render the text label alongside
 */
const ProficiencyPips = ({ rank = 0, showLabel = false }) => {
  const meta = RANK_META[rank] ?? RANK_META[0];
  const isLegendary = rank === 4;

  return (
    <span className="prof-pips" aria-label={`${meta.label} proficiency`}>
      <span className="pip-row" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className={`pip ${i < rank ? (isLegendary ? 'legendary' : 'filled') : ''}`}
          />
        ))}
      </span>
      {showLabel && (
        <span className="prof-label">{meta.label}</span>
      )}
    </span>
  );
};

export default ProficiencyPips;
