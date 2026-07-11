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
