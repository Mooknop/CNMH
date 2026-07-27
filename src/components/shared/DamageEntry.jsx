import React from 'react';
import { useFoundryDice } from '../../hooks/useFoundryDice';
import { useDevicePref } from '../../hooks/useDevicePref';
import { isRollableExpression } from '../../utils/diceRelay';
import { TABLE_DICE_PREF } from '../../utils/tableDice';
import './DamageEntry.css';

/**
 * One damage-part row for the RollSheet redesign's Phase-2 "amount" step
 * (#1682, sibling to the RollEntry d20 primitive #1681). This is an
 * extraction/reshape of what the old `DamagePanel` attack mode did per-part —
 * the `dmg-total-input` treatment and the `damageRollFormulas` Foundry
 * delegation — not a new model. Unlike `FoundryDiceInput` (input + inline
 * "Roll" button shown together), the handoff's Screen 4 spec wants a single
 * control per row: a full pill button in Foundry mode that resolves to
 * static "rolled N" text once the ack lands, or the numeric total input in
 * table mode. Rider toggles and the `Crit ×2` checkbox are the caller's
 * (useAttackRollSheet's `amountExtras`; DamagePanel keeps save-mode riders)
 * — out of scope here.
 *
 * Mode is never a prop: like `FoundryDiceInput`, this reads
 * `useDevicePref(TABLE_DICE_PREF)` and `useFoundryDice()` itself.
 *
 * @param {Object}   part              - a `damageEntryParts(profile, riderState)` entry,
 *                                        `{ key, dice, type, label? }`, plus the matching
 *                                        `damageRollFormulas(profile, riderState)[part.key]`
 *                                        formula for delegation: `{ ...part, formula }`.
 *                                        Falls back to `part.dice` when `formula` is omitted.
 * @param {string}   value             - controlled entered/rolled total (raw string, un-doubled).
 *                                        In Foundry mode a non-empty value is treated as already
 *                                        rolled and renders as static text rather than the pill —
 *                                        so a remount/hydration never re-offers a stale roll.
 * @param {Function} onChange          - (value: string) => void — typed OR rolled totals
 * @param {Function} [onFoundryRolled] - (total: number) => void — fires alongside onChange
 *                                        only when a Foundry delegation ack lands, so a caller
 *                                        can react to "this one was actually rolled" separately
 *                                        from manual typing (e.g. fx/log wiring in RollSheet)
 * @param {string}   [charId]          - app character id for chat-speaker attribution;
 *                                        omit/null to hide the pill (falls back to the input)
 * @param {string}   [flavor]          - chat-label prefix for the delegated roll
 */
export default function DamageEntry({
  part,
  value = '',
  onChange,
  onFoundryRolled,
  charId = null,
  flavor = '',
}) {
  const { roll, rolling, available } = useFoundryDice();
  const [tableDice] = useDevicePref(TABLE_DICE_PREF, false);

  const formula = part?.formula ?? part?.dice ?? '';
  const showPill = !tableDice && available && !!charId && isRollableExpression(formula);
  const alreadyRolled = showPill && value !== '' && value != null;

  const handleRoll = async () => {
    const ack = await roll({ formula, flavor, charId });
    const total = ack?.total ?? null;
    if (total != null) {
      onChange(String(total));
      onFoundryRolled?.(total);
    }
  };

  const expression = `${part?.dice ?? ''}${part?.type ? ` ${part.type}` : ''}`;

  return (
    <div className="de-row">
      <span className="de-expression">{expression}</span>
      {showPill ? (
        alreadyRolled ? (
          <span className="de-rolled-text">rolled {value}</span>
        ) : (
          <button
            type="button"
            className="de-roll-pill"
            aria-label="Roll in Foundry"
            disabled={rolling}
            onClick={handleRoll}
          >
            {rolling ? 'Rolling…' : 'Roll in Foundry'}
          </button>
        )
      ) : (
        <input
          type="number"
          className="de-total-input"
          placeholder="total"
          aria-label="rolled damage total"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
