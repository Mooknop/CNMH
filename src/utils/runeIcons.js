// Catalog-rune glyph registry (epic #1369, R1) — original hand-drawn
// calligraphic marks for the `rune` catalog, authored directly here like the
// Thassilonian sin runes (utils/thassilonianRunes.js): 100×100 viewBox,
// filled paths painted with `currentColor` (fill-rule: evenodd — several
// glyphs rely on ring/notch cutouts).
//
// Entries are keyed by FAMILY, not per rune doc: every tier of a rune shares
// one entry, and the entry's `steps` array is a CUMULATIVE series of path
// layers, simplest → most complicated. Tier N renders layers 0..N stacked as
// sibling <path> elements, so a Greater rune literally grows more strokes
// than its base — and drawing a new tier means ADDING a layer, never
// redrawing. A family with fewer drawn steps than a doc's tier clamps to its
// last layer, so partial art coverage still renders everywhere.
//
// `tiers` names the ladder the family's catalog ids actually use (the affix
// per step, '' = the bare family id). Most families ride DEFAULT_TIERS;
// oddballs (reinforcing's six steps, glyphed's below-base lesser,
// dragons-breath's 1..5) declare their own.

export const DEFAULT_TIERS = ['', 'greater', 'major', 'true'];

// Tier affixes stripped off a rune id to find its family — as a prefix
// ("greater-striking") or a suffix ("flaming-greater"); numeric suffixes
// ("dragons-breath-3") map to tier "3".
const TIER_AFFIXES = ['minor', 'lesser', 'moderate', 'greater', 'major', 'supreme', 'true'];

// Global affix rank used only when a family's `tiers` doesn't list the affix
// (a catalog id authored after the glyph): keeps unknown tiers monotonic.
const AFFIX_RANK = { minor: 0, lesser: 1, '': 2, moderate: 3, greater: 4, major: 5, supreme: 6, true: 7 };

