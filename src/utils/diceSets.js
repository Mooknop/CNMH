import { RELAY, globalKey } from '../sync/keys';
// Dice So Nice dice-set config (#1490 S7). The GM assigns each character (and
// enemies) a 3D-dice appearance on the Theme page; cnmh_dicesets_global syncs
// the map and the bridge stamps it onto every 3D roll via DSN's
// diceSoNiceRollStart hook (see foundry-bridge/diceSets.js). Persisted
// campaign config — unlike the roll rails, FULL_STATE replay is desired.

export const DICESETS_KEY = globalKey(RELAY.DICESETS);

// The reserved map key for non-PC rolls (any speaker actor the actorMap
// doesn't know — NPC saves, rollNPC initiative, GM-driven monsters).
export const ENEMY_SET_KEY = 'enemy';

// DSN's fixed material list (verified against the DSN customization API docs).
export const DICE_MATERIALS = [
  'plastic', 'metal', 'glass', 'wood', 'chrome', 'stone',
  'velvet', 'resin', 'frosted', 'pristine', 'iridescent',
];

export const DEFAULT_ENEMY_SET = {
  background: '#7a1f1f',
  foreground: '#f2e6d8',
  outline: '#000000',
  edge: '#3d0f0f',
  material: 'stone',
};

const clampHex = (hex) => (/^#[0-9a-f]{6}$/i.test(hex || '') ? hex : null);

const channelAt = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);

// Relative-luminance label pick: light accents get black numerals.
const luminance = (hex) =>
  (0.2126 * channelAt(hex, 0) + 0.7152 * channelAt(hex, 1) + 0.0722 * channelAt(hex, 2)) / 255;

const darken = (hex, factor) =>
  '#' + [0, 1, 2]
    .map((i) => Math.round(channelAt(hex, i) * factor).toString(16).padStart(2, '0'))
    .join('');

// A character's zero-config dice set, derived from their accent color: accent
// body, luminance-picked numerals, darkened edge. The Theme page's "Fill from
// theme accents" button writes these for every character without an entry.
export function deriveDiceSet(accent) {
  const hex = clampHex(accent) || '#c0440e';
  return {
    background: hex,
    foreground: luminance(hex) > 0.55 ? '#000000' : '#ffffff',
    outline: '#000000',
    edge: darken(hex, 0.6),
    material: 'plastic',
  };
}
