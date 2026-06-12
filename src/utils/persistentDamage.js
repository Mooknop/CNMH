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

export const PERSISTENT_KEY = 'cnmh_persistent_global';

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

const describe = (inst) =>
  `${inst.dice} persistent ${inst.type || 'damage'}${inst.half ? ' (half)' : ''}`;

export const formatReminder = (name, inst) =>
  `${name}: ${describe(inst)} — DC 15 flat check to end`;

export const formatClearance = (name, inst, how) =>
  `${name}: ${describe(inst)} ended (${how === 'healed' ? 'healed' : 'flat check'})`;
