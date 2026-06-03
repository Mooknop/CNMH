// PF2e Recall Knowledge DC by creature level + rarity adjustment.
// Source: CRB p.503 "DC by Level" table + rarity column modifiers.

// DC by level: level -1 → 25 maps to index 0 → 26.
const DC_BY_LEVEL = [
  13, // -1
  14, //  0
  15, //  1
  16, //  2
  18, //  3
  19, //  4
  20, //  5
  22, //  6
  23, //  7
  24, //  8
  26, //  9
  27, // 10
  28, // 11
  30, // 12
  31, // 13
  32, // 14
  34, // 15
  35, // 16
  36, // 17
  38, // 18
  39, // 19
  40, // 20
  42, // 21
  44, // 22
  46, // 23
  48, // 24
  50, // 25
];

const RARITY_BUMP = {
  common:   0,
  uncommon: 2,
  rare:     5,
  unique:   10,
};

export function recallKnowledgeDC(level, rarity = 'common') {
  const lvl = Number.isFinite(level) ? Math.max(-1, Math.min(25, level)) : 0;
  const idx = lvl + 1; // offset: level -1 is index 0
  const base = DC_BY_LEVEL[idx] ?? DC_BY_LEVEL[DC_BY_LEVEL.length - 1];
  const bump = RARITY_BUMP[rarity] ?? 0;
  return base + bump;
}
