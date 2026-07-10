import { hasTrait } from './map';

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

export function flourishFor({ ability, castSource, character, bloodMagicActive = false }) {
  if (typeof ability?.flourish === 'string' && ability.flourish) return ability.flourish;

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
