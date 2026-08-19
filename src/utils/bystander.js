// src/utils/bystander.js
// Harmless Bystander faithful tracking (#465) — pure rules, React-free.
//
// Izzy's level-4 skill feat lets her roll Deception for initiative and pass as
// a bystander. #226 Slice D shipped the declaration itself; this module adds
// the three mechanics the feat actually hangs off it:
//
//   1. Reaction suppression — while the declaration stands and she has NOT yet
//      been observed being hostile, non-allied creatures can't make reactions
//      against her.
//   2. Auto-lift + per-creature 1-day immunity — the moment she takes a
//      hostile action the disguise drops for everyone who saw it, and each of
//      those creatures becomes immune to her Harmless Bystander for 1 day.
//      Immunity is CROSS-ENCOUNTER: it is keyed by the persistent creature key
//      (`rkKeyFor`, same key Recall Knowledge and the bestiary use), never the
//      ephemeral per-fight entryId, and expires on the game clock.
//   3. A +4 circumstance bonus to their Sense Motive while she is visibly
//      wielding a weapon.
//
// "1 day" reuses the shared ability-immunity engine (#218, utils/immunity.js) —
// the same absolute `expireAtSecs` game-seconds stamp Tell Fortune's per-target
// ledger and the effect sweep already speak — so advancing the campaign clock
// expires the immunity with no timer anywhere.
//
// State lives on the EXISTING per-character key (no new sync type):
//   cnmh_bystander_<charId> = {
//     active:     boolean,   // declared for this encounter
//     mod:        'deception' | null,
//     ts:         number,
//     revealed:   boolean,   // observed taking a hostile action → suppression off
//     revealedTs: number,
//     immune:     { [creatureKey]: immunityEntry }   // survives encounter end
//   }
// `immune` is the one field that must OUTLIVE the encounter, so every clear
// path (encounter sweep, daily prep, un-declaring) goes through
// clearBystanderDeclaration below rather than writing a fresh idle object.
import { makeImmunityEntry, hasAbilityImmunity } from './immunity';
import { rkKeyFor } from './recallKnowledge';
import { deriveHands } from './hands';

export const BYSTANDER_ABILITY_KEY = 'harmless-bystander';
export const BYSTANDER_NAME = 'Harmless Bystander';
export const BYSTANDER_IMMUNITY_SECS = 86400; // 1 day
/** Circumstance bonus to Sense Motive when the bystander is visibly armed. */
export const ARMED_SENSE_MOTIVE_BONUS = 4;

export const IDLE_BYSTANDER = Object.freeze({
  active: false,
  mod: null,
  ts: 0,
  revealed: false,
  revealedTs: 0,
  immune: {},
});

/** Fill in the fields a pre-#465 payload never carried. Never mutates. */
export function normalizeBystander(state) {
  const s = state || {};
  return {
    active: !!s.active,
    mod: s.active ? s.mod || null : null,
    ts: s.ts || 0,
    revealed: !!s.revealed,
    revealedTs: s.revealedTs || 0,
    immune: s.immune && typeof s.immune === 'object' ? s.immune : {},
  };
}

// ── Per-creature 1-day immunity ─────────────────────────────────────────────

/** The 1-day immunity entry stamped on a creature that watched her turn hostile. */
export function bystanderImmunityEntry({ charId, creatureName, nowSecs }) {
  return {
    ...makeImmunityEntry({
      abilityKey: BYSTANDER_ABILITY_KEY,
      abilityName: BYSTANDER_NAME,
      casterId: charId,
      nowSecs,
      durationSecs: BYSTANDER_IMMUNITY_SECS,
    }),
    creatureName: creatureName || null,
  };
}

/**
 * Is this creature currently immune to that character's Harmless Bystander?
 * Per-caster scope: immunity is to HER disguise, not to the feat in general.
 * A null `nowSecs` (no game clock in scope) reads as "not yet expired", the
 * same convention hasAbilityImmunity uses everywhere else.
 */
export function isBystanderImmune(state, creatureKey, { charId, nowSecs } = {}) {
  if (!creatureKey) return false;
  const entry = normalizeBystander(state).immune[creatureKey];
  if (!entry) return false;
  return hasAbilityImmunity([entry], {
    abilityKey: BYSTANDER_ABILITY_KEY,
    casterId: charId ?? entry.appliedBy,
    scope: 'per-caster',
    nowSecs,
  });
}

/** Drop expired entries — housekeeping run on every write to the ledger. */
export function pruneBystanderImmunities(immune, nowSecs) {
  const out = {};
  for (const [key, entry] of Object.entries(immune || {})) {
    if (!entry) continue;
    if (nowSecs != null && typeof entry.expireAtSecs === 'number' && entry.expireAtSecs <= nowSecs) {
      continue;
    }
    out[key] = entry;
  }
  return out;
}

// ── Observers ───────────────────────────────────────────────────────────────

/** A FRIENDLY (disposition 1) combatant — an NPC ally, not a non-ally (#1537 S6). */
export const isNonAllyEntry = (entry) =>
  entry?.kind === 'enemy' && entry.disposition !== 1;

/**
 * The creatures in an encounter order that can observe her — every non-ally
 * combatant, keyed the persistent way (creatureKey when the bridge supplied
 * one, entryId as the unlinked/homebrew fallback, exactly like Recall
 * Knowledge). PCs, summons and friendly-disposition NPCs are allies and never
 * observe.
 *
 * @param {Array} order - encounter order entries
 * @returns {Array<{ key: string, name: string }>}
 */
