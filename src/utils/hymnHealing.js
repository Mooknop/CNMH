// Hymn of Healing (#226, Slice A) — pure helpers + React-free apply functions
// shared by the cast modal, the Sustain prompt, and the turn-start fast-healing
// tick.
//
// Hymn of Healing is Izzy's sustained composition: the target gains fast healing
// (auto-applied at the start of their turn) and temporary Hit Points on cast and
// the first time each round it's Sustained. Both scale +2 per rank above 1st;
// the spell auto-heightens to half the caster's level (rounded up), like a
// cantrip. The heal target + amounts ride on the sustain entry's `heal` payload
// so fast healing can be resolved live from the ledger with no separate effect.

export const HYMN_ID = 'hymn-of-healing';

export const isHymnOfHealing = (spell) => spell?.id === HYMN_ID;

// Auto-heighten rank for a focus spell: half level rounded up, floor 1.
export const hymnRank = (level) => Math.max(1, Math.ceil((level || 1) / 2));

// Fast healing + temp HP for a cast rank. Base 2 at rank 1, +2 per rank after
// (Hymn's baseLevel is 1), so each equals 2 × rank.
export const hymnAmounts = (rank) => {
  const r = Math.max(1, rank || 1);
  return { fastHealing: 2 * r, tempHp: 2 * r };
};

// HP state seed for a target with no stored HP yet (treated as full).
const seedHp = (maxHp) => ({
  current: maxHp || 0,
  max:     maxHp || 0,
  temp:    0,
  dying:   0,
  wounded: 0,
  doomed:  0,
});

const writeLocal = (key, value) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
};

// Pure: temporary HP don't stack — take the higher of the existing pool and the
// incoming grant.
export const grantTempHp = (hp, amount) => ({ ...hp, temp: Math.max(hp.temp || 0, amount || 0) });

// Pure: heal current HP, capped at max. Returns { hp, healed } where `healed` is
// the actual amount restored (0 when already full).
export const healHp = (hp, amount) => {
  const target = Math.min(hp.max || 0, (hp.current || 0) + (amount || 0));
  return { hp: { ...hp, current: target }, healed: target - (hp.current || 0) };
};

// Pure: the highest Hymn fast-healing amount among a caster's sustains that
// target `targetId` (multiple Hymns don't stack — take the strongest).
export const hymnFastHealingFor = (sustains, targetId) =>
  (sustains || []).reduce((best, s) => {
    if (s.spellId === HYMN_ID && s.heal?.targetId === targetId) {
      return Math.max(best, s.heal.fastHealing || 0);
    }
    return best;
  }, 0);

/**
 * Grant temporary HP to a target (take-higher). React-free.
 * @returns the new temp-HP total.
 */
export function applyHymnTempHp({ getState, sendUpdate, target, amount }) {
  const hp = getState(target.id, 'hp') || seedHp(target.maxHp);
  const next = grantTempHp(hp, amount);
  writeLocal(`cnmh_hp_${target.id}`, next);
  sendUpdate(target.id, 'hp', next);
  return next.temp;
}

/**
 * Apply fast healing to a target, capped at max HP. React-free.
 * @returns the amount actually healed (0 when already full / no HP tracked).
 */
export function applyHymnFastHealing({ getState, sendUpdate, target, amount }) {
  const hp = getState(target.id, 'hp') || seedHp(target.maxHp);
  const { hp: next, healed } = healHp(hp, amount);
  if (healed <= 0) return 0;
  writeLocal(`cnmh_hp_${target.id}`, next);
  sendUpdate(target.id, 'hp', next);
  return healed;
}
