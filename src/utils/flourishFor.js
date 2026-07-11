import { hasTrait } from './map';
import { resolveRuneIcon } from './runeIcons';

// Signature-ability flourish resolver (#1347, epic #1343). Maps a committed
// ability use to a bespoke flourish id (rendered by components/fx/Flourish),
// resolved at EMIT time in UseAbilityModal.handleConfirm — the one funnel that
// knows the ability, the cast source, and the caster.
//
// Rules are CLASS-keyed plus trait/castSource/name-keyed so they survive
// content renames and never hardcode charIds. An ability doc may carry an
// explicit authored `flourish` field, which wins over the rules — the
// content-driven extension path for future one-offs (no code change needed).
// No match → undefined → the event carries no hint and remote receivers play
// the plain accent bloom.

const nameOf = (ability) => String(ability?.name || '').trim().toLowerCase();

// Rune-marked gear: any action taken WITH an item carrying a `thassilonianRune`
// field stamps that item's rune (fx/Flourish's `rune-<name>` entries). Every
// item-sourced ability already names its item — derived strikes and gear
// actions/reactions carry `source: <item name>`, staff casts `staffName` — so
// the one content field drives the juice for all of them. Beats the class
// rules (the item IS the signature); loses to an authored ability.flourish.
const runeGearFlourish = (ability, character) => {
  const src = ability?.source || ability?.staffName;
  if (!src) return undefined;
  const item = (character?.inventory || []).find(
    (it) => it?.name === src && typeof it?.thassilonianRune === 'string' && it.thassilonianRune
  );
  return item ? `rune-${item.thassilonianRune.toLowerCase()}` : undefined;
};

// Catalog property runes (#1369 R7): a Strike or gear action taken WITH a
// property-runed weapon stamps its rune's glyph — `runestamp:<runeId>`,
// resolved through the runeIcons registry by fx/Flourish at receive time.
// First rune with a DRAWN glyph wins (slot order; a family still on the
// generic fallback never stamps, so the mark is always a real sigil). Sits
// below the sin-rune rule — a sin mark IS the item's identity — and above
// the class rules.
const propertyRuneFlourish = (ability, character) => {
  const src = ability?.source;
  if (!src) return undefined;
  const item = (character?.inventory || []).find(
    (it) => it?.name === src && Array.isArray(it?.runes?.property)
  );
  const doc = (item?.runes?.property || []).find(
    (p) => p && typeof p === 'object' && p.id != null && !resolveRuneIcon(p.id).generic
  );
  return doc ? `runestamp:${doc.id}` : undefined;
};

export function flourishFor({ ability, castSource, character, bloodMagicActive = false }) {
  if (typeof ability?.flourish === 'string' && ability.flourish) return ability.flourish;

  const runeGear = runeGearFlourish(ability, character);
  if (runeGear) return runeGear;

  const propertyRune = propertyRuneFlourish(ability, character);
  if (propertyRune) return propertyRune;

  const cls = String(character?.class || '').trim().toLowerCase();
  const name = nameOf(ability);

  switch (cls) {
    // Ashka — occult implements and borrowed scroll magic.
    case 'thaumaturge':
      return name === 'exploit vulnerability' || castSource === 'scroll'
        ? 'shadow-tendrils'
        : undefined;

    // Blu — the dragon's stance and its spit.
    case 'monk':
      return name === 'dragon stance' || name === 'dragon spit'
        ? 'dragon-lightning'
        : undefined;

    // Izzy — compositions and repertoire casts.
    case 'bard':
      return hasTrait(ability, 'Composition') || castSource === 'slot'
        ? 'composition-burst'
        : undefined;

    // Jade — repertoire casts and blood-magic riders; both at once goes loud.
    case 'sorcerer': {
      const repertoire = castSource === 'slot';
      if (repertoire && bloodMagicActive) return 'blood-swirl-loud';
      return repertoire || bloodMagicActive ? 'blood-swirl' : undefined;
    }

    // Pellias — class is Champion; the Kineticist impulses ride his archetype
    // feats, so the rule keys on the Impulse trait (plus his signature focus
    // spell by name).
    case 'champion':
      return hasTrait(ability, 'Impulse') || name === 'shields of the spirit'
        ? 'rust-bloom'
        : undefined;

    default:
      return undefined;
  }
}

export default flourishFor;
