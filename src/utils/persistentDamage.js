import { APP, globalKey } from '../sync/keys';
// Persistent-damage tracking (#272, #222 slice 3). Tracked entries live in a
// single synced map at cnmh_persistent_global keyed by encounter entryId —
// PCs and enemies alike. Deliberately NOT cnmh_conditions_<charId>: the
// Foundry bridge full-replaces that key on every condition change
// (characterSync.js), so app-written entries there would vanish mid-encounter
// in bridged sessions.
//
// Map shape:
//   { [entryId]: [{ id, dice, type, sourceName, half? }] }
//
// `dice` arrives already crit-doubled from computeTargetDamage /
// computeSaveDamage; `half: true` marks a basic-save success (halve the roll).
// All helpers are pure so the recorder, watcher, chip, and tests share one
// algebra (same pattern as encounterUtils).

export const PERSISTENT_KEY = globalKey(APP.PERSISTENT);

export const newPersistentId = () =>
  `pd-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;

// Damage-result persistent entries [{ dice, type, label, half? }] → tracked
// instances stamped with the ability that inflicted them.
export const makeInstances = (persistent, sourceName) =>
  (persistent || [])
    .filter((p) => p && p.dice)
    .map((p) => ({
      id: newPersistentId(),
      dice: p.dice,
      type: p.type || '',
      sourceName: sourceName || '',
      ...(p.half && { half: true }),
      // Recovery-DC override ({ base, assisted } — Toothy Knife, #1215).
      ...(p.recoveryDc && { recoveryDc: p.recoveryDc }),
    }));

export const addPersistent = (map, entryId, instances) => {
  if (!entryId || !instances || !instances.length) return map || {};
  const base = map || {};
  return { ...base, [entryId]: [...(base[entryId] || []), ...instances] };
};

// Drops the entryId key entirely when its last instance clears.
export const removeInstance = (map, entryId, instanceId) => {
  const base = map || {};
  const list = base[entryId];
  if (!list) return base;
  const next = list.filter((i) => i.id !== instanceId);
  if (next.length === list.length) return base;
  const out = { ...base };
  if (next.length) out[entryId] = next;
  else delete out[entryId];
  return out;
};

// Removed combatants take their tracked damage with them. Returns the same
// reference when nothing is orphaned so callers can skip the write.
export const pruneOrphans = (map, order) => {
  const base = map || {};
  const live = new Set((order || []).map((e) => e && e.entryId).filter(Boolean));
  const keys = Object.keys(base);
  const kept = keys.filter((k) => live.has(k));
  if (kept.length === keys.length) return base;
  return Object.fromEntries(kept.map((k) => [k, base[k]]));
};

// Per-target persistent entries out of the confirm-time results: ray groups
// ([{ rayIndex, results }] — single-roll casts arrive as one group) and
// chained-strike rolls (chainResults.rolls: array of per-strike result sets).
// Same-target entries from multiple rays/strikes accumulate.
export const collectFromResults = (rayGroups, chainResults) => {
  const hits = [];
  (rayGroups || []).forEach((g) => {
    (g?.results || []).forEach((r) => {
      if (r?.entryId && r.damage?.persistent?.length) {
        hits.push({ entryId: r.entryId, persistent: r.damage.persistent });
      }
    });
  });
  (chainResults?.rolls || []).forEach((rollSet) => {
    (rollSet || []).forEach((r) => {
      if (r?.entryId && r.damage?.persistent?.length) {
        hits.push({ entryId: r.entryId, persistent: r.damage.persistent });
      }
    });
  });
  return hits;
};

// Shared record-time writer (#1015): mint each hit's instances, drop the ones
// the target's own immunities block (with a log line and an immunity reveal —
// the players just watched the damage not stick), and fold the survivors into
// the map. `order` supplies names + defenses; a hit whose entry is absent or
// carries no `defenses` (manual enemies) records everything, as before — the
// optional `appendLog`/`revealFiredIwr` legs are skipped when not passed.
// Returns { recordedEntryIds } so callers can name who actually took something.
export const recordPersistentHits = ({
  hits, order, abilityName, setPersistentMap, appendLog, revealFiredIwr,
}) => {
  const recorded = [];
  const reveals = [];
  (hits || []).forEach((h) => {
    const entry = (order || []).find((e) => e.entryId === h.entryId) || null;
    const { kept, blocked } = partitionByImmunity(
      makeInstances(h.persistent, abilityName),
      entry?.defenses,
    );
    if (kept.length) recorded.push({ entryId: h.entryId, instances: kept });
    blocked.forEach(({ inst, immunity }) => {
      appendLog?.({ type: 'system', text: formatImmuneSkip(entry?.name || 'Target', inst) });
      reveals.push({
        entryId: h.entryId,
        damage: { iwr: [{ kind: 'immunity', type: immunity, amount: 0 }] },
      });
    });
  });
  if (recorded.length && setPersistentMap) {
    setPersistentMap((m) => recorded.reduce(
      (acc, r) => addPersistent(acc, r.entryId, r.instances),
      m || {}
    ));
  }
  if (reveals.length) revealFiredIwr?.(reveals);
  return { recordedEntryIds: new Set(recorded.map((r) => r.entryId)) };
};

// Confirm-time applier (#272): record each target's persistent entries
// (already crit-doubled by computeTargetDamage) through the caller's synced
// map setter so the turn tracker chips them and the watcher reminds at their
// turn end. Callers pass chainResults only for strike chains (null otherwise).
// With `order` the target's immunities negate matching instances at record
// time (#1015); without it every instance records, as before.
export const applyPersistentFromResults = ({
  rayGroups, chainResults, abilityName, setPersistentMap,
  order = null, appendLog = null, revealFiredIwr = null,
}) => {
  recordPersistentHits({
    hits: collectFromResults(rayGroups, chainResults),
    order, abilityName, setPersistentMap, appendLog, revealFiredIwr,
  });
};

const describe = (inst) =>
  `${inst.dice} persistent ${inst.type || 'damage'}${inst.half ? ' (half)' : ''}`;

// Recovery flat-check DCs. The standard DC to end persistent damage is 15; an
// effect that eases it "as if aided" (Blood Booster, #900) drops it to 10.
export const RECOVERY_DC = 15;
export const EASED_RECOVERY_DC = 10;

// The resistance descriptor a persistent instance is matched against — the
// damage type prefixed `persistent-` (e.g. 'persistent-bleed'). Resistance `vs`
// lists use these tokens so persistent and direct damage of the same type are
// distinguishable.
export const persistentVsType = (inst) => `persistent-${inst?.type || ''}`;

// ── Enemy IWR from Foundry-imported defenses (#1015) ────────────────────────
//
// Enemy order entries imported off Foundry actors carry `defenses`
// ({ immunities: [type], weaknesses/resistances: [{ type, value }] }, #932).
// Foundry types are bare (`fire`) while the app's persistent descriptors are
// `persistent-<type>`, so every matcher here accepts both tokens — the same
// one-way fallback as EffectUtils.vsMatches (#1679). Manual enemies have no
// `defenses` and resolve to nothing, exactly as before.

const persistentDefenseTokens = (type) => {
  const t = String(type || '').toLowerCase();
  return t ? [t, `persistent-${t}`] : [];
};

// The matching token off `defenses.immunities`, or null. Returns the token
// (not a boolean) so the reveal-on-fire write keys the bestiary record by the
// monster's own type string, the way applyIwr's fired list does (#1014).
export const persistentImmunityMatch = (defenses, type) => {
  const tokens = persistentDefenseTokens(type);
  if (!tokens.length) return null;
  return (defenses?.immunities || [])
    .map((x) => String(x).toLowerCase())
    .find((x) => tokens.includes(x)) || null;
};

// Highest matching entry off a weaknesses/resistances list, as
// { type, value } with the monster's own token carried for the reveal.
const bestDefenseValue = (list, type) => {
  const tokens = persistentDefenseTokens(type);
  let best = null;
  for (const e of list || []) {
    if (typeof e?.value !== 'number' || e.value <= 0) continue;
    const et = String(e.type || '').toLowerCase();
    if (!tokens.includes(et)) continue;
    if (!best || e.value > best.value) best = { type: et, value: e.value };
  }
  return best;
};

// IWR context for one enemy instance, in the same shape resolveResistance
// builds for PCs ({ immune, weakness, amount, easeFlatCheck }) so
// formatReminder and the chip annotate enemies identically. Null when the
// entry has no defenses (manual enemy) — callers fall back to the bare line.
export const enemyPersistentIwr = (defenses, inst) => {
  if (!defenses) return null;
  return {
    immune: !!persistentImmunityMatch(defenses, inst?.type),
    weakness: bestDefenseValue(defenses.weaknesses, inst?.type)?.value || 0,
    amount: bestDefenseValue(defenses.resistances, inst?.type)?.value || 0,
    easeFlatCheck: false,
  };
};

// The IWR a tick of `inst` fires against `defenses`, in applyIwr's fired
// shape ([{ kind, type, amount }]) so useIwrReveal.revealFiredIwr consumes it
// unchanged. Immunity supersedes the others (PF2e order); the app never rolls
// the tick's dice, so any positive weakness/resistance counts as fired — a
// damaging tick always engages them.
export const enemyPersistentFired = (defenses, inst) => {
  if (!defenses) return [];
  const immunity = persistentImmunityMatch(defenses, inst?.type);
  if (immunity) return [{ kind: 'immunity', type: immunity, amount: 0 }];
  const fired = [];
  const weak = bestDefenseValue(defenses.weaknesses, inst?.type);
  if (weak) fired.push({ kind: 'weakness', type: weak.type, amount: weak.value });
  const res = bestDefenseValue(defenses.resistances, inst?.type);
  if (res) fired.push({ kind: 'resistance', type: res.type, amount: -res.value });
  return fired;
};

// Record-time immunity negation (#1015): split freshly-minted instances into
// the trackable ones and the ones the target's immunities block outright.
export const partitionByImmunity = (instances, defenses) => {
  const kept = [];
  const blocked = [];
  for (const inst of instances || []) {
    const immunity = persistentImmunityMatch(defenses, inst?.type);
    if (immunity) blocked.push({ inst, immunity });
    else kept.push(inst);
  }
  return { kept, blocked };
};

export const formatImmuneSkip = (name, inst) =>
  `${name}: immune to persistent ${inst?.type || 'damage'} — not tracked`;

// Immunity/weakness/resistance context for one instance, as resolved by the
// caller from the target's active effects (isImmuneTo / weaknessFor /
// resistanceFor / flatCheckEasedFor in EffectUtils):
//   { immune, weakness, amount, easeFlatCheck }
// `immune` (#919) zeroes the tick outright and supersedes the other modifiers;
// otherwise `weakness` adds to each tick and `amount` (resistance) reduces it
// (min 0) — the table rolls the dice, so the reminder just states the
// modifiers; `easeFlatCheck` lowers the recovery DC. An instance carrying a
// `recoveryDc: { base, assisted }` override (Toothy Knife, #1215) replaces
// both defaults — assistance/easing selects the assisted value.
export const recoveryDc = (res, inst = null) => {
  const dc = inst?.recoveryDc;
  if (dc && typeof dc.base === 'number') {
    return res?.easeFlatCheck ? (dc.assisted ?? dc.base) : dc.base;
  }
  return res?.easeFlatCheck ? EASED_RECOVERY_DC : RECOVERY_DC;
};

export const formatReminder = (name, inst, res = null) => {
  if (res?.immune) {
    // The condition persists (the flat check can still end it) but each tick
    // deals nothing while the immunity holds.
    return `${name}: ${describe(inst)} — immune (no damage) — DC ${recoveryDc(res, inst)} flat check to end`;
  }
  // PF2e order: weakness adds first, then resistance reduces.
  const weakNote = res?.weakness ? `, weakness ${res.weakness} (add)` : '';
  const resNote = res?.amount ? `, resistance ${res.amount} (reduce, min 0)` : '';
  return `${name}: ${describe(inst)}${weakNote}${resNote} — DC ${recoveryDc(res, inst)} flat check to end`;
};

export const formatClearance = (name, inst, how) =>
  `${name}: ${describe(inst)} ended (${how === 'healed' ? 'healed' : 'flat check'})`;
