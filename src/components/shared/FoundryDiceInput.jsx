import React from 'react';
import { useFoundryDice } from '../../hooks/useFoundryDice';
import { d20FaceFrom } from '../../utils/diceRelay';
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
 */
export default function FoundryDiceInput({
  value,
  onValue,
  charId = null,
  flavor = '',
  placeholder = 'd20',
  ariaLabel = 'raw d20',
  inputClassName = '',
}) {
  const { roll, rolling, available } = useFoundryDice();
  const showRoll = available && !!charId;

  const handleRoll = async () => {
    const ack = await roll({ formula: '1d20', flavor, charId });
    const face = d20FaceFrom(ack);
    if (face != null) onValue(String(face));
  };

  return (
    <span className="fdi">
      <input
        type="number"
        className={inputClassName}
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onValue(e.target.value)}
      />
      {showRoll && (
        <button
          type="button"
          className="fdi-btn"
          aria-label="Roll in Foundry"
          disabled={rolling}
          onClick={handleRoll}
        >
          {rolling ? 'Rolling…' : 'Roll'}
        </button>
      )}
    </span>
  );
}
