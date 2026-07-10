// Thrown Strike resolution (#1230) — the weapon leaves the wielder's hand on
// release: it lands where it struck (hit or miss) and is marked Dropped in the
// live loadout, unless a returning-effect rune flies it back to hand. The
// Blade Byrnie dagger (#738) has its own return path and never drops here.

/**
 * Confirm-time applier: log the thrown weapon's landing and drop it from the
 * live loadout (unless returning). No-op for non-thrown Strikes.
 *
 * @param {Object}   args
 * @param {Object}   args.ability          - the confirmed Strike (thrown / weaponUid / returning / bladeByrnie flags)
 * @param {Object}   args.character        - the acting character ({ id, name })
 * @param {Function} args.dropThrownWeapon - useLoadout(charId).drop
 * @param {Function} args.appendLog        - encounter log appender
 */
export const logThrownWeaponResolution = ({ ability, character, dropThrownWeapon, appendLog }) => {
  if (!(ability?.thrown && ability?.weaponUid && !ability?.bladeByrnie)) return;
  const weaponName = ability.source || ability.name;
  if (ability.returning) {
    appendLog({
      type: 'action',
      charId: character.id,
      text: `${character.name}'s ${weaponName} flies back to hand after the throw`,
    });
  } else {
    dropThrownWeapon(ability.weaponUid);
    appendLog({
      type: 'action',
      charId: character.id,
      text: `${character.name}'s ${weaponName} lands after the throw — Dropped`,
    });
  }
};
