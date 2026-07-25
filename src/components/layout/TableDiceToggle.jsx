import React from 'react';
import { useDevicePref } from '../../hooks/useDevicePref';
import { TABLE_DICE_PREF } from '../../utils/tableDice';
import './TableDiceToggle.css';

// Table-dice mode toggle (#1575 D3) — a device-local preference beside the
// sync badge: pressed = this device rolls physical dice, so every
// FoundryDiceInput hides its "Roll in Foundry" button and players type what
// the table dice say. Manual entry is already the universal base path; this
// just stops the app from offering the delegation shortcut on this device.
const TableDiceToggle = () => {
  const [tableDice, setTableDice] = useDevicePref(TABLE_DICE_PREF, false);
  return (
    <button
      type="button"
      className={`table-dice-toggle${tableDice ? ' is-on' : ''}`}
      aria-pressed={tableDice}
      aria-label="Physical dice mode"
      title={tableDice
        ? 'Physical dice mode is ON for this device — Roll-in-Foundry buttons are hidden; type what your dice say. Tap to switch back.'
        : 'Tap for physical dice mode: hide the Roll-in-Foundry buttons on this device and type what your real dice say.'}
      onClick={() => setTableDice(!tableDice)}
    >
      <span aria-hidden="true">🎲</span>
      {tableDice && <span className="table-dice-toggle-note">table</span>}
    </button>
  );
};

export default TableDiceToggle;
