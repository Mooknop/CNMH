// src/utils/augmentationEffects.js
// Augmentation passive-effect spine (#1411, slice 1) — the foundation that makes
// a bound augmentation's bonuses actually APPLY, not just render as text.
//
// An augmentation rides `entry.augmentation` on ANY weapon, armor, or shield
// (#1202). Unlike a shield rune (always a held shield) or worn gear (always worn),
// an augmentation's host can be worn (armor) OR held (weapon / shield), so this
// spine scans all three and gates each on the host being ACTIVE — armor while
// worn, weapon / shield while held. It returns the same `{ entry, def }` pairs
// useResolvedEffects merges, so the skill / save readers pick the bonus up with no
// reader changes (mirrors shieldRuneEffects.js).
//
// This slice wires the augmentations whose effect flows cleanly through an
// EXISTING resolved-effects surface:
//   • an always-on skill item bonus while equipped → nets into the skill sheet
//     (like Slick / Darkness), and
//   • a conditional ('vs X') save/DC bonus → a save hint (#338 path).
// The rest of Bucket A (conditional SKILL bonuses, AC hints, conditional
// resistance) need their own plumbing and are tracked as follow-up slices on #1411.

import { isHeldState } from './itemState';
import { isWornDefault } from './wornGear';
import { augmentationOf, augmentationId } from './augmentations';

// Augmentations granting an ALWAYS-ON skill item bonus while the augmented gear is
// equipped. Code-owned (like SKILL_WIRE_RUNES). The bonus rides on the effect DEF
// so computeEffectBonuses nets it into the skill panel + roll resolution.
//
// Only whole-skill, "while equipped" bonuses belong here. A bonus gated on a target
// (Coat of Arms vs a faction, Ancestral Predator vs a creature type) or a specific
// use (Subtle Armor's disguise-the-armor Stealth) is NOT always-on and can't net —
// those are a later slice (conditional skill hints / roll toggles).
export const SKILL_WIRE_AUGMENTS = {
  eyecatcher: { stat: 'deception', amount: 1 }, // +1 item Deception while wielding the weapon
};

// Augmentations granting a CONDITIONAL ('vs X') save/DC bonus while equipped —
// surfaced as a save hint (the #338 conditional path reads the resolved-effects
// universe). Weapon Harness: +1 circumstance to your Reflex DC against attempts to
// Disarm a weapon connected to the harness. The modifier carries a `vs` tag, so
// computeEffectBonuses buckets it as conditional (never netted into the always-on
// save number — the app can't know a check's context). Code-owned.
export const SAVE_HINT_AUGMENTS = {
  'weapon-harness': { stat: 'reflex', kind: 'circumstance', amount: 1, vs: 'Disarm' },
};

// Augmentations granting a CONDITIONAL AC bonus while equipped — surfaced as an AC
// hint (the #338 path, extended to AC in StatsBlock). Shield Harness: +1
// circumstance AC against attacks that catch you flat-footed from being flanked,
// WHILE THE SHIELD IS WORN ON YOUR BACK (not wielded — see WORN_SHIELD_AUGS).
export const AC_HINT_AUGMENTS = {
  'shield-harness': { stat: 'ac', kind: 'circumstance', amount: 1, vs: 'attacks while flanked (worn on your back)' },
};

// Augmentations granting a CONDITIONAL ('vs X') SKILL bonus while equipped — a
// per-skill reminder hint (the #510 path). An entry is an array of modifiers
// because one augmentation can touch two skills (Parade Armor → Diplomacy +
// Intimidation). `choiceVs` fills the `vs` from the augmentation's stored choice
// (Ancestral Predator's chosen creature type). Code-owned.
export const SKILL_HINT_AUGMENTS = {
  'coat-of-arms': [
    { stat: 'diplomacy', kind: 'circumstance', amount: 1, vs: 'a faction feared or respected (GM discretion)' },
  ],
  'ancestral-predator': [
    { stat: 'intimidation', kind: 'circumstance', amount: 1, choiceVs: true },
  ],
  'parade-armor': [
    { stat: 'diplomacy', kind: 'item', amount: 1, vs: 'creatures of the same affiliation' },
    { stat: 'intimidation', kind: 'item', amount: 1, vs: 'creatures of the same affiliation' },
  ],
  // Subtle Armor: +1 item to the Stealth check to disguise the nature of your
  // armor. (Its armor penalties — check penalty +1, Str +2, Bulk +1 — ride the
  // armor-stat path, a follow-up alongside Reinforced Surcoat.)
  'subtle-armor': [
    { stat: 'stealth', kind: 'item', amount: 1, vs: 'hiding the nature of your armor' },
  ],
  // Burnished Plating: −4 circumstance to Stealth EXCEPT in darkness. It applies
  // almost everywhere, so it's a conditional hint (the app can't know a check is in
  // darkness), not a netted penalty. (The Str-threshold raise is the armor-stat
  // path; the Sunshine! reaction is GM-adjudicated.)
  'burnished-plating': [
    { stat: 'stealth', kind: 'circumstance', amount: -4, vs: 'checks made outside darkness' },
  ],
};

