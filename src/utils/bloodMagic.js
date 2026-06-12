// Blood magic (#227). Casting a bloodline-flagged spell (`bloodline: true` on
// the spell — granted spells and bloodline focus spells alike) triggers the
// sorcerer's blood magic. Jade's Imperial bloodline: +1 status bonus to either
// AC or saving throws until the start of her next turn — the caster picks one
// at cast time and the choice lands as a catalog effect entry on the caster.

export const BLOOD_MAGIC_OPTIONS = [
  { id: 'ac',    effectId: 'imperial-blood-magic-ac',    label: '+1 status bonus to AC' },
  { id: 'saves', effectId: 'imperial-blood-magic-saves', label: '+1 status bonus to saving throws' },
];

export const bloodMagicOption = (id) =>
  BLOOD_MAGIC_OPTIONS.find((o) => o.id === id) || BLOOD_MAGIC_OPTIONS[0];

// The character has a bloodline with a blood magic rider (sorcerers only).
export const hasBloodMagic = (character) =>
  !!character?.spellcasting?.bloodline?.blood_magic;

export const isBloodlineSpell = (spell) => spell?.bloodline === true;

/**
 * Whether this cast triggers blood magic: the caster has a bloodline AND the
 * spell being cast — directly, or as the spell a Spellshape chains into —
 * carries the bloodline flag.
 */
export const bloodMagicTriggered = (character, spell, chainSpell = null) =>
  hasBloodMagic(character)
  && (isBloodlineSpell(spell) || isBloodlineSpell(chainSpell));
