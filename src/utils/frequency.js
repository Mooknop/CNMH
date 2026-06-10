// src/utils/frequency.js
// Ability frequency engine (#218). Availability is *derived* from a per-
// character ledger of use records compared against the game clock and the
// live encounter — there are no timers to run, so advancing the clock or the
// round naturally re-enables abilities.
//
// Ledger (synced as cnmh_freq_<charId>):
//   { [abilityKey]: UseRecord[] }   (oldest first)
// UseRecord:
//   { gameSecs, realTs, per, round?, entryId? }
//   round/entryId are stamped only when recorded during an active encounter.
import { formatAvailableAt, formatGameDuration } from './gameTime';

export const FREQUENCY_PERS = ['turn', 'round', 'hour', 'day', 'week'];

export const WINDOW_SECS = {
  hour: 3600,
  day: 86400,
  week: 604800,
};

const slug = (name) =>
  String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Stable ledger key for an ability. The ledger is per-character, so a name
 * slug is collision-free in practice; ids win when present.
 */
export function freqKeyFor(ability) {
  return ability?.id || slug(ability?.name) || null;
}

const FREQ_TEXT_RE = /(?:once|(\d+)\s*times?)\s+per\s+(turn|round|hour|day|week)/i;

/**
 * Resolve an ability's frequency rule → { per, uses } | null.
 * Precedence: structured frequencyRule → Flourish trait (once per turn) →
 * free-text `frequency` string parse ("once per day", "3 times per hour").
 */
export function parseFrequency(ability) {
  if (!ability) return null;
  const rule = ability.frequencyRule;
  if (rule && FREQUENCY_PERS.includes(rule.per)) {
    const uses = Number(rule.uses);
    return { per: rule.per, uses: Number.isFinite(uses) && uses >= 1 ? uses : 1 };
  }
  const traits = ability.traits || [];
  if (traits.some((t) => String(t).toLowerCase() === 'flourish')) {
    return { per: 'turn', uses: 1 };
  }
  const m = typeof ability.frequency === 'string' && ability.frequency.match(FREQ_TEXT_RE);
  if (m) {
    return { per: m[2].toLowerCase(), uses: m[1] ? Math.max(1, parseInt(m[1], 10)) : 1 };
  }
  return null;
}

const encounterRunning = (encounter) =>
  !!(encounter && encounter.active && encounter.phase === 'in-progress');

/**
 * A record still "counts against" the rule right now.
 * Clock-backwards guard: window records stamped in the future are ignored.
 */
const recordActive = (rec, rule, { nowSecs, encounter, casterEntryId }) => {
  if (!rec) return false;
  if (rule.per === 'turn') {
    return (
      encounterRunning(encounter) &&
      rec.round === encounter.round &&
      rec.entryId != null &&
      rec.entryId === casterEntryId
    );
  }
  if (rule.per === 'round') {
    return encounterRunning(encounter) && rec.round === encounter.round;
  }
  const windowSecs = WINDOW_SECS[rule.per];
  if (!windowSecs || typeof rec.gameSecs !== 'number') return false;
  if (rec.gameSecs > nowSecs) return false; // clock moved backwards
  return nowSecs < rec.gameSecs + windowSecs;
};

/**
 * Gate an ability against its ledger records.
 * @returns {{ available: boolean, lastUsedSecs: number|null,
 *             availableAtSecs: number|null, lockKind: 'turn'|'round'|'window'|null }}
 */
export function checkFrequency({ rule, records, nowSecs, encounter, casterEntryId }) {
  const open = { available: true, lastUsedSecs: null, availableAtSecs: null, lockKind: null };
  if (!rule) return open;
  const ctx = { nowSecs, encounter, casterEntryId };
  const active = (records || []).filter((r) => recordActive(r, rule, ctx));
  if (active.length < rule.uses) {
    const last = active[active.length - 1];
    return { ...open, lastUsedSecs: last?.gameSecs ?? null };
  }
  const last = active[active.length - 1];
  if (rule.per === 'turn' || rule.per === 'round') {
    return {
      available: false,
      lastUsedSecs: last?.gameSecs ?? null,
      availableAtSecs: null,
      lockKind: rule.per,
    };
  }
  // Window lock frees up when the *oldest* active record ages out.
  const oldest = active[0];
  return {
    available: false,
    lastUsedSecs: last?.gameSecs ?? null,
    availableAtSecs: oldest.gameSecs + WINDOW_SECS[rule.per],
    lockKind: 'window',
  };
}

/**
 * Append a use record for an ability, pruning records that no longer count
 * (so the ledger stays small). Returns the next ledger; never mutates.
 */
export function recordUse({ ledger, abilityKey, rule, nowSecs, encounter, casterEntryId }) {
  if (!abilityKey || !rule) return ledger || {};
  const ctx = { nowSecs, encounter, casterEntryId };
  const prior = ((ledger || {})[abilityKey] || []).filter((r) => recordActive(r, rule, ctx));
  const rec = { gameSecs: nowSecs, realTs: Date.now(), per: rule.per };
  if (encounterRunning(encounter)) {
    rec.round = encounter.round;
    if (casterEntryId) rec.entryId = casterEntryId;
  }
  return { ...(ledger || {}), [abilityKey]: [...prior, rec] };
}

/** Drop an ability's records entirely (GM "clear lock"). */
export function clearUse(ledger, abilityKey) {
  if (!ledger || !(abilityKey in ledger)) return ledger || {};
  const next = { ...ledger };
  delete next[abilityKey];
  return next;
}

/**
 * Remove every record with the given `per` across the ledger — daily prep
 * prunes 'day' so dailies reset immediately (#219).
 */
export function pruneLedgerByPer(ledger, per) {
  const next = {};
  for (const [key, records] of Object.entries(ledger || {})) {
    const kept = (records || []).filter((r) => r.per !== per);
    if (kept.length) next[key] = kept;
  }
  return next;
}

const PER_LABEL = {
  turn: 'Once per turn',
  round: 'Once per round',
  hour: 'Once per hour',
  day: 'Once per day',
  week: 'Once per week',
};

const ruleLabel = (rule) =>
  rule.uses > 1 ? `${rule.uses} times per ${rule.per}` : PER_LABEL[rule.per];

/**
 * Human lock message for the use modal, e.g.
 * "Once per hour — used 23m ago, available at 14:30".
 */
export function lockMessage(gate, rule, nowSecs) {
  if (!gate || gate.available || !rule) return null;
  const label = ruleLabel(rule);
  if (gate.lockKind === 'turn') return `${label} — already used this turn`;
  if (gate.lockKind === 'round') return `${label} — already used this round`;
  const ago =
    gate.lastUsedSecs != null
      ? `used ${formatGameDuration(nowSecs - gate.lastUsedSecs)} ago`
      : 'used recently';
  const at =
    gate.availableAtSecs != null
      ? `available at ${formatAvailableAt(gate.availableAtSecs, nowSecs)}`
      : 'available later';
  const daily = rule.per === 'day' ? ' or after daily preparations' : '';
  return `${label} — ${ago}, ${at}${daily}`;
}