// Drawn in the Thassilonian idiom (thassilonianRunes.js): arcane sigil marks,
// not pictograms — tapered ribbon strokes with hooked terminals, floating
// motes, and evenodd ring cutouts, each *evoking* its power rather than
// illustrating it.
export const RUNE_ICON_FAMILIES = {
  flaming: {
    label: 'Flaming',
    steps: [
      // Base: an ascending double-tongue stroke, whipping right.
      'M50 88 C42 74 42 58 50 44 C57 32 60 22 56 10 C66 20 68 34 60 48 C53 60 52 72 58 84 C55 87 52 88 50 88 Z M36 78 C30 68 31 55 39 47 C36 58 38 66 44 74 C41 78 38 79 36 78 Z',
      // Greater: a third tongue and rising ember motes.
      'M66 60 C72 52 72 42 68 34 C74 40 78 52 72 62 C70 64 67 63 66 60 Z M72 16 a4 4 0 1 0 0.01 0 Z M80 28 a3 3 0 1 0 0.01 0 Z',
    ],
  },
  frost: {
    label: 'Frost',
    steps: [
      // Base: a tapered stave splitting into an angular upper crack.
      'M48 10 L54 12 L52 90 L46 88 Z M49 34 L28 22 L30 17 L51 29 Z M51 29 L72 17 L74 22 L53 34 Z',
      // Greater: the crack runs the other way too.
      'M47 62 L28 74 L26 69 L46 57 Z M53 57 L74 69 L72 74 L52 62 Z',
    ],
  },
  shock: {
    label: 'Shock',
    steps: [
      // Base: a jagged descending stroke, wide at the strike and tapering out.
      'M58 8 L64 10 L48 42 L58 39 L40 92 L34 88 L46 52 L36 55 Z',
      // Greater: static motes thrown off the break points.
      'M72 30 a4 4 0 1 0 0.01 0 Z M22 66 a4 4 0 1 0 0.01 0 Z M68 44 a2.5 2.5 0 1 0 0.01 0 Z',
    ],
  },
  corrosive: {
    label: 'Corrosive',
    steps: [
      // Base: a heavy comet-stroke dissolving into motes at its tail.
      'M32 12 C53 18 68 33 72 52 C74 63 70 72 62 78 C67 63 61 46 50 36 C42 29 36 22 28 18 Z M58 84 a4.5 4.5 0 1 0 0.01 0 Z M45 90 a3.5 3.5 0 1 0 0.01 0 Z',
      // Greater: the dissolution spreads.
      'M32 82 a2.5 2.5 0 1 0 0.01 0 Z M68 88 a3.5 3.5 0 1 0 0.01 0 Z M24 70 C20 64 20 56 24 50 C23 58 26 64 30 68 C28 71 26 72 24 70 Z',
    ],
  },
  thundering: {
    label: 'Thundering',
    steps: [
      // Base: a struck ring and the first crescent peal off it.
      'M32 38 a12 12 0 1 0 0.01 0 Z M32 43 a7 7 0 1 1 -0.01 0 Z M58 32 A24 24 0 0 1 58 68 A17 17 0 0 0 58 32 Z',
      // Greater: the farther peal.
      'M70 20 A38 38 0 0 1 70 80 A30 30 0 0 0 70 20 Z',
    ],
  },
  vitalizing: {
    label: 'Vitalizing',
    steps: [
      // Base: a living stroke rising through the ring.
      'M50 30 a21 21 0 1 0 0.01 0 Z M50 36 a15 15 0 1 1 -0.01 0 Z M47 88 C45 72 46 60 50 48 C54 38 56 28 52 16 L58 20 C62 32 58 44 54 54 C51 64 51 74 53 86 Z',
      // Greater: leaf-flicks unfurling off the stem.
      'M40 62 C34 58 30 52 30 44 C36 48 40 54 44 58 Z M62 40 C68 36 70 30 69 22 C64 27 61 33 58 38 Z',
    ],
  },
  wounding: {
    label: 'Wounding',
    steps: [
      // Base: two raking cuts, wide at the bite and tapering out.
      'M26 16 C36 32 42 52 44 74 L39 76 C35 54 30 34 22 20 Z M44 16 C54 32 60 52 62 74 L57 76 C53 54 48 34 40 20 Z',
      // Greater: the third cut.
      'M62 16 C72 32 78 52 80 74 L75 76 C71 54 66 34 58 20 Z',
    ],
  },
  'ghost-touch': {
    label: 'Ghost Touch',
    steps: [
      // Base: a veil-stroke and its detached echo.
      'M36 86 C28 72 32 58 44 50 C56 42 60 32 54 20 C64 26 66 40 58 50 C50 60 44 66 44 76 C44 80 41 84 36 86 Z M62 78 C58 70 60 62 66 56 C63 64 64 70 68 76 C66 79 64 80 62 78 Z',
      // Greater: a second echo and a hollow mote.
      'M70 42 C74 36 74 28 70 22 C76 26 80 36 74 44 C72 45 70 44 70 42 Z M74 8 a5 5 0 1 0 0.01 0 Z M74 11 a2 2 0 1 1 -0.01 0 Z',
    ],
  },
  returning: {
    label: 'Returning',
    steps: [
      // Base: an open ring whose terminal hooks back inward on itself.
      'M78 50 A28 28 0 1 1 50 22 L50 29 A21 21 0 1 0 71 50 Z M50 22 C60 18 70 24 74 34 L68 36 C64 28 57 26 50 29 Z',
      // Greater: the answering inner hook, and the point it returns to.
      'M50 78 C40 82 30 76 26 66 L32 64 C36 72 43 74 50 71 Z M50 44 a5 5 0 1 0 0.01 0 Z',
    ],
  },

  // ── Fundamental runes (scope fold-in, 2026-07-10) ──────────────────────
  // Potency / striking / resilient / reinforcing get marks too, so runed
  // gear and rune wares read as RUNED everywhere runes display. They stay
  // out of the juice layer (flourishFor stamps runes.property only):
  // fundamentals are scaling, not signature. Tinted forge-metal neutrals
  // (RuneIcon.css) so the property runes keep the color wheel.
  'weapon-potency': {
    label: 'Weapon Potency',
    tiers: ['1', '2', '3'],
    steps: [
      // +1: a single keen-stroke rising to a hooked whet-flick.
      'M26 86 C38 62 52 42 66 24 L71 28 C58 46 46 66 34 88 Z M66 24 C70 16 76 12 84 12 C78 16 74 21 72 27 Z',
      // +2: a second, shorter keen-stroke to its left.
      'M14 74 C24 56 34 42 46 30 L50 34 C39 46 29 60 21 77 Z',
      // +3: the third stroke fanning right, and a struck spark.
      'M48 90 C58 74 68 60 80 48 L84 52 C73 63 63 77 55 92 Z M86 30 a3.5 3.5 0 1 0 0.01 0 Z',
    ],
  },
  'armor-potency': {
    label: 'Armor Potency',
    tiers: ['1', '2', '3'],
    steps: [
      // +1: a grounded stave under its first ward-arch.
      'M47 50 L53 50 L52 88 L48 88 Z M26 64 A24 24 0 0 1 74 64 L67 64 A17 17 0 0 0 33 64 Z',
      // +2: the second, wider arch.
      'M14 64 A36 36 0 0 1 86 64 L79 64 A29 29 0 0 0 21 64 Z',
      // +3: the apex mote and the arches' footing serifs.
      'M50 12 a4.5 4.5 0 1 0 0.01 0 Z M14 70 L30 70 L30 75 L14 75 Z M70 70 L86 70 L86 75 L70 75 Z',
    ],
  },
  striking: {
    label: 'Striking',
    steps: [
      // Base: a heavy falling stroke bursting into a splash at the point.
      'M40 10 L56 12 L51 68 L45 66 Z M46 72 L34 86 L30 82 L43 69 Z M52 72 L66 86 L70 82 L55 69 Z',
      // Greater: the side ejecta thrown off the impact.
      'M41 66 L22 72 L20 67 L40 62 Z M57 66 L76 72 L78 67 L58 62 Z',
      // Major: the shock-ring around the strike, and a flung mote.
      'M49 52 a17 17 0 1 0 0.01 0 Z M49 57 a12 12 0 1 1 -0.01 0 Z M78 20 a3 3 0 1 0 0.01 0 Z',
    ],
  },
  resilient: {
    label: 'Resilient',
    steps: [
      // Base: the unbroken ring.
      'M50 28 a24 24 0 1 0 0.01 0 Z M50 35 a17 17 0 1 1 -0.01 0 Z',
      // Greater: three studs set into it — one per saving throw.
      'M50 21 a5 5 0 1 0 0.01 0 Z M29 59 a5 5 0 1 0 0.01 0 Z M71 59 a5 5 0 1 0 0.01 0 Z',
      // Major: outer guard arcs bridging the gaps between the studs.
      'M82 49 A32 32 0 0 0 68 26 L65 30 A27 27 0 0 1 77 50 Z M18 49 A32 32 0 0 1 32 26 L35 30 A27 27 0 0 0 23 50 Z M36 81 A32 32 0 0 0 64 81 L61 77 A27 27 0 0 1 39 77 Z',
    ],
  },
  reinforcing: {
    label: 'Reinforcing',
    tiers: ['minor', 'lesser', 'moderate', 'greater', 'major', 'supreme'],
    steps: [
      // Minor: the shield boss — a studded center in its ring.
      'M50 46 a6 6 0 1 0 0.01 0 Z M50 38 a14 14 0 1 0 0.01 0 Z M50 42 a10 10 0 1 1 -0.01 0 Z',
      // Lesser: the first pair of rivets, east and west.
      'M26 48 a4 4 0 1 0 0.01 0 Z M74 48 a4 4 0 1 0 0.01 0 Z',
      // Moderate: the second pair, north and south.
      'M50 20 a4 4 0 1 0 0.01 0 Z M50 76 a4 4 0 1 0 0.01 0 Z',
      // Greater: the upper rim band.
      'M21 35 A34 34 0 0 1 79 35 L75 38 A29 29 0 0 0 25 38 Z',
      // Major: the lower rim band closing the rim.
      'M79 69 A34 34 0 0 1 21 69 L25 66 A29 29 0 0 0 75 66 Z',
      // Supreme: four diagonal rivets studding the quarters.
      'M71 28 a3.5 3.5 0 1 0 0.01 0 Z M29 28 a3.5 3.5 0 1 0 0.01 0 Z M29 70 a3.5 3.5 0 1 0 0.01 0 Z M71 70 a3.5 3.5 0 1 0 0.01 0 Z',
    ],
  },

  // ── Shield glyph wave (#1373, R4) ───────────────────────────────────────
  // Every target:'shield' catalog family (the seed-coverage test in
  // runeIcons.test.js keeps this exhaustive). Reinforcing lives with the
  // fundamentals above.
  aggressive: {
    label: 'Aggressive',
    steps: [
      // A ram-prow wedge driving right, a speed-stroke trailing it.
      'M28 30 L74 46 C78 48 78 52 74 54 L28 70 L34 58 L58 50 L34 42 Z M14 44 L24 46 L24 54 L14 56 Z',
    ],
  },
  confounding: {
    label: 'Confounding',
    steps: [
      // Two opposed hooks that never meet, a lost mote between them.
      'M50 14 C66 16 72 30 62 40 L57 36 C64 29 60 20 48 19 Z M50 86 C34 84 28 70 38 60 L43 64 C36 71 40 80 52 81 Z M50 46 a4 4 0 1 0 0.01 0 Z',
    ],
  },
  darkness: {
    label: 'Darkness',
    steps: [
      // The eclipse: a heavy occluding disc, the last of the light pinched
      // into a thick closing rim — no stars in THIS dark (cf. moonlit).
      'M50 22 a28 28 0 1 0 0.01 0 Z M58 32 a17 17 0 1 1 -0.01 0 Z',
    ],
  },
  enlarging: {
    label: 'Enlarging',
    steps: [
      // Arcs swelling outward from a corner, each wider than the last.
      'M40 70 A12 12 0 0 0 30 60 L29 64 A8 8 0 0 1 36 71 Z M50 68 A22 22 0 0 0 32 50 L31 55 A17 17 0 0 1 45 69 Z M62 66 A34 34 0 0 0 34 38 L33 44 A28 28 0 0 1 56 67 Z M70 26 a4 4 0 1 0 0.01 0 Z',
    ],
  },
  'energy-resistant': {
    label: 'Energy-Resistant',
    steps: [
      // Base: a ward chevron shrugging off the incoming bolt.
      'M20 62 L50 30 L80 62 L72 62 L50 40 L28 62 Z M46 12 L54 14 L50 26 L44 24 Z',
      // Greater: the split flows shed to either side.
      'M16 70 C26 66 36 66 44 69 L43 75 C35 72 26 72 17 76 Z M84 70 C74 66 64 66 56 69 L57 75 C65 72 74 72 83 76 Z',
      // Major: embers dying beside the peak.
      'M28 30 a3 3 0 1 0 0.01 0 Z M72 30 a3 3 0 1 0 0.01 0 Z',
    ],
  },
  environmental: {
    label: 'Environmental',
    steps: [
      // Base: the ridge-line, two peaks.
      'M14 68 L34 36 L48 56 L44 62 L34 46 L22 68 Z M40 68 L58 28 L86 68 L78 68 L58 40 L48 68 Z',
      // Greater: the sun over it and the water under it.
      'M74 22 a5 5 0 1 0 0.01 0 Z M18 78 C28 74 38 74 48 78 C58 82 68 82 82 78 L82 84 C68 88 58 88 48 84 C38 80 28 80 18 84 Z',
    ],
  },
  feather: {
    label: 'Feather',
    steps: [
      // A quill shaft with three barb-flicks off its spine.
      'M30 86 C42 66 58 40 76 18 L80 22 C62 44 48 68 36 88 Z M60 38 C66 30 74 26 82 26 C74 30 68 35 64 41 Z M52 50 C58 42 66 38 74 38 C66 42 60 47 56 53 Z M44 62 C50 54 58 50 66 50 C58 54 52 59 48 65 Z',
    ],
  },
  floating: {
    label: 'Floating',
    steps: [
      // A hull-arc adrift over rising bubbles.
      'M22 42 A34 34 0 0 1 78 42 L73 46 A28 28 0 0 0 27 46 Z M40 58 a3 3 0 1 0 0.01 0 Z M56 64 a4 4 0 1 0 0.01 0 Z M46 76 a2.5 2.5 0 1 0 0.01 0 Z',
    ],
  },
  focusing: {
    label: 'Focusing',
    steps: [
      // Base: two flanking arcs, the aperture.
      'M35 24 A30 30 0 0 0 35 76 L38 71 A24 24 0 0 1 38 29 Z M65 24 A30 30 0 0 1 65 76 L62 71 A24 24 0 0 0 62 29 Z',
      // Greater: the iris ring inside.
      'M50 36 a14 14 0 1 0 0.01 0 Z M50 40 a10 10 0 1 1 -0.01 0 Z',
      // Major: the point of focus.
      'M50 46 a4 4 0 1 0 0.01 0 Z',
      // True: the cross-hair ticks beyond the arcs.
      'M48 8 L52 8 L52 16 L48 16 Z M48 84 L52 84 L52 92 L48 92 Z M8 48 L16 48 L16 52 L8 52 Z M84 48 L92 48 L92 52 L84 52 Z',
    ],
  },
  furious: {
    label: 'Furious',
    steps: [
      // Three jagged rage-slashes fanning up and out.
      'M26 84 L38 52 L32 56 L46 20 L52 24 L40 54 L46 50 L32 86 Z M52 78 L62 50 L56 53 L68 24 L74 28 L64 52 L70 49 L58 82 Z M14 60 L24 36 L29 40 L19 62 Z',
    ],
  },
  glamourous: {
    label: 'Glamourous',
    steps: [
      // A four-point glimmer inside its ring, one stray sparkle out.
      'M50 26 a24 24 0 1 0 0.01 0 Z M50 32 a18 18 0 1 1 -0.01 0 Z M50 36 C52 46 54 48 64 50 C54 52 52 54 50 64 C48 54 46 52 36 50 C46 48 48 46 50 36 Z M78 20 a3 3 0 1 0 0.01 0 Z',
    ],
  },
  glyphed: {
    label: 'Glyphed',
    tiers: ['lesser', '', 'greater', 'major', 'true'],
    steps: [
      // Lesser: the bare written stave, footed.
      'M46 16 L54 16 L54 78 L60 78 L60 84 L40 84 L40 78 L46 78 Z',
      // Base: the first branch stroke.
      'M54 28 L76 40 L73 46 L54 36 Z',
      // Greater: the answering branch.
      'M46 56 L26 66 L29 72 L46 64 Z',
      // Major: the binding ring through the stave.
      'M50 34 a12 12 0 1 0 0.01 0 Z M50 39 a7 7 0 1 1 -0.01 0 Z',
      // True: the twin witness motes.
      'M28 24 a3.5 3.5 0 1 0 0.01 0 Z M74 68 a3.5 3.5 0 1 0 0.01 0 Z',
    ],
  },
  gusting: {
    label: 'Gusting',
    steps: [
      // Three wind-strokes, the longest curling back on itself.
      'M18 34 L64 34 C74 34 76 24 68 22 C64 21 60 23 59 27 L54 26 C56 18 64 15 71 18 C82 22 79 40 64 40 L18 40 Z M14 50 L74 52 L74 58 L14 56 Z M22 68 L58 68 L58 74 L22 74 Z',
    ],
  },
  heavy: {
    label: 'Heavy',
    steps: [
      // The anvil-beam: wide cap, thick waist, grounded foot.
      'M26 24 L74 24 L74 34 L58 34 L58 66 L70 66 L70 76 L30 76 L30 66 L42 66 L42 34 L26 34 Z',
    ],
  },
  holding: {
    label: 'Holding',
    steps: [
      // Base: the facing clamp-brackets.
      'M30 26 L46 26 L46 33 L37 33 L37 67 L46 67 L46 74 L30 74 Z M70 26 L54 26 L54 33 L63 33 L63 67 L54 67 L54 74 L70 74 Z',
      // Greater: the held mote, latched from above.
      'M50 44 a6 6 0 1 0 0.01 0 Z M47 14 L53 14 L53 22 L47 22 Z',
    ],
  },
  hungering: {
    label: 'Hungering',
    steps: [
      // Two toothed jaws about to close.
      'M26 32 L74 32 L66 44 L58 36 L50 46 L42 36 L34 44 Z M26 68 L74 68 L66 56 L58 64 L50 54 L42 64 L34 56 Z',
    ],
  },
  jinxed: {
    label: 'Jinxed',
    steps: [
      // Base: an inverted hook shedding a drop of bad luck.
      'M50 18 C34 20 28 34 38 44 L43 40 C36 33 40 24 52 23 Z M56 50 C60 58 62 63 62 67 A6 6 0 1 1 50 67 C50 63 52 58 56 50 Z',
      // Greater: the crack across it, and a second drop.
      'M68 26 L74 30 L36 84 L30 80 Z M76 56 C78 60 79 63 79 65 A4 4 0 1 1 71 65 C71 63 72 60 76 56 Z',
    ],
  },
  knowing: {
    label: 'Knowing',
    steps: [
      // A heavy lowered lid, lashed, over the kept truth.
      'M20 46 A34 34 0 0 1 80 46 L74 50 A28 28 0 0 0 26 50 Z M20 46 L14 40 L18 37 L23 43 Z M80 46 L86 40 L82 37 L77 43 Z M50 56 a6 6 0 1 0 0.01 0 Z M50 59 a3 3 0 1 1 -0.01 0 Z',
    ],
  },
  launching: {
    label: 'Launching',
    steps: [
      // A jagged ascender loosed upward, motes falling away.
      'M44 88 L50 50 L40 56 L58 14 L64 18 L52 50 L60 46 L50 90 Z M28 40 a3 3 0 1 0 0.01 0 Z M72 52 a3 3 0 1 0 0.01 0 Z',
    ],
  },
  living: {
    label: 'Living',
    steps: [
      // Base: a mound and the first frond off it.
      'M30 78 C40 72 60 72 70 78 L70 84 C60 80 40 80 30 84 Z M50 76 C48 58 52 40 64 26 C58 42 56 58 56 76 Z',
      // Greater: the answering frond.
      'M46 76 C44 62 40 50 30 40 C40 48 46 60 50 74 Z',
      // True: pollen motes on the air.
      'M68 20 a3.5 3.5 0 1 0 0.01 0 Z M26 34 a3 3 0 1 0 0.01 0 Z',
    ],
  },
  moonlit: {
    label: 'Moonlit',
    steps: [
      // A thin waxing crescent and two far stars.
      'M50 24 a24 24 0 1 0 0.01 0 Z M45 27 a21 21 0 1 1 -0.01 0 Z M26 28 a3 3 0 1 0 0.01 0 Z M22 58 a2.5 2.5 0 1 0 0.01 0 Z',
    ],
  },
  projecting: {
    label: 'Projecting',
    steps: [
      // A solid stave and the hollow echo it casts forward.
      'M30 20 L38 22 L36 80 L28 78 Z M56 26 L66 28 L64 78 L54 76 Z M59 32 L63 33 L62 72 L58 71 Z M42 48 L50 49 L50 54 L42 53 Z',
    ],
  },
  protecting: {
    label: 'Protecting',
    steps: [
      // The warding outline itself, hollow.
      'M50 16 C62 22 72 24 80 24 C80 48 70 72 50 86 C30 72 20 48 20 24 C28 24 38 22 50 16 Z M50 24 C59 28 66 30 73 30 C72 49 64 66 50 77 C36 66 28 49 27 30 C34 30 41 28 50 24 Z',
    ],
  },
  retrieving: {
    label: 'Retrieving',
    steps: [
      // Base: the reaching hook-arc closing on its prize.
      'M76 28 C56 24 40 34 38 52 C37 64 44 74 56 78 L58 72 C48 68 43 61 44 52 C46 38 58 30 76 34 Z M62 74 a5 5 0 1 0 0.01 0 Z',
      // Greater: the pull, drawn in dashes.
      'M22 34 L32 40 L29 45 L19 39 Z M16 54 L26 56 L25 61 L15 59 Z',
    ],
  },
  resuscitating: {
    label: 'Resuscitating',
    steps: [
      // The pulse-line, and the breath returning above it.
      'M12 58 L32 58 L40 40 L52 76 L60 52 L66 58 L88 58 L88 64 L63 64 L59 58 L52 88 L39 54 L35 64 L12 64 Z M50 20 a4 4 0 1 0 0.01 0 Z',
    ],
  },
  reflecting: {
    label: 'Reflecting',
    steps: [
      // Base: a stroke and its mirror image.
      'M40 26 C30 40 26 56 30 72 L36 70 C33 56 36 42 44 30 Z M60 26 C70 40 74 56 70 72 L64 70 C67 56 64 42 56 30 Z',
      // Greater: the mirror line between them.
      'M48 18 L52 18 L52 84 L48 84 Z',
      // Major: the paired motes, each the other's image.
      'M34 82 a3.5 3.5 0 1 0 0.01 0 Z M66 82 a3.5 3.5 0 1 0 0.01 0 Z',
    ],
  },
  reverberating: {
    label: 'Reverberating',
    steps: [
      // Base: the struck bar and its first echo.
      'M26 24 L74 24 L74 32 L26 32 Z M32 44 A22 22 0 0 0 68 44 L63 40 A17 17 0 0 1 37 40 Z',
      // Greater: the second echo, wider.
      'M26 56 A30 30 0 0 0 74 56 L69 52 A25 25 0 0 1 31 52 Z',
      // Major: the farthest echo and the last dying tone.
      'M20 68 A38 38 0 0 0 80 68 L75 64 A33 33 0 0 1 25 64 Z M50 86 a3 3 0 1 0 0.01 0 Z',
    ],
  },
  seeing: {
    label: 'Seeing',
    steps: [
      // Base: the open almond eye, pupil fixed.
      'M14 50 C26 34 74 34 86 50 C74 66 26 66 14 50 Z M22 50 C32 40 68 40 78 50 C68 60 32 60 22 50 Z M50 42 a8 8 0 1 0 0.01 0 Z',
      // Greater: the iris ring waking.
      'M50 36 a14 14 0 1 0 0.01 0 Z M50 40 a10 10 0 1 1 -0.01 0 Z',
      // Major: the gaze radiating past the lids.
      'M24 34 L18 26 L22 23 L28 30 Z M50 28 L50 18 L55 18 L55 28 Z M76 34 L82 26 L78 23 L72 30 Z',
    ],
  },
  'shield-returning': {
    label: 'Shield-Returning',
    steps: [
      // A thrown arc curving home to its stave, hooked at the catch.
      'M26 30 L34 30 L34 74 L26 74 Z M40 30 C62 30 76 42 76 58 C76 68 70 76 60 80 L58 74 C66 71 70 65 70 58 C70 46 58 36 40 36 Z M60 80 L48 78 L58 68 Z',
    ],
  },
  sliding: {
    label: 'Sliding',
    steps: [
      // Base: the long low skid and its wake-dash.
      'M14 70 C34 62 62 58 86 60 L86 66 C62 64 36 68 16 76 Z M30 48 L58 44 L59 50 L31 54 Z',
      // Greater: the higher dash and the kicked-up curl.
      'M44 32 L66 28 L67 34 L45 38 Z M86 60 C90 54 88 46 82 42 C86 48 86 54 82 58 Z',
    ],
  },
  'spell-saving': {
    label: 'Spell-Saving',
    steps: [
      // A diamond ward holding the caught spark.
      'M50 18 L82 50 L50 82 L18 50 Z M50 27 L73 50 L50 73 L27 50 Z M50 44 a6 6 0 1 0 0.01 0 Z',
    ],
  },
  spellguarding: {
    label: 'Spellguarding',
    steps: [
      // The spark barred behind its crossed staves.
      'M50 42 a8 8 0 1 0 0.01 0 Z M24 22 L78 74 L72 80 L20 28 Z M76 22 L80 28 L28 80 L22 74 Z',
    ],
  },
  summoning: {
    label: 'Summoning',
    steps: [
      // Base: the standing arch.
      'M26 84 L26 48 A24 24 0 0 1 74 48 L74 84 L67 84 L67 48 A17 17 0 0 0 33 48 L33 84 Z',
      // Greater: the inner threshold.
      'M40 84 L40 52 A10 10 0 0 1 60 52 L60 84 L54 84 L54 52 A4 4 0 0 0 46 52 L46 84 Z',
      // Major: what rises through it.
      'M50 36 a3 3 0 1 0 0.01 0 Z M42 26 a2.5 2.5 0 1 0 0.01 0 Z M58 24 a3 3 0 1 0 0.01 0 Z',
      // True: the crown-spark above the arch.
      'M50 4 C51.5 10 53 11.5 58 13 C53 14.5 51.5 16 50 22 C48.5 16 47 14.5 42 13 C47 11.5 48.5 10 50 4 Z',
    ],
  },
  taunting: {
    label: 'Taunting',
    steps: [
      // Base: the jeering wedge and its first peal.
      'M22 38 L48 50 L22 62 L28 50 Z M56 34 A22 22 0 0 1 56 66 A16 16 0 0 0 56 34 Z',
      // Greater: the farther peal and the spark that lands.
      'M66 24 A34 34 0 0 1 66 76 A27 27 0 0 0 66 24 Z M84 46 a3.5 3.5 0 1 0 0.01 0 Z',
    ],
  },
  thirsting: {
    label: 'Thirsting',
    steps: [
      // Base: the fang-stroke and the first drop.
      'M44 16 C48 34 52 50 60 66 L54 70 C46 54 42 36 38 18 Z M66 74 C68 78 69 81 69 83 A5 5 0 1 1 59 83 C59 81 60 78 64 74 Z',
      // Greater: two more drops falling.
      'M76 56 C78 60 79 62 79 64 A4 4 0 1 1 71 64 C71 62 72 60 76 56 Z M48 78 C50 82 51 84 51 86 A4 4 0 1 1 43 86 C43 84 44 82 48 78 Z',
      // Major: the pool gathering beneath.
      'M28 92 C38 88 58 88 72 92 L72 96 C58 93 38 93 28 96 Z',
    ],
  },
  throwing: {
    label: 'Throwing',
    steps: [
      // A tilted disc mid-flight, motion-dashes behind it.
      'M28 60 C36 42 62 32 76 40 C70 58 44 68 28 60 Z M36 57 C43 45 60 39 69 43 C63 55 46 62 36 57 Z M18 36 L34 30 L36 35 L20 41 Z M14 50 L28 46 L30 51 L16 55 Z',
    ],
  },
  undead: {
    label: 'Undead',
    steps: [
      // Base: the hollowed visage — a void ring, eyes and mouth cut out.
      'M50 20 a30 30 0 1 0 0.01 0 Z M40 40 a6 6 0 1 1 -0.01 0 Z M60 40 a6 6 0 1 1 -0.01 0 Z M50 60 a5 5 0 1 1 -0.01 0 Z',
      // Greater: the cracks spreading.
      'M50 82 L46 94 L52 94 L54 82 Z M27 68 L17 78 L21 82 L30 72 Z',
      // True: the grave-lights above.
      'M30 10 a3 3 0 1 0 0.01 0 Z M50 6 a3.5 3.5 0 1 0 0.01 0 Z M70 10 a3 3 0 1 0 0.01 0 Z',
    ],
  },
  'weapon-storing': {
    label: 'Weapon-Storing',
    steps: [
      // The sheath, and the blade tucked away inside it.
      'M36 18 L64 18 L64 86 L36 86 Z M42 24 L58 24 L58 80 L42 80 Z M45 70 L54 30 L58 34 L49 72 Z',
    ],
  },

  // ── Armor + weapon property backfill (#1374, R5) ────────────────────────
  // The untargeted property families the R1 starter set left on the
  // generic fallback.
  'aim-aiding': {
    label: 'Aim-Aiding',
    steps: [
      // Two sighting posts, the bead floating true between them.
      'M26 40 L34 40 L34 72 L26 72 Z M66 40 L74 40 L74 72 L66 72 Z M50 24 a5 5 0 1 0 0.01 0 Z M48 42 L52 42 L52 62 L48 62 Z',
    ],
  },
  authorized: {
    label: 'Authorized',
    steps: [
      // The seal-ring, its warrant marked within.
      'M50 20 a30 30 0 1 0 0.01 0 Z M50 27 a23 23 0 1 1 -0.01 0 Z M38 50 L47 60 L62 38 L67 42 L47 70 L33 54 Z',
    ],
  },
  crushing: {
    label: 'Crushing',
    steps: [
      // The weight come down, and the cracks it leaves.
      'M34 20 L66 20 L62 56 L38 56 Z M36 64 L26 76 L30 79 L40 68 Z M48 64 L48 80 L54 80 L54 64 Z M64 64 L74 76 L70 79 L60 68 Z',
    ],
  },
  cunning: {
    label: 'Cunning',
    steps: [
      // Two arcs that pass without meeting, the trick between them.
      'M30 40 C36 26 56 24 64 34 L59 38 C53 31 39 33 36 42 Z M70 60 C64 74 44 76 36 66 L41 62 C47 69 61 67 64 58 Z M50 47 a4 4 0 1 0 0.01 0 Z',
    ],
  },
  dread: {
    label: 'Dread',
    steps: [
      // A veil-bar, its three shrouds hanging unevenly.
      'M26 26 L74 26 L74 33 L26 33 Z M32 33 C33 47 33 59 30 70 L36 70 C39 58 38 46 38 33 Z M47 33 C48 51 48 67 45 82 L51 82 C54 66 53 50 53 33 Z M62 33 C63 45 63 55 60 64 L66 64 C69 54 68 44 68 33 Z',
    ],
  },
  earthbinding: {
    label: 'Earthbinding',
    steps: [
      // A ring chained down to the ground-bar.
      'M22 70 L78 70 L78 77 L22 77 Z M50 22 a11 11 0 1 0 0.01 0 Z M50 27 a6 6 0 1 1 -0.01 0 Z M47 44 L53 44 L53 70 L47 70 Z',
    ],
  },
  fearsome: {
    label: 'Fearsome',
    steps: [
      // A maw-arc, fangs hanging from it.
      'M20 40 A34 34 0 0 1 80 40 L74 44 A28 28 0 0 0 26 44 Z M32 44 L36 58 L40 44 Z M47 44 L50 62 L53 44 Z M60 44 L64 58 L68 44 Z',
    ],
  },
  fortification: {
    label: 'Fortification',
    steps: [
      // The bastion: crenellated, hollow, unbroken.
      'M26 40 L34 40 L34 32 L44 32 L44 40 L56 40 L56 32 L66 32 L66 40 L74 40 L74 76 L26 76 Z M34 50 L66 50 L66 68 L34 68 Z',
    ],
  },
  glamered: {
    label: 'Glamered',
    steps: [
      // Two hollow forms sharing an edge — the thing, and what it seems.
      'M42 26 a20 20 0 1 0 0.01 0 Z M42 32 a14 14 0 1 1 -0.01 0 Z M62 34 L86 58 L62 82 L38 58 Z M62 43 L77 58 L62 73 L47 58 Z',
    ],
  },
  pacifying: {
    label: 'Pacifying',
    steps: [
      // A blade-stave gone soft, drooping into an arc, at rest.
      'M46 18 L54 20 L52 42 L44 40 Z M44 46 C46 62 56 72 72 76 L70 82 C52 78 40 66 38 48 Z M78 64 a3.5 3.5 0 1 0 0.01 0 Z',
    ],
  },
  quenching: {
    label: 'Quenching',
    steps: [
      // The flame-tongue going out under two courses of water.
      'M52 12 C44 26 44 40 52 52 C58 42 58 26 52 12 Z M26 62 C36 58 46 58 56 62 C66 66 74 66 82 62 L82 69 C74 72 64 72 54 68 C44 64 36 64 26 69 Z M32 78 C42 74 58 74 68 78 L68 84 C58 81 42 81 32 84 Z',
    ],
  },
  raiment: {
    label: 'Raiment',
    steps: [
      // Shoulders, a center fold, and the hem.
      'M50 12 a5 5 0 1 0 0.01 0 Z M28 36 A26 26 0 0 1 72 36 L66 40 A20 20 0 0 0 34 40 Z M47 44 L53 44 L53 72 L47 72 Z M28 72 L72 72 L72 79 L28 79 Z',
    ],
  },
  ready: {
    label: 'Ready',
    steps: [
      // The drawn bow: arc, string, and the bolt already nocked.
      'M34 20 C56 34 56 66 34 80 L30 75 C48 63 48 37 30 25 Z M30 22 L34 22 L34 78 L30 78 Z M40 47 L66 47 L66 53 L40 53 Z M66 42 L80 50 L66 58 Z',
    ],
  },
  shadow: {
    label: 'Shadow',
    steps: [
      // A stave and the skewed dark it throws.
      'M40 22 L48 24 L46 74 L38 72 Z M50 74 L78 60 L84 64 L56 78 Z M66 42 a3 3 0 1 0 0.01 0 Z',
    ],
  },
  slick: {
    label: 'Slick',
    steps: [
      // Three glossy slip-strokes, and the drop they shed.
      'M28 30 C44 26 60 28 72 36 L69 42 C58 35 44 33 30 36 Z M24 50 C40 46 56 48 68 56 L65 62 C54 55 40 53 26 56 Z M32 70 C44 67 56 68 66 74 L63 80 C54 75 43 74 34 76 Z M78 68 a4 4 0 1 0 0.01 0 Z',
    ],
  },
  'swallow-spike': {
    label: 'Swallow-Spike',
    steps: [
      // Spikes erupting from the plate-band.
      'M24 60 L76 60 L76 68 L24 68 Z M32 60 L36 38 L42 60 Z M47 60 L52 32 L57 60 Z M62 60 L67 42 L71 60 Z',
    ],
  },

  // ── Ring glyph wave (#1374, R5) ─────────────────────────────────────────
  // Power-ring imbue runes (#967).
  'ring-calling': {
    label: 'Calling',
    steps: [
      // The called thing streaking home to the waiting cup.
      'M22 20 a5 5 0 1 0 0.01 0 Z M32 32 L46 44 L42 49 L28 37 Z M40 62 A18 18 0 0 0 76 62 L70 58 A12 12 0 0 1 46 58 Z',
    ],
  },
  'ring-embodiment': {
    label: 'Embodiment',
    steps: [
      // A figure-stave standing within the ring.
      'M50 22 a28 28 0 1 0 0.01 0 Z M50 29 a21 21 0 1 1 -0.01 0 Z M47 36 L53 36 L53 64 L47 64 Z M39 44 L61 44 L61 49 L39 49 Z',
    ],
  },
  'ring-energy': {
    label: 'Energy',
    steps: [
      // Base: the raw bolt.
      'M54 26 L60 28 L50 50 L58 48 L44 74 L40 70 L48 54 L42 56 Z',
      // Greater: the left containment arc.
      'M30 30 A32 32 0 0 0 30 70 L34 65 A26 26 0 0 1 34 35 Z',
      // Major: the right arc closing the channel.
      'M70 30 A32 32 0 0 1 70 70 L66 65 A26 26 0 0 0 66 35 Z',
    ],
  },
  'ring-immobilizing': {
    label: 'Immobilizing',
    steps: [
      // Base: the mote pinned under its stake.
      'M50 52 a7 7 0 1 0 0.01 0 Z M46 14 L54 14 L52 48 L48 48 Z M42 24 L58 24 L58 30 L42 30 Z',
      // Greater: the side-binds drawn tight.
      'M28 60 L44 62 L43 68 L27 66 Z M72 60 L56 62 L57 68 L73 66 Z',
    ],
  },
  'ring-overwhelming': {
    label: 'Overwhelming',
    steps: [
      // A dome of force bearing down on a single mote.
      'M16 56 A38 38 0 0 1 84 56 L77 60 A31 31 0 0 0 23 60 Z M50 74 a5 5 0 1 0 0.01 0 Z M30 66 L38 70 L35 75 L27 71 Z M70 66 L62 70 L65 75 L73 71 Z',
    ],
  },
  'ring-precision': {
    label: 'Precision',
    steps: [
      // The struck point and its four sighting ticks.
      'M50 42 a8 8 0 1 0 0.01 0 Z M48 20 L52 20 L52 36 L48 36 Z M48 64 L52 64 L52 80 L48 80 Z M20 48 L36 48 L36 52 L20 52 Z M64 48 L80 48 L80 52 L64 52 Z',
    ],
  },
  'ring-ramming': {
    label: 'Ramming',
    steps: [
      // Base: the ram-block driving into its point.
      'M22 38 L54 38 L54 62 L22 62 Z M54 38 L74 50 L54 62 Z M12 44 L18 46 L18 54 L12 56 Z',
      // Greater: the shock-arc where it lands.
      'M80 32 A26 26 0 0 1 80 68 L75 64 A20 20 0 0 0 75 36 Z',
    ],
  },
  'ring-righteous': {
    label: 'Righteous',
    steps: [
      // The crossed stave under its halo.
      'M46 30 L54 30 L54 82 L46 82 Z M36 42 L64 42 L64 49 L36 49 Z M34 24 A18 18 0 0 1 66 24 L61 28 A13 13 0 0 0 39 28 Z',
    ],
  },
  'ring-scourging': {
    label: 'Scourging',
    steps: [
      // Base: the lash uncoiled, barbed at its tip.
      'M26 78 C30 56 44 40 66 32 C74 29 80 30 84 34 L80 39 C77 36 72 35 68 37 C48 45 36 59 32 79 Z M82 28 a4 4 0 1 0 0.01 0 Z',
      // Greater: the second lash inside the first.
      'M36 80 C42 64 52 52 68 46 L70 51 C56 57 46 68 42 82 Z',
    ],
  },
  'ring-warping': {
    label: 'Warping',
    steps: [
      // Base: a ring sheared in half, the lower arc displaced.
      'M28 40 A26 26 0 0 1 72 40 L67 44 A20 20 0 0 0 33 44 Z M80 62 A26 26 0 0 1 36 62 L41 58 A20 20 0 0 0 75 58 Z',
      // Greater: motes slipping through the seam.
      'M22 50 a4 4 0 1 0 0.01 0 Z M84 46 a4 4 0 1 0 0.01 0 Z',
      // Major: the shear-dashes marking the fold.
      'M20 26 L36 28 L35 34 L19 32 Z M64 68 L80 70 L79 76 L63 74 Z',
    ],
  },
  'ring-wicked': {
    label: 'Wicked',
    steps: [
      // A serpentine stroke, barbed where it ends.
      'M50 16 C68 18 76 34 66 46 C60 53 50 54 46 62 C43 68 46 74 54 78 L50 84 C38 78 34 68 40 58 C45 50 56 48 60 42 C66 33 60 24 46 22 Z M64 74 L74 70 L70 80 Z',
    ],
  },
};

