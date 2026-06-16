import React from 'react';
import ActionSymbol from './ActionSymbol';
import './UseActionChip.css';

/**
 * Unified encounter-mode action chip. Merges the PF2e action-cost symbol with
 * the action verb (Use / Cast / Hold) into one tappable control.
 *
 * Replaces btn-encounter-use across ActionCardList and SpellCard.
 *
 * @param {number|string} cost         - 1 | 2 | 3 | 'reaction' | 'free'
 * @param {string}        verb         - 'Use' | 'Cast' (default 'Use')
 * @param {string}        variant      - 'action'|'reaction'|'free'|'variable' (auto if omitted)
 * @param {boolean}       inactive     - renders disabled "Hold" state
 * @param {Object}        variableRange- { min, max } enables the cost dropdown
 * @param {Function}      onUse        - called with the selected cost
 * @param {string}        name         - entity name, for aria-label
 */
const UseActionChip = ({
  cost,
  verb = 'Use',
  variant,
  inactive = false,
  variableRange,
  onUse,
  name = '',
}) => {
  const isVariable = !!variableRange;
  const [selected, setSelected] = React.useState(
    isVariable ? variableRange.min : cost
  );

  const resolvedVariant =
    variant ||
    (isVariable ? 'variable'
      : cost === 'reaction' ? 'reaction'
      : cost === 'free' || cost === 0 ? 'free'
      : 'action');

  if (inactive) {
    return (
      <span className="use-chip use-chip--disabled" aria-disabled="true">
        <span className="use-chip-cost">
          <ActionSymbol cost={cost} />
        </span>
        <span className="use-chip-label">Hold</span>
      </span>
    );
  }

  if (isVariable) {
    const { min, max } = variableRange;
    return (
      <span className="use-chip use-chip--variable">
        <select
          className="use-chip-select"
          aria-label={`Action count for ${name}`}
          value={selected}
          onChange={(e) => setSelected(Number(e.target.value))}
        >
          {Array.from({ length: max - min + 1 }, (_, i) => {
            const v = min + i;
            return (
              <option key={v} value={v}>
                {'◆'.repeat(v)}
              </option>
            );
          })}
        </select>
        <button
          type="button"
          className="use-chip-label use-chip-btn"
          aria-label={`${verb} ${name}`}
          onClick={() => onUse && onUse(selected)}
        >
          {verb}
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`use-chip use-chip--${resolvedVariant}`}
      aria-label={`${verb} ${name}`}
      onClick={() => onUse && onUse(cost)}
    >
      <span className="use-chip-cost">
        <ActionSymbol cost={cost} />
      </span>
      <span className="use-chip-label">{verb}</span>
    </button>
  );
};

export default UseActionChip;
