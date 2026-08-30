// src/utils/research.js
// GMG Research Topics (#1839, epic #206) — pure RP accrual + tier-unlock rules,
// React-free. This is the S1 plumbing slice: it only defines the shapes and
// math other slices (UI, GM authoring, downtime hookup) build on.
//
// Topic doc shape (CampaignContent `research` collection — capture-only,
// live-DO-only, see worker/CampaignContent.js CAPTURE_ONLY):
//   {
//     id, title, level, traits: [string], description,
//     sources: [{ name, note, costNote?, maxRp, checks: [{ skill, dc }] }],
//     unlocks: [{ rp, text, loreId? }],
//     reward?,
//   }
//
// Party progress lives under the single synced key `cnmh_research_global`
// (src/sync/keys.js APP.RESEARCH) as a map keyed by topic id:
//   {
//     [topicId]: {
//       available: boolean,               // GM has opened this topic to the party
//       rp: number,                       // total RP banked on the topic
//       perSourceRp: { [sourceName]: number },  // RP banked per research source
//     },
//   }
//
// Each source caps out at its own `maxRp` (a source stops paying out once
// exhausted, even if other sources on the same topic still have room) — the
// acceptance criterion on the parent issue (#206). `topic.rp` tracks the sum
// of `perSourceRp` and is what tier unlocks (`unlocks[].rp`) compare against.

const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

/**
 * The progress entry for one topic, filled in with safe defaults when the
 * party hasn't touched it yet (or `progressMap` is missing/null entirely).
 * Never returns a reference into the input map — safe to mutate the result.
 *
 * @param {Object|null|undefined} progressMap - cnmh_research_global value
 * @param {string} topicId
 * @returns {{available: boolean, rp: number, perSourceRp: Object<string, number>}}
 */
export function topicProgress(progressMap, topicId) {
  const entry =
    progressMap && typeof progressMap === 'object' ? progressMap[topicId] : null;
  return {
    available: !!(entry && entry.available),
    rp: entry && typeof entry.rp === 'number' ? entry.rp : 0,
    perSourceRp:
      entry && entry.perSourceRp && typeof entry.perSourceRp === 'object'
        ? { ...entry.perSourceRp }
        : {},
  };
}

/**
 * Sum of every research source's `maxRp` on a topic — the ceiling `rp` can
 * ever reach once every source is fully exhausted.
 *
 * @param {Object} topic
 * @returns {number}
 */
export function totalMaxRp(topic) {
  return (topic?.sources || []).reduce(
    (sum, s) => sum + (typeof s?.maxRp === 'number' ? s.maxRp : 0),
    0
  );
}

/**
 * Bank (or remove, with a negative delta) RP earned from ONE research source.
 * The per-source total is clamped to `[0, source.maxRp]`, so once a source is
 * exhausted, further positive deltas against it are a no-op. `topic.rp` moves
 * by the ACTUAL applied per-source delta — not the requested one — so a
 * capped source can never push the topic total past what it legitimately
 * earned. A source name not found on the topic is treated as uncapped (no
 * `maxRp` to clamp against) so a stale/renamed source never silently eats RP.
 *
 * Never mutates `progressMap`; returns a new map.
 *
 * @param {Object|null|undefined} progressMap
 * @param {Object} topic
 * @param {string} sourceName
 * @param {number} delta - RP to add (negative to subtract)
 * @returns {Object} next progressMap
 */
export function accrueSourceRp(progressMap, topic, sourceName, delta) {
  const map = progressMap && typeof progressMap === 'object' ? progressMap : {};
  const topicId = topic?.id;
  const prev = topicProgress(map, topicId);
  const source = (topic?.sources || []).find((s) => s?.name === sourceName);
  const maxRp = source && typeof source.maxRp === 'number' ? source.maxRp : Infinity;
  const curSourceRp = prev.perSourceRp[sourceName] || 0;
  const nextSourceRp = clamp(curSourceRp + (delta || 0), 0, maxRp);
  const appliedDelta = nextSourceRp - curSourceRp;
  const nextRp = Math.max(0, prev.rp + appliedDelta);
  return {
    ...map,
    [topicId]: {
      ...prev,
      rp: nextRp,
      perSourceRp: { ...prev.perSourceRp, [sourceName]: nextSourceRp },
    },
  };
}

/**
 * Manually adjust a topic's total RP (GM fiat, corrections, etc.) without
 * touching `perSourceRp`. Clamped to `[0, totalMaxRp(topic)]`.
 *
 * Never mutates `progressMap`; returns a new map.
 *
 * @param {Object|null|undefined} progressMap
 * @param {Object} topic
 * @param {number} delta
 * @returns {Object} next progressMap
 */
export function adjustRp(progressMap, topic, delta) {
  const map = progressMap && typeof progressMap === 'object' ? progressMap : {};
  const topicId = topic?.id;
  const prev = topicProgress(map, topicId);
  const nextRp = clamp(prev.rp + (delta || 0), 0, totalMaxRp(topic));
  return {
    ...map,
    [topicId]: {
      ...prev,
      rp: nextRp,
    },
  };
}

/**
 * Every tier this topic has unlocked at the given RP total, ascending by rp.
 *
 * @param {Object} topic
 * @param {number} rp
 * @returns {Array} topic.unlocks entries with rp <= the given rp
 */
export function unlockedTiers(topic, rp) {
  return (topic?.unlocks || [])
    .filter((t) => t && typeof t.rp === 'number' && t.rp <= rp)
    .sort((a, b) => a.rp - b.rp);
}

/**
 * Tiers crossed by moving from `prevRp` to `nextRp` — the set to surface as
 * "just unlocked" notifications. Boundary is inclusive at `nextRp` and
 * exclusive at `prevRp` (a tier sitting exactly at `prevRp` was already
 * unlocked, not newly crossed). Empty whenever `nextRp` doesn't move the
 * total forward.
 *
 * @param {Object} topic
 * @param {number} prevRp
 * @param {number} nextRp
 * @returns {Array} newly-crossed topic.unlocks entries, ascending by rp
 */
export function newlyCrossedTiers(topic, prevRp, nextRp) {
  if (nextRp <= prevRp) return [];
  return (topic?.unlocks || [])
    .filter((t) => t && typeof t.rp === 'number' && t.rp > prevRp && t.rp <= nextRp)
    .sort((a, b) => a.rp - b.rp);
}
