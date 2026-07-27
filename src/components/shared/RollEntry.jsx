import React, { useCallback, useEffect, useState } from 'react';
import { useDevicePref } from '../../hooks/useDevicePref';
import { useFoundryDice } from '../../hooks/useFoundryDice';
import { TABLE_DICE_PREF } from '../../utils/tableDice';
import { d20FaceFrom } from '../../utils/diceRelay';
import './RollEntry.css';

const FACES = Array.from({ length: 20 }, (_, i) => i + 1);

/**
 * The shared d20 entry primitive (#1681, Roll Resolution redesign — workstream
 * A). Replaces `FoundryDiceInput`'s role as the die-entry control: a ring
 * readout always on top, and below it either a 1–20 tap pad (table-dice
 * devices, or when Foundry can't be reached) or a single "Roll d20 in
 * Foundry" pill (Foundry mode) whose ack both fills AND commits the face in
 * one tap. There is no manual-total mode — `face` is always the raw d20,
 * 1–20 or null.
 *
 * Mode is read internally from `useDevicePref(TABLE_DICE_PREF)` and
 * `useFoundryDice()` — it is never a prop, so every call site stays in sync
 * with the navbar's table-dice toggle for free.
 *
 * @param {number|null} face          - the raw d20 face, or null before a roll
 * @param {Function}    onFaceChange  - called with the new face (pad tap, or
 *                                       a successful Foundry ack)
 * @param {Function}    onCommit      - called with the face ONLY when Foundry
 *                                       mode rolls it — rolling and committing
 *                                       are one tap there. The pad never calls
 *                                       this; the host owns the commit button.
 * @param {number|null} [bonus]       - the derivable bonus, or null when none
 *                                       exists (heading/math line show "—")
 * @param {string}      [bonusLabel]  - e.g. "attack", "Medicine"
 * @param {string}      [dcLine]      - fallback math-line text before a face
 *                                       is set, e.g. "nothing rolled yet ·
 *                                       Ghoul AC 24"
 * @param {boolean}     [disabled]    - disables every interactive control
 * @param {string}      [charId]      - app character id for chat-speaker
 *                                       attribution, forwarded to
 *                                       useFoundryDice().roll(). Mirrors
 *                                       FoundryDiceInput's gating: with no
 *                                       charId the Foundry pill NEVER
 *                                       renders (even in Foundry mode /
 *                                       available === true) — falls back to
 *                                       the pad instead, silently, no notice.
 * @param {string}      [flavor]      - app-composed chat label ("Strike:
 *                                       Longsword (MAP -5)"), forwarded to roll()
 */
export default function RollEntry({
  face,
  onFaceChange,
  onCommit,
  bonus = null,
  bonusLabel = '',
  dcLine = '',
  disabled = false,
  charId = null,
  flavor = '',
}) {
  const [tabledice, setTabledice] = useDevicePref(TABLE_DICE_PREF, false);
  const { roll, rolling, available } = useFoundryDice();
  // A null ack (nack/timeout) falls back to the pad + a notice for the rest
  // of this mount; flipping back to table mode (or away and back) resets it
  // so the next visit to Foundry mode tries fresh.
  const [foundryFailed, setFoundryFailed] = useState(false);

  useEffect(() => {
    if (tabledice) setFoundryFailed(false);
  }, [tabledice]);

  const handleRoll = useCallback(async () => {
    const ack = await roll({ formula: '1d20', flavor, charId });
    const rolledFace = ack ? d20FaceFrom(ack) : null;
    if (rolledFace != null) {
      setFoundryFailed(false);
      onFaceChange(rolledFace);
      onCommit(rolledFace);
    } else {
      setFoundryFailed(true);
    }
  }, [roll, flavor, charId, onFaceChange, onCommit]);

  const signedBonus = bonus == null ? null : (bonus >= 0 ? `+${bonus}` : `${bonus}`);
  const heading = bonus == null
    ? 'your d20 · —'
    : `your d20 · ${bonusLabel} ${signedBonus}`;
  const mathLine = face != null
    ? (bonus != null ? `${face} + ${bonus} = ${face + bonus}` : `${face}`)
    : dcLine;

  let ringStateClass = 'rollentry-ring--empty';
  if (rolling) {
    ringStateClass = 'rollentry-ring--pending';
  } else if (face != null) {
    ringStateClass = 'rollentry-ring--filled';
    if (face === 20) ringStateClass += ' rollentry-ring--nat20';
    else if (face === 1) ringStateClass += ' rollentry-ring--nat1';
  }
  const ringContent = rolling ? '1d20' : (face != null ? face : '—');

  // Table mode, an unreachable bridge, no charId (chat-speaker attribution
  // gate — mirrors FoundryDiceInput's showRoll), and a fallen-back Foundry
  // mode all land on the pad; only the last of those also shows the notice.
  const showPad = tabledice || !available || !charId || foundryFailed;
  const showNotice = !tabledice && available && !!charId && foundryFailed;

  return (
    <div className="rollentry">
      <p className="rollentry-heading">{heading}</p>
      <div className={`rollentry-ring ${ringStateClass}`} role="status" aria-label="your d20 roll">
        {ringContent}
      </div>
      <p className="rollentry-math">{mathLine}</p>

      {showNotice && (
        <p className="rollentry-notice">
          Foundry isn&apos;t answering — tap your die instead.
        </p>
      )}

      {showPad ? (
        <>
          <p className="rollentry-pad-label">Tap what your die shows</p>
          <div className="rollentry-pad" role="group" aria-label="raw d20">
            {FACES.map((n) => (
              <button
                key={n}
                type="button"
                className={`rollentry-pad-cell${face === n ? ' rollentry-pad-cell--selected' : ''}`}
                aria-pressed={face === n}
                disabled={disabled}
                onClick={() => onFaceChange(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            className="rollentry-pill"
            disabled={disabled || rolling}
            onClick={handleRoll}
          >
            {rolling ? 'Rolling…' : 'Roll d20 in Foundry'}
          </button>
          <button
            type="button"
            className="rollentry-switch"
            disabled={disabled}
            onClick={() => setTabledice(true)}
          >
            rolling real dice? switch this device to table mode
          </button>
        </>
      )}
    </div>
  );
}
