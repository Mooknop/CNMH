// Treat Wounds / Battle Medicine resolution helpers.
// Pure rules utilities + one side-effecting apply function.
// React-free — mirrors the style of applyAbility.js.

import { newEntryUid } from './uid';

// PF2e Treat Wounds DC table.
// requiredRank: minimum Medicine proficiency rank to unlock this DC.
// flat: the flat bonus added to the dice result on success/crit.
const DC_TABLE = {
  15: { requiredRank: 1, flat: 0  },
  20: { requiredRank: 2, flat: 10 },
  30: { requiredRank: 3, flat: 30 },
  40: { requiredRank: 4, flat: 50 },
};

export const IMMUNITY_EFFECT_ID = 'treat-wounds-immunity';

// Returns the array of DC values the healer may choose, given their Medicine rank (0–4).
export function availableDcs(medicineRank) {
  return Object.keys(DC_TABLE)
    .map(Number)
    .filter((dc) => DC_TABLE[dc].requiredRank <= medicineRank);
}

// Returns the dice-hint string for displaying in the amount input label.
// degree: 'criticalSuccess' | 'success' | 'criticalFailure'
// Returns null for 'failure' (nothing to roll).
export function healHint(dc, degree) {
  const flat = DC_TABLE[dc]?.flat ?? 0;
  if (degree === 'criticalSuccess') return flat > 0 ? `4d8 + ${flat}` : '4d8';
  if (degree === 'success')         return flat > 0 ? `2d8 + ${flat}` : '2d8';
  if (degree === 'criticalFailure') return '1d8 damage';
  return null;
}

// Returns true if the target already has a Treat Wounds Immunity from this healer.
export function hasImmunityFrom(targetEffects, healerId) {
  return (targetEffects || []).some(
    (e) => e.effectId === IMMUNITY_EFFECT_ID && e.appliedBy === healerId,
  );
}

const writeLocal = (key, value) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
};

/**
 * Applies a Treat Wounds / Battle Medicine resolution to the target.
 * React-free — accepts hooks' return values as plain arguments.
 *
 * HP writes go through sendUpdate(targetId, 'hp', value) so the Foundry bridge
 * picks them up via characterSync.js and writes system.attributes.hp back onto
 * the linked Foundry actor (bridge.js key === 'hp' route).
 *
 * @param {Object}   healer     - { id, name }
 * @param {Object}   target     - { id, name, maxHp }
 * @param {number}   dc         - chosen DC (15 | 20 | 30 | 40)
 * @param {string}   degree     - computeSaveDegree result
 * @param {number}   amount     - HP to heal or damage (entered by player); ignored on failure
 * @param {string}   actionName - 'Treat Wounds' | 'Battle Medicine'
 * @param {number}   [nowSecs]  - current absolute game seconds; stamps a clock-
 *                                based immunity expiry (Battle Medicine 1 day,
 *                                Treat Wounds 1 hour) the expiry sweep can clear
 * @param {Function} getState   - (charId, key) => value  (from SessionContext)
 * @param {Function} sendUpdate - (charId, key, value) => void
 * @param {Function} appendLog  - ({ type, charId, text }) => void
 */
export function applyTreatWounds({
  healer,
  target,
  dc,
  degree,
  amount,
  actionName,
  nowSecs,
  getState,
  sendUpdate,
  appendLog,
}) {
  if (degree === 'failure') {
    appendLog({
      type:   'action',
      charId: healer.id,
      text:   `${healer.name} used ${actionName} on ${target.name} (DC ${dc}): Failure — no effect`,
    });
    return;
  }

  const seedHp = {
    current: target.maxHp || 0,
    max:     target.maxHp || 0,
    temp:    0,
    dying:   0,
    wounded: 0,
    doomed:  0,
  };
  const currentHp = getState(target.id, 'hp') || seedHp;

  let newHp;
  let logText;

  if (degree === 'criticalFailure') {
    const newCurrent = Math.max(0, currentHp.current - amount);
    newHp = { ...currentHp, current: newCurrent };
    logText = `${healer.name} used ${actionName} on ${target.name} (DC ${dc}): Critical Failure — ${amount} damage`;
  } else {
    // 'success' | 'criticalSuccess'
    const newCurrent = Math.min(currentHp.max, currentHp.current + amount);
    newHp = { ...currentHp, current: newCurrent };
    const label = degree === 'criticalSuccess' ? 'Critical Success' : 'Success';
    logText = `${healer.name} used ${actionName} on ${target.name} (DC ${dc}): ${label} — healed ${amount}`;
  }

  writeLocal(`cnmh_hp_${target.id}`, newHp);
  sendUpdate(target.id, 'hp', newHp);

  appendLog({ type: 'action', charId: healer.id, text: logText });

  // Immunity is applied only when healing is delivered (success/crit success).
  if (degree === 'success' || degree === 'criticalSuccess') {
    const currentEffects = getState(target.id, 'effects') || [];
    // Battle Medicine immunity lasts 1 day, Treat Wounds 1 hour. The absolute
    // game-seconds expiry lets the clock sweep clear it automatically; the
    // entry stays GM-removable too (× in EffectsPanel).
    const immunitySecs = actionName === 'Battle Medicine' ? 86400 : 3600;
    const immunityEntry = {
      id:        newEntryUid(),
      effectId:  IMMUNITY_EFFECT_ID,
      appliedBy: healer.id,
      source:    actionName,
      ...(typeof nowSecs === 'number' ? { expireAtSecs: nowSecs + immunitySecs } : {}),
      ts:        Date.now(),
    };
    const nextEffects = [...currentEffects, immunityEntry];
    writeLocal(`cnmh_effects_${target.id}`, nextEffects);
    sendUpdate(target.id, 'effects', nextEffects);
  }
}
