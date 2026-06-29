// Fundamental-rune catalog seed (#857 S6a). The runesmith can apply fundamental
// runes (Potency, Striking, Resilient) — but the rune catalog only carries
// PROPERTY runes, and fundamentals live only as fixed tier TABLES in
// utils/weaponRunes.js + utils/armorRunes.js (with no buyable rune-doc form).
//
// This seed derives one buyable rune doc per fundamental tier straight from
// those tables (single source of truth for bonus/price), so a fundamental can be
// stocked as a Runestone, offered by the socket picker (S6b), and applied via
// applyRune (utils/runeSockets.js). Shape, mirroring the property-rune docs:
//   { id, type:'fundamental', fundamental, target, tier|tierKey, name, level, price, description }
// `target` (weapon|armor) replaces the property runes' `armorRune` flag;
// `tier` is the numeric potency value (1–3); `tierKey` is the striking/resilient
// table key (striking|greater|major / resilient|greater|major).
//
// NOTE: not merged into the live `runes` catalog here — wiring fundamentals into
// shop stock + the GM catalog lands in S6b alongside the new picker (so the old
// property-only etch flow can't mishandle a fundamental before S7 retires it).

import { POTENCY, STRIKING } from '../utils/weaponRunes';
import { ARMOR_POTENCY, RESILIENT } from '../utils/armorRunes';

// Canonical PF2e item levels per tier (prices/bonuses come from the tables).
const WEAPON_POTENCY_LEVEL = { 1: 2, 2: 10, 3: 16 };
const ARMOR_POTENCY_LEVEL = { 1: 5, 2: 11, 3: 18 };
const STRIKING_LEVEL = { striking: 4, greater: 12, major: 19 };
const RESILIENT_LEVEL = { resilient: 8, greater: 14, major: 20 };

const potencyRunes = (target, table, levels) =>
  Object.entries(table).map(([tier, def]) => ({
    id: `${target}-potency-${tier}`,
    type: 'fundamental',
    fundamental: 'potency',
    target,
    tier: Number(tier),
    name: `+${def.bonus} ${target === 'armor' ? 'Armor' : 'Weapon'} Potency`,
    level: levels[tier],
    price: def.price,
    description: `A fundamental rune that grants a +${def.bonus} item bonus${
      target === 'armor' ? ' to AC' : ' to attack rolls'
    } and unlocks ${def.bonus} property-rune slot${def.bonus === 1 ? '' : 's'}.`,
  }));

// Striking / Resilient share a keyed-tier shape (table key → tierKey).
const keyedRunes = (fundamental, target, table, levels) =>
  Object.entries(table).map(([key, def]) => ({
    id: key === fundamental ? key : `${key}-${fundamental}`,
    type: 'fundamental',
    fundamental,
    target,
    tierKey: key,
    name: def.label,
    level: levels[key],
    price: def.price,
    description:
      fundamental === 'striking'
        ? 'A fundamental rune that adds extra weapon damage dice on a hit.'
        : 'A fundamental rune that grants an item bonus to all saving throws.',
  }));

export const FUNDAMENTAL_RUNES = [
  ...potencyRunes('weapon', POTENCY, WEAPON_POTENCY_LEVEL),
  ...keyedRunes('striking', 'weapon', STRIKING, STRIKING_LEVEL),
  ...potencyRunes('armor', ARMOR_POTENCY, ARMOR_POTENCY_LEVEL),
  ...keyedRunes('resilient', 'armor', RESILIENT, RESILIENT_LEVEL),
];

// id → fundamental rune doc.
export const fundamentalRuneMap = () =>
  new Map(FUNDAMENTAL_RUNES.map((r) => [String(r.id), r]));

export default FUNDAMENTAL_RUNES;