// Shown when a rune has no drawn family yet: a plain bindrune stave. Rendered
// untinted (currentColor), like the virtue runes.
export const GENERIC_RUNE_ICON =
  'M46 12 L54 12 L54 88 L46 88 Z M54 24 L78 40 L74 47 L54 34 Z M54 46 L72 59 L68 66 L54 56 Z';

/**
 * Split a rune id into its glyph family + tier affix.
 * "flaming-greater" / "greater-flaming" → { family:'flaming', affix:'greater' };
 * "dragons-breath-3" → { family:'dragons-breath', affix:'3' };
 * "clothing-fire-resistant-greater" → { family:'clothing-fire-resistant', … }.
 */
export const runeIconTier = (runeId) => {
  const id = String(runeId || '').toLowerCase();
  const numeric = id.match(/^(.*)-(\d+)$/);
  if (numeric) return { family: numeric[1], affix: numeric[2] };
  for (const affix of TIER_AFFIXES) {
    if (id.startsWith(`${affix}-`)) return { family: id.slice(affix.length + 1), affix };
    if (id.endsWith(`-${affix}`)) return { family: id.slice(0, -(affix.length + 1)), affix };
  }
  return { family: id, affix: '' };
};

// Step index for an affix within a family's declared ladder. Numeric affixes
// are 1-based positions; unknown affixes fall back to the global rank. Always
// clamped to the layers actually drawn.
const stepIndexFor = (entry, affix) => {
  const tiers = entry.tiers || DEFAULT_TIERS;
  let idx = tiers.indexOf(affix);
  if (idx < 0 && /^\d+$/.test(affix)) idx = Number(affix) - 1;
  if (idx < 0) idx = AFFIX_RANK[affix] != null ? AFFIX_RANK[affix] : 0;
  return Math.max(0, Math.min(idx, entry.steps.length - 1));
};

