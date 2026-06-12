// Pure helpers for spell heightening (#235). A spell's `heightened` map keys
// come in two authored formats:
//   - absolute ordinals: '2nd', '3rd', '6th' — applies once when cast at or
//     above that rank
//   - relative steps: '+1', '+2' — repeats for every N ranks above the
//     spell's native rank
// Kept side-effect-free so the cast-flow UI and tests share the same algebra.

// '3rd' → { kind: 'absolute', rank: 3 }; '+2' → { kind: 'relative', step: 2 };
// anything else → null (heightened maps are hand-curated; skip, don't throw).
export const parseHeightenedKey = (key) => {
  const absolute = /^(\d+)(st|nd|rd|th)$/i.exec(String(key).trim());
  if (absolute) return { kind: 'absolute', rank: Number(absolute[1]) };
  const relative = /^\+(\d+)$/.exec(String(key).trim());
  if (relative && Number(relative[1]) > 0) {
    return { kind: 'relative', step: Number(relative[1]) };
  }
  return null;
};

// The heightened entries that apply when `spell` is cast at `castRank`,
// cumulative (every tier ≤ castRank), in authored map order. Each entry is
// { key, text, times } — `times` > 1 means a relative step applies repeatedly
// (e.g. '+1' cast three ranks up → times: 3).
//
// Cantrips (level 0) are statted at rank 1 and heighten per rank above 1 —
// a rank-2 cantrip applies a '+1' entry once, not twice.
export const heightenedEntriesFor = (spell, castRank) => {
  const heightened = spell?.heightened;
  const nativeRank =
    typeof spell?.level === 'number' && spell.level > 0 ? spell.level : 1;
  if (!heightened || typeof castRank !== 'number' || castRank <= nativeRank) {
    return [];
  }
  const entries = [];
  for (const [key, text] of Object.entries(heightened)) {
    const parsed = parseHeightenedKey(key);
    if (!parsed) continue;
    if (parsed.kind === 'absolute') {
      if (parsed.rank <= castRank) entries.push({ key, text, times: 1 });
    } else {
      const times = Math.floor((castRank - nativeRank) / parsed.step);
      if (times >= 1) entries.push({ key, text, times });
    }
  }
  return entries;
};
