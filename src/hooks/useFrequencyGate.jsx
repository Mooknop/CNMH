import { useState } from 'react';
import { useFrequency } from './useFrequency';
import { parseFrequency, freqKeyFor, lockMessage } from '../utils/frequency';

/**
 * Frequency gate (#218, extracted #1317 D1) — declarative cooldown with a
 * table-ruling override. Availability is derived from the synced ledger vs the
 * game clock and the live encounter round/turn; advancing either clock
 * re-enables locked abilities — nothing is timer-driven.
 *
 * Uniform gate-hook shape: { gateOk, blocked, override, setOverride, section,
 * applyOnConfirm }. `section` is the blocked-state JSX (null when open);
 * `applyOnConfirm({ addSuffix })` records the use and contributes the
 * override suffix at the orchestrator's confirm-sequence position.
 */
export const useFrequencyGate = ({ charId, ability, nowSecs, encounter, casterEntryId }) => {
  const { gateFor, record: recordFreqUse, clear: clearFreqLock } = useFrequency(charId);
  // Declarative cooldown override for table rulings.
  const [override, setOverride] = useState(false);

  const freqRule = parseFrequency(ability);
  const freqCtx  = { nowSecs, encounter, casterEntryId };
  const freqGate = freqRule
    ? gateFor(ability, freqCtx)
    : { available: true };
  const gateOk = freqGate.available || override;
  const blocked = !!freqRule && !freqGate.available;

  // Frequency: record the use either way — under an override the use still
  // happened, it just bypassed the lock (and the log says so).
  const applyOnConfirm = ({ addSuffix }) => {
    if (freqRule) {
      recordFreqUse(ability, freqCtx);
      if (!freqGate.available && override) {
        addSuffix(' (override — frequency)');
      }
    }
  };

  // Frequency lock — derived from the synced ledger; GM can override or clear.
  const section = blocked ? (
    <>
      <hr className="ct-divider" />
      <section className="ct-section">
        <h3 className="ct-section-title">Frequency</h3>
        <div className="uam-cost-empty">{lockMessage(freqGate, freqRule, nowSecs)}</div>
        <label className="uam-cost-override">
          <input
            type="checkbox"
            checked={override}
            onChange={(e) => setOverride(e.target.checked)}
          />
          Override (GM ruling) — use anyway
        </label>
        <button
          type="button"
          className="uam-freq-clear"
          onClick={() => clearFreqLock(freqKeyFor(ability))}
        >
          Clear lock (GM ruling)
        </button>
      </section>
    </>
  ) : null;

  return { gateOk, blocked, override, setOverride, section, applyOnConfirm };
};

export default useFrequencyGate;
