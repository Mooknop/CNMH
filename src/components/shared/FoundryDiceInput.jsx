import React from 'react';
import { useFoundryDice } from '../../hooks/useFoundryDice';
import { d20FaceFrom, isRollableExpression } from '../../utils/diceRelay';
import './FoundryDiceInput.css';

/**
 * The d20 entry field with the dice-tower option (#1490 S2). Manual typing is
 * ALWAYS available and unchanged; when a rail-capable bridge is connected and a
 * charId is supplied, a "Roll" button delegates the d20 to Foundry (chat card +
 * Dice So Nice on the table) and fills this input with the rolled face — the
 * surrounding resolver stays synchronous and owns every side effect exactly as
 * with a typed die. A nack/timeout simply leaves the input editable.
 *
 * @param {string}   value          - controlled input value (raw d20 face string)
 * @param {Function} onValue        - called with the new value string (typed or rolled)
 * @param {string}   [charId]       - app character id for chat-speaker attribution;
 *                                    omit/null to hide the roll button (e.g. manual-total mode)
 * @param {string}   [flavor]       - app-composed chat label ("Strike: Longsword (MAP -5)")
 * @param {string}   [placeholder]  - input placeholder (default 'd20')
 * @param {string}   [ariaLabel]    - input aria-label (default 'raw d20' — the existing test contract)
 * @param {string}   [inputClassName] - class for the input so host styling (trr-roll-input …) applies
 * @param {string}   [id]           - input id, for hosts that pair a <label htmlFor>
 * @param {string|number} [min]/[max] - native range attributes some hosts set (1/20)
 * @param {boolean}  [disabled]     - disables input AND roll button (resolved states)
 * @param {string}   [formula]      - dice expression to delegate (default '1d20').
 *                                    A d20 request fills the RAW FACE; any other
 *                                    formula (damage, #1490 S5) fills the TOTAL.
 *                                    A non-rollable expression ('1d6 cold' prose,
 *                                    '') hides the button — manual entry only.
 */
export default function FoundryDiceInput({
  value,
  onValue,
  charId = null,
  flavor = '',
  placeholder = 'd20',
  ariaLabel = 'raw d20',
  inputClassName = '',
  id = undefined,
  min = undefined,
  max = undefined,
  disabled = false,
  formula = '1d20',
}) {
  const { roll, rolling, available } = useFoundryDice();
  const showRoll = available && !!charId && isRollableExpression(formula);

  const handleRoll = async () => {
    const ack = await roll({ formula, flavor, charId });
    const filled = formula === '1d20' ? d20FaceFrom(ack) : (ack?.total ?? null);
    if (filled != null) onValue(String(filled));
  };

  return (
    <span className="fdi">
      <input
        type="number"
        id={id}
        min={min}
        max={max}
        className={inputClassName}
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onValue(e.target.value)}
        disabled={disabled}
      />
      {showRoll && (
        <button
          type="button"
          className="fdi-btn"
          aria-label="Roll in Foundry"
          disabled={rolling || disabled}
          onClick={handleRoll}
        >
          {rolling ? 'Rolling…' : 'Roll'}
        </button>
      )}
    </span>
  );
}