/**
 * Resolve a catalog rune id to its renderable glyph:
 *   { family, label, layers, generic } — `layers` is the cumulative path
 * stack for the id's tier; unknown families get the generic bindrune with
 * `generic: true` (untinted). Never returns null: every rune renders.
 */
export const resolveRuneIcon = (runeId) => {
  if (runeId == null || runeId === '') return null;
  const { family, affix } = runeIconTier(runeId);
  const entry = RUNE_ICON_FAMILIES[family];
  if (!entry) {
    return { family, label: null, layers: [GENERIC_RUNE_ICON], generic: true };
  }
  return {
    family,
    label: entry.label,
    layers: entry.steps.slice(0, stepIndexFor(entry, affix) + 1),
    generic: false,
  };
};

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Catalog id for a fundamental rune stored in an item's structured `runes`
 * block (which keeps tiers, not docs): potency holds a number (target decides
 * `weapon-potency-N` vs `armor-potency-N`); striking / resilient hold their
 * base tier as the family word itself ('striking' → `striking`, 'greater' →
 * `greater-striking`); reinforcing always holds a tier word (minor…supreme).
 * Returns null when the value doesn't name a tier.
 */
export const fundamentalRuneId = (kind, value, target) => {
  if (kind === 'potency') {
    const tier = Number(value);
    if (!(tier >= 1)) return null;
    return `${target === 'armor' ? 'armor' : 'weapon'}-potency-${Math.min(tier, 3)}`;
  }
  if (typeof value !== 'string' || !value) return null;
  return value === kind ? kind : `${value}-${kind}`;
};