export function bystanderObservers(order = []) {
  const seen = new Set();
  const out = [];
  for (const entry of order || []) {
    if (!isNonAllyEntry(entry)) continue;
    const key = rkKeyFor(entry);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, name: entry.name || key });
  }
  return out;
}

/**
 * Which observers in this encounter are ALREADY immune — the "they've seen
 * this trick today" list surfaced when she declares.
 */
export function immuneObservers(state, order, { charId, nowSecs } = {}) {
  return bystanderObservers(order).filter((o) =>
    isBystanderImmune(state, o.key, { charId, nowSecs })
  );
}

/** The observers the declaration still fools (not immune). */
export function fooledObservers(state, order, { charId, nowSecs } = {}) {
  return bystanderObservers(order).filter(
    (o) => !isBystanderImmune(state, o.key, { charId, nowSecs })
  );
}

// ── Reaction suppression ────────────────────────────────────────────────────

/**
 * Can this creature make reactions against her right now?
 * Suppressed while the declaration is live, she has not been observed being
 * hostile, and this particular creature is not already immune.
 */
export function suppressesReactionsAgainst(state, creatureKey, { charId, nowSecs } = {}) {
  const s = normalizeBystander(state);
  if (!s.active || s.revealed) return false;
  return !isBystanderImmune(s, creatureKey, { charId, nowSecs });
}

/** Blanket "is the disguise still up" — the chip / pill read-out. */
export function bystanderHiding(state) {
  const s = normalizeBystander(state);
  return s.active && !s.revealed;
}

// ── Auto-lift ───────────────────────────────────────────────────────────────

/**
 * Does this committed ability use count as an observed hostile action?
 * Two independent signals, either is enough:
 *   • it resolved against at least one non-ally combatant, or
 *   • it is an attack (the Attack trait / an attack-roll ability) — a Strike
 *     whose target lives in Foundry never reaches the app's selection list.
 */
export function isHostileUse({ ability, hostileTargets = [], isAttack = false } = {}) {
  if (isAttack) return true;
  if ((hostileTargets || []).length > 0) return true;
  return (ability?.traits || []).some((t) => String(t).toLowerCase() === 'attack');
}

/**
 * Mark her recognized as hostile: suppression lifts and every observer that
 * watched it becomes immune for a day. Idempotent — a second hostile action in
 * the same fight refreshes nothing that matters and never double-logs (callers
 * gate on `bystanderHiding`). Returns the next state; never mutates.
 *
 * @param {Object} state     - current cnmh_bystander_<charId> payload
 * @param {Array}  observers - [{ key, name }] from bystanderObservers
 * @param {Object} opts      - { charId, nowSecs }
 */
export function stampBystanderReveal(state, observers = [], { charId, nowSecs } = {}) {
  const s = normalizeBystander(state);
  const immune = pruneBystanderImmunities(s.immune, nowSecs);
  for (const o of observers || []) {
    if (!o?.key) continue;
    immune[o.key] = bystanderImmunityEntry({
      charId,
      creatureName: o.name,
      nowSecs: nowSecs ?? 0,
    });
  }
  return { ...s, revealed: true, revealedTs: Date.now(), immune };
}

/**
 * Drop the per-encounter declaration while PRESERVING the cross-encounter
 * immunity ledger (pruned of expired entries). THE clear path — the encounter
 * sweep, daily preparations and un-declaring all use it, because writing a
 * plain idle object here would silently wipe a day's worth of immunity.
 */
export function clearBystanderDeclaration(state, nowSecs) {
  const s = normalizeBystander(state);
  return {
    active: false,
    mod: null,
    ts: Date.now(),
    revealed: false,
    revealedTs: 0,
    immune: pruneBystanderImmunities(s.immune, nowSecs),
  };
}

/** The declaration payload written when she checks the toggle. */
export function declareBystander(state, mod, nowSecs) {
  const s = normalizeBystander(state);
  return {
    active: true,
    mod: mod || 'deception',
    ts: Date.now(),
    revealed: false,
    revealedTs: 0,
    immune: pruneBystanderImmunities(s.immune, nowSecs),
  };
}

// ── +4 Sense Motive while visibly armed ─────────────────────────────────────

/**
 * "If you are wielding a weapon … the creature gets a +4 circumstance bonus to
 * their Sense Motive." Reads the live hand slots (utils/hands.js — the same
 * derivation the Hands strip and the buckler rules use); a held item counts as
 * a weapon when it carries Strike data.
 *
 * @param {Array} inventory - resolved character inventory (useCharacter output)
 * @returns {{ armed: boolean, bonus: number, weapons: string[] }}
 */
export function armedSenseMotiveHint(inventory) {
  const { slot1, slot2 } = deriveHands(inventory || []);
  const held = slot1 === slot2 ? [slot1] : [slot1, slot2];
  const weapons = held
    .filter((i) => i && i.strikes)
    .map((i) => i.name)
    .filter((name, idx, arr) => !!name && arr.indexOf(name) === idx);
  return {
    armed: weapons.length > 0,
    bonus: weapons.length > 0 ? ARMED_SENSE_MOTIVE_BONUS : 0,
    weapons,
  };
}
