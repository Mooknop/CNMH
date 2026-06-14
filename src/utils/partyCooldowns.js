// src/utils/partyCooldowns.js
// Clock-derived cooldown + immunity read-outs for the GM party dashboard
// (#230, slice 2). Pure — takes a resolved character, its live freq ledger and
// effects, and the current game-seconds; returns lists with absolute ready-at /
// expiry moments the dashboard renders relative to "now".
//
// Cooldowns reuse the frequency engine (utils/frequency.js): we only surface
// *window* locks (hour/day/week) because those have a clock-derived ready-at —
// turn/round locks are encounter-ephemeral and meaningless on a cross-mode
// board. Immunities are the ability-immunity (Tell Fortune, Guidance, …) and
// treat-wounds-immunity (Battle Medicine, Treat Wounds) effects that carry an
// absolute expiry.
import {
  freqKeyFor,
  parseFrequency,
  checkFrequency,
  WINDOW_SECS,
} from './frequency';
import { getActions, getReactions, getFreeActions } from './actionUtils';
import { ABILITY_IMMUNITY_EFFECT_ID } from './immunity';
import { IMMUNITY_EFFECT_ID as TREAT_WOUNDS_IMMUNITY_EFFECT_ID } from './treatWounds';

// Eld Attunement powers are a class feature usable once per hour; the rule is
// injected at the call site rather than tagged on each power (mirrors
// EldPowers.jsx / dailyPrep.js).
const ELD_FREQUENCY_RULE = { per: 'hour', uses: 1 };

const IMMUNITY_EFFECT_IDS = new Set([
  ABILITY_IMMUNITY_EFFECT_ID,
  TREAT_WOUNDS_IMMUNITY_EFFECT_ID,
]);

/** Slug → Title Case fallback label when an ability can't be resolved. */
const prettify = (key) =>
  String(key || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

/**
 * Index a character's frequency-bearing abilities by ledger key, so cooldown
 * records can be resolved to a display name + rule. Covers actions, reactions,
 * free actions (incl. feat/item sources) and Eld powers. First write wins.
 */
function indexFrequencyAbilities(character) {
  const index = {};
  if (!character) return index;

  const add = (ability, ruleOverride) => {
    const rule = ruleOverride || parseFrequency(ability);
    if (!rule) return;
    const key = freqKeyFor(ability);
    if (!key || index[key]) return;
    index[key] = { name: ability.name || prettify(key), source: ability.source || null, rule };
  };

  for (const a of getActions(character)) add(a);
  for (const a of getReactions(character)) add(a);
  for (const a of getFreeActions(character)) add(a);
  for (const src of character.spellcasting?.eldPowers || []) {
    for (const p of src.powers || []) add({ ...p, source: src.source }, ELD_FREQUENCY_RULE);
  }
  return index;
}

/**
 * Best-effort rule for a ledger key with no indexed ability: if it still has an
 * active window record, treat it as once-per-<that window> so the cooldown
 * surfaces even for abilities we didn't enumerate (innate spells, etc.).
 */
function inferWindowRule(records, nowSecs) {
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i];
    const w = WINDOW_SECS[r?.per];
    if (w && typeof r.gameSecs === 'number' && r.gameSecs <= nowSecs && nowSecs < r.gameSecs + w) {
      return { per: r.per, uses: 1 };
    }
  }
  return null;
}

/**
 * Active window cooldowns for one character, soonest-ready first.
 * @param {Object} character - resolved character (for ability names/rules)
 * @param {Object} ledger - cnmh_freq_<id> ledger ({ [key]: UseRecord[] })
 * @param {{ nowSecs: number }} ctx
 * @returns {Array<{ key, name, source, availableAtSecs, lastUsedSecs, per }>}
 */
export function collectCooldowns(character, ledger, { nowSecs } = {}) {
  const index = indexFrequencyAbilities(character);
  const out = [];

  for (const [key, records] of Object.entries(ledger || {})) {
    if (!records?.length) continue;
    const known = index[key];
    const rule = known?.rule || inferWindowRule(records, nowSecs);
    if (!rule || !WINDOW_SECS[rule.per]) continue;

    const gate = checkFrequency({ rule, records, nowSecs });
    if (gate.available || gate.lockKind !== 'window') continue;

    out.push({
      key,
      name: known?.name || prettify(key),
      source: known?.source || null,
      availableAtSecs: gate.availableAtSecs,
      lastUsedSecs: gate.lastUsedSecs,
      per: rule.per,
    });
  }

  out.sort((a, b) => (a.availableAtSecs ?? 0) - (b.availableAtSecs ?? 0));
  return out;
}

/**
 * Active immunities for one character carrying an absolute expiry, soonest
 * first. Entries without a numeric expiry are GM-managed and left to the
 * effects/inspector view.
 * @param {Array} effects - cnmh_effects_<id>
 * @param {number} nowSecs
 * @returns {Array<{ id, label, expireAtSecs }>}
 */
export function collectImmunities(effects, nowSecs) {
  return (effects || [])
    .filter(
      (e) =>
        IMMUNITY_EFFECT_IDS.has(e?.effectId) &&
        typeof e.expireAtSecs === 'number' &&
        e.expireAtSecs > nowSecs,
    )
    .map((e) => ({ id: e.id, label: e.source || 'Immunity', expireAtSecs: e.expireAtSecs }))
    .sort((a, b) => a.expireAtSecs - b.expireAtSecs);
}