/**
 * The resolved catalog-rune docs an item visibly carries, for glyph display
 * (#1372 — every rune host): fundamental runes (synthesized to their catalog
 * ids from the tiers the structured runes block stores), property runes on
 * any target (weapon / armor / shield / ring all store docs at
 * `runes.property`), the accessory rune, and a runestone's held rune. Docs
 * only — a still-string ref has nothing renderable. Returns [{id,name}].
 * NOTE: the juice layer deliberately does NOT use this (flourishFor stamps
 * runes.property only) — fundamentals display but never stamp.
 * The property filter mirrors
 * weaponRunes.weaponPropertyRunes; it's inlined so this module stays
 * import-free (the fx layer resolves glyphs through it with no app-graph
 * baggage, and the preview rig loads it as bare ESM).
 */
export const runeIconsOf = (item) => {
  const runes =
    item?.runes && typeof item.runes === 'object' && !Array.isArray(item.runes) ? item.runes : {};
  const docs = [];
  // Reinforcing leads — it is the shield's defining rune.
  if (typeof runes.reinforcing === 'string' && runes.reinforcing) {
    docs.push({
      id: fundamentalRuneId('reinforcing', runes.reinforcing),
      name: `${capitalize(runes.reinforcing)} Reinforcing`,
    });
  }
  if (Array.isArray(runes.property)) {
    docs.push(...runes.property.filter((p) => p && typeof p === 'object'));
  }
  if (runes.accessory && typeof runes.accessory === 'object') docs.push(runes.accessory);
  // The other fundamentals (potency / striking / resilient) show as marks too
  // (fold-in 2026-07-10) — but AFTER the property runes, so a tile's capped
  // medallions keep the item's distinctive marks and the near-universal
  // fundamentals fold into the +n chip. Synthesized like reinforcing: the
  // structured runes block stores tiers, not docs.
  const potencyId = fundamentalRuneId('potency', runes.potency, item?.armor ? 'armor' : 'weapon');
  if (potencyId) {
    docs.push({
      id: potencyId,
      name: `+${Math.min(Number(runes.potency), 3)} ${item?.armor ? 'Armor' : 'Weapon'} Potency`,
    });
  }
  if (typeof runes.striking === 'string' && runes.striking) {
    docs.push({
      id: fundamentalRuneId('striking', runes.striking),
      name: runes.striking === 'striking' ? 'Striking' : `${capitalize(runes.striking)} Striking`,
    });
  }
  if (typeof runes.resilient === 'string' && runes.resilient) {
    docs.push({
      id: fundamentalRuneId('resilient', runes.resilient),
      name: runes.resilient === 'resilient' ? 'Resilient' : `${capitalize(runes.resilient)} Resilient`,
    });
  }
  const held = item?.runestone?.rune;
  if (held && typeof held === 'object' && held.id != null) docs.push(held);
  return docs.filter((d) => d.id != null);
};

export default RUNE_ICON_FAMILIES;
