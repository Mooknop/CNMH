// Thassilonian sin/virtue runes — original hand-drawn calligraphic glyphs
// evoking the seven rune motifs of ancient Thassilon (Pathfinder lore): the
// seven sins and the seven virtues of rule they were corrupted from. Each
// entry is a single filled path in a 100×100 viewBox, rendered by
// ThassilonianRune with `fill: currentColor` (and `fill-rule: evenodd` — the
// ring/outline glyphs rely on it) so CSS drives color like every other glyph.
//
// `opposes` links each sin to its counterpart virtue and vice versa; sins also
// carry their associated Thassilonian school of magic.

export const THASSILONIAN_RUNES = {
  // ---- Sins ----
  lust: {
    label: 'Lust',
    kind: 'sin',
    opposes: 'love',
    school: 'enchantment',
    d: 'M52 90 C42 80 36 66 42 52 C48 38 58 30 55 18 L60 6 C66 18 62 32 52 44 C44 54 45 66 53 76 C57 82 57 86 52 90 Z M41 76 L26 90 L34 68 C36 71 38 74 41 76 Z',
  },
  envy: {
    label: 'Envy',
    kind: 'sin',
    opposes: 'charity',
    school: 'abjuration',
    d: 'M8 44 C20 28 38 22 50 32 C62 22 80 28 92 44 C80 37 66 35 56 41 L51 58 L45 41 C35 35 20 37 8 44 Z',
  },
  sloth: {
    label: 'Sloth',
    kind: 'sin',
    opposes: 'zeal',
    school: 'conjuration',
    d: 'M8 64 C16 55 26 52 35 57 C46 63 55 61 63 53 C72 45 82 45 88 53 C93 60 91 67 84 70 C88 63 86 57 80 56 C72 55 68 63 58 67 C45 73 30 70 21 63 C17 60 12 62 8 64 Z M83 62 a5.5 5.5 0 1 1 -0.1 0.01 Z',
  },
  greed: {
    label: 'Greed',
    kind: 'sin',
    opposes: 'generosity',
    school: 'transmutation',
    d: 'M66 10 L36 28 L58 38 C66 41 69 47 66 54 C61 66 48 76 32 80 C46 71 55 61 56 51 L33 41 C28 39 28 33 33 30 L64 12 Z M46 27 a4.5 4.5 0 1 1 -0.1 0.01 Z',
  },
  gluttony: {
    label: 'Gluttony',
    kind: 'sin',
    opposes: 'temperance',
    school: 'necromancy',
    d: 'M28 34 C20 30 18 20 27 15 C23 21 25 27 32 29 C45 21 64 23 77 33 C65 29 50 30 41 36 C41 39 42 42 44 44 C59 42 74 50 81 63 C69 53 52 50 42 55 C33 59 24 52 25 43 C25 39 26 36 28 34 Z M84 40 a5 5 0 1 1 -0.1 0.01 Z',
  },
  pride: {
    label: 'Pride',
    kind: 'sin',
    opposes: 'humility',
    school: 'illusion',
    d: 'M50 92 C45 74 45 56 49 40 C40 34 32 25 33 12 C38 23 45 28 51 30 C57 27 62 20 61 10 C67 22 62 34 55 40 C59 58 57 76 54 92 Z',
  },
  wrath: {
    label: 'Wrath',
    kind: 'sin',
    opposes: 'kindness',
    school: 'evocation',
    d: 'M14 22 L40 14 L33 24 L38 26 C31 36 26 46 24 58 C22 46 23 36 27 26 L20 29 Z M46 30 L72 22 L65 32 L70 34 C63 44 58 54 56 66 C54 54 55 44 59 34 L52 37 Z',
  },

  // ---- Virtues ----
  love: {
    label: 'Love',
    kind: 'virtue',
    opposes: 'lust',
    d: 'M50 30 C44 20 34 20 33 12 C40 16 46 16 50 22 C54 16 60 16 67 12 C66 20 56 20 50 30 Z M50 32 a22 22 0 1 0 0.01 0 Z M50 40 a14 14 0 1 1 -0.01 0 Z M50 46 a4 4 0 1 1 -0.1 0.01 Z M50 58 a4 4 0 1 1 -0.1 0.01 Z',
  },
  charity: {
    label: 'Charity',
    kind: 'virtue',
    opposes: 'envy',
    d: 'M38 12 C52 6 66 12 68 24 C70 34 62 42 54 44 C64 48 68 56 64 66 C58 78 44 84 32 80 C44 79 54 71 56 61 C57 53 50 49 42 49 L42 42 C52 40 58 32 56 24 C54 16 46 12 38 12 Z M28 48 a5 5 0 1 1 -0.1 0.01 Z',
  },
  zeal: {
    label: 'Zeal',
    kind: 'virtue',
    opposes: 'sloth',
    d: 'M58 22 C38 24 26 40 30 56 C34 72 52 82 68 76 C52 76 40 66 40 52 C40 40 48 32 60 30 Z M58 22 L72 24 L61 27 L74 12 L58 22 Z M54 54 a6 6 0 1 1 -0.1 0.01 Z',
  },
  generosity: {
    label: 'Generosity',
    kind: 'virtue',
    opposes: 'greed',
    d: 'M42 8 C37 28 36 48 40 64 C43 77 52 84 63 82 C73 80 78 70 72 63 C67 58 58 59 54 64 C57 55 68 52 75 58 C84 66 78 82 64 86 C49 90 37 79 35 63 C32 45 34 25 39 8 Z M58 70 a4.5 4.5 0 1 1 -0.1 0.01 Z',
  },
  temperance: {
    label: 'Temperance',
    kind: 'virtue',
    opposes: 'gluttony',
    d: 'M50 14 L88 76 L12 76 Z M50 28 L77 71 L23 71 Z M34 56 L66 56 L70 62 L30 62 Z M40 67 a3.5 3.5 0 1 1 -0.1 0.01 Z M52 67 a3.5 3.5 0 1 1 -0.1 0.01 Z',
  },
  humility: {
    label: 'Humility',
    kind: 'virtue',
    opposes: 'pride',
    d: 'M38 14 C54 8 66 16 64 28 C62 38 50 42 42 41 C52 43 58 49 56 57 C54 66 43 70 34 67 C43 66 49 61 49 55 C49 49 42 46 36 47 L36 36 C44 37 52 33 53 26 C54 18 46 13 38 14 Z M28 78 L66 78 L70 85 L24 85 Z M20 60 a4.5 4.5 0 1 1 -0.1 0.01 Z',
  },
  kindness: {
    label: 'Kindness',
    kind: 'virtue',
    opposes: 'wrath',
    d: 'M50 10 C64 26 74 44 74 54 C74 68 64 80 50 90 C36 80 26 68 26 54 C26 44 36 26 50 10 Z M50 20 C60 32 68 46 68 54 C68 64 60 74 50 82 C40 74 32 64 32 54 C32 46 40 32 50 20 Z M47 36 L53 36 L54 64 L46 64 Z M50 26 a3.5 3.5 0 1 1 -0.1 0.01 Z',
  },
};

// Sin/virtue counterpart pairs, in the traditional order.
export const SIN_VIRTUE_PAIRS = [
  ['lust', 'love'],
  ['envy', 'charity'],
  ['sloth', 'zeal'],
  ['greed', 'generosity'],
  ['gluttony', 'temperance'],
  ['pride', 'humility'],
  ['wrath', 'kindness'],
];

/** The rune entry for a name (case-insensitive), or null. */
export const runeForName = (name) =>
  THASSILONIAN_RUNES[String(name || '').toLowerCase()] || null;