// Augmentations whose benefit applies while the shield is WORN (stowed on your
// back), the exception to the held-shield default (Shield Harness is a worn-shield
// bonus; every other shield augmentation is a wielded one).
const WORN_SHIELD_AUGS = new Set(['shield-harness']);

// The `vs` text for a conditional skill modifier, filling a choice-bearing one
// (Ancestral Predator) from the augmentation's chosen creature type.
const hintVs = (m, aug) =>
  (m.choiceVs ? (aug?.choice ? `${aug.choice} creatures` : 'the chosen creature type') : m.vs);

// Whether an entry's augmentation is currently in effect: the host must be equipped
// for its kind — armor while worn, weapon / shield while held (wielded), except a
// worn-shield augmentation (Shield Harness), which needs the shield WORN.
const hostActive = (e) => {
  if (!e || !augmentationOf(e)) return false;
  if (e.armor) return isWornDefault(e);
  if (e.shield) return WORN_SHIELD_AUGS.has(augmentationId(e)) ? isWornDefault(e) : isHeldState(e.state);
  if (e.strikes) return isHeldState(e.state);
  return false;
};

/**
 * Passive effects contributed by the character's bound augmentations, as
 * `{ entry, def }` pairs for useResolvedEffects. `entry.augmentation` is the
 * resolved augmentation doc (contentUtils inlines the ref → doc). Returns [] when
 * no active host carries a WIRED augmentation.
 *
 * @param {Array} inventory - the character's effective (state-stamped) inventory
 * @returns {Array<{ entry: object, def: object }>}
 */
export const augmentationEffects = (inventory = []) => {
  const out = [];
  (Array.isArray(inventory) ? inventory : []).forEach((e) => {
    if (!hostActive(e)) return;
    const augId = augmentationId(e);
    const name = augmentationOf(e)?.name || 'Augmentation';
    const id = `aug-${e.uid}`;
    const skill = SKILL_WIRE_AUGMENTS[augId];
    if (skill) {
      out.push({
        entry: { id, effectId: id },
        def: { id, name, modifiers: [{ stat: skill.stat, kind: 'item', amount: skill.amount }] },
      });
      return;
    }
    // Conditional SKILL hints ride one-or-more `vs`-tagged modifiers on the def
    // (Parade Armor touches two skills). Rendered as a per-skill reminder — never
    // netted — via the resolved-effects conditional path (#510).
    const skillHints = SKILL_HINT_AUGMENTS[augId];
    if (skillHints) {
      const aug = augmentationOf(e);
      out.push({
        entry: { id, effectId: id },
        def: {
          id, name,
          modifiers: skillHints.map((m) => ({ stat: m.stat, kind: m.kind || 'item', amount: m.amount, vs: hintVs(m, aug) })),
        },
      });
      return;
    }
    // Conditional save/AC hints ride a `vs`-tagged modifier on the def, which
    // computeEffectBonuses buckets as conditional (never netted) → renders as a
    // hint on the matching save ring / the Armor panel.
    const hint = SAVE_HINT_AUGMENTS[augId] || AC_HINT_AUGMENTS[augId];
    if (hint) {
      out.push({
        entry: { id, effectId: id },
        def: { id, name, modifiers: [{ stat: hint.stat, kind: hint.kind || 'item', amount: hint.amount, vs: hint.vs }] },
      });
    }
  });
  return out;
};

export default augmentationEffects;
