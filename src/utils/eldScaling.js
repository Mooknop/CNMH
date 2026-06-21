// Level-scaled dice rendering for Izzy's Eld Powers (#225).
// The authored prose stays the source of truth in content; these helpers
// rewrite the scaling phrases into concrete numbers for the character's level
// so the table never does the "(+1d10 per level)" math at the moment of use.
//
// Patterns handled (everything else passes through untouched):
//   "2d10 (+1d10 per level)"                  → "6d10"        (level 4)
//   "2d4 (+1d4 per level + half your level)"  → "6d4+2"
//   "1d4 … per two levels you have"           → "2d4 …"
//   "1d4 … per level you have"                → "4d4 …"
//   "2 + half your level"                     → "4"

// Eld Attunement: each power is usable once per hour. It's a class feature, so
// the rule is injected at use-time rather than tagged on every authored power.
// Shared by the EldPowers cards and the reaction surfaces (#482 S2) so the gate
// and the ledger key stay identical.
export const ELD_FREQUENCY_RULE = { per: 'hour', uses: 1 };

// "NdX (+MdY per level[ + half your level])" — same die size combines into one
// expression; mismatched sizes render as a sum.
const PAREN_PER_LEVEL_RE =
  /(\d+)d(\d+)\s*\(\+(\d+)d(\d+) per level( \+ half your level)?\)/g;

// "NdX [words] per (two) level(s) you have" — the dice themselves scale; the
// words between (e.g. " persistent electricity damage") are preserved.
const PER_TWO_LEVELS_RE = /(\d+)d(\d+)((?:\s+[a-z]+)*?) per two levels you have/gi;
const PER_LEVEL_RE      = /(\d+)d(\d+)((?:\s+[a-z]+)*?) per level you have/gi;

// Flat "N + half your level".
const FLAT_HALF_LEVEL_RE = /(\d+) \+ half your level/g;

/**
 * Rewrite the level-scaling phrases in a rules-text string into concrete
 * values for `level`. Returns the input unchanged when level is missing or
 * nothing matches.
 *
 * @param {string} text
 * @param {number} level - character level
 * @returns {string}
 */
export function scaleDamageText(text, level) {
  if (typeof text !== 'string' || !Number.isFinite(level) || level <= 0) return text;
  const half = Math.floor(level / 2);

  return text
    .replace(PAREN_PER_LEVEL_RE, (m, base, size, per, perSize, halfLevel) => {
      const flat = halfLevel ? `+${half}` : '';
      if (size === perSize) {
        return `${Number(base) + Number(per) * level}d${size}${flat}`;
      }
      return `${base}d${size} + ${Number(per) * level}d${perSize}${flat}`;
    })
    .replace(PER_TWO_LEVELS_RE, (m, count, size, mid) =>
      `${Number(count) * half}d${size}${mid}`)
    .replace(PER_LEVEL_RE, (m, count, size, mid) =>
      `${Number(count) * level}d${size}${mid}`)
    .replace(FLAT_HALF_LEVEL_RE, (m, base) => `${Number(base) + half}`);
}

/**
 * Return a copy of an Eld power with its description and degree texts scaled
 * to the character's level (shallow elsewhere — safe to hand to the modal).
 */
export function scaleEldPower(power, level) {
  if (!power) return power;
  const scaled = { ...power, description: scaleDamageText(power.description, level) };
  if (power.degrees && typeof power.degrees === 'object') {
    scaled.degrees = Object.fromEntries(
      Object.entries(power.degrees).map(([k, v]) => [k, scaleDamageText(v, level)]),
    );
  }
  return scaled;
}
