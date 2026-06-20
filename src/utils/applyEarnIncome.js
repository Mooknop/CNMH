// Earn Income gold credit (#231, Slice 3) — React-free, mirrors treatWounds.js.
// The GM confirms a pending result; this adds the payout to the character's
// gold and writes a log line. Gold lives in `cnmh_gold_<charId>` as a decimal
// gp number (the same unit PartyGoldModal edits); payouts are stored in copper,
// so we convert via cpToGp.

import { cpToGp } from './earnIncome';

const DEGREE_LABEL = {
  criticalSuccess: 'Critical Success',
  success: 'Success',
  failure: 'Failure',
  criticalFailure: 'Critical Failure',
};

const writeLocal = (key, value) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
};

const readLocalGold = (charId) => {
  try {
    const raw = window.localStorage.getItem(`cnmh_gold_${charId}`);
    return raw !== null ? JSON.parse(raw) : 0;
  } catch {
    return 0;
  }
};

// Current gold for a character: prefer live server state, fall back to the
// locally-persisted value (same precedence as usePartyGold).
function readGold(charId, getState) {
  const server = getState ? getState(charId, 'gold') : undefined;
  if (typeof server === 'number') return server;
  return readLocalGold(charId);
}

/**
 * Credits a confirmed Earn Income result to the character's gold and logs it.
 * Side-effecting; accepts the session/log primitives as plain args so it stays
 * testable without React.
 *
 * @param {object}   entry      - a result from cnmh_downtimeresults_global
 * @param {Function} getState   - (charId, key) => value  (SessionContext)
 * @param {Function} sendUpdate - (charId, key, value) => void
 * @param {Function} appendLog  - ({ type, charId, text }) => void
 * @returns {number} the character's new gold total (gp)
 */
export function creditEarnIncome({ entry, getState, sendUpdate, appendLog }) {
  const { charId, charName, payoutCp = 0, skillLabel, taskLevel, dc, degree } = entry || {};

  const gain = cpToGp(payoutCp);
  const current = readGold(charId, getState);
  const next = current + gain;

  writeLocal(`cnmh_gold_${charId}`, next);
  if (sendUpdate) sendUpdate(charId, 'gold', next);

  if (appendLog) {
    const label = DEGREE_LABEL[degree] || degree;
    appendLog({
      type: 'action',
      charId,
      text:
        `${charName || 'A character'} earned income with ${skillLabel} ` +
        `(level ${taskLevel} task, DC ${dc}): ${label} — ${gain} gp`,
    });
  }

  return next;
}
