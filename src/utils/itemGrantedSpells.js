// Item-granted innate spells (#914). Some worn/held items let the wearer cast a
// catalog spell as an innate power — Pendant of the Occult casts guidance as an
// occult innate cantrip; Ring of Observation casts invisibility once per day.
// The spell must be a catalog `ref` (#622 no-inline-spells), mirroring
// staff.spells[].ref and the rune `actuated.spellRef` rail (#1055 S3). This
// module resolves an item's `grantedSpells` and builds cast-ready synthetic
// spells the shared cast flow (CastSpellModal → UseAbilityModal) resolves like
// any other innate cast.
//
// A grant: { ref, tradition?, rank?, frequency? }
//   ref       — catalog spell id (required).
//   tradition — the innate tradition the item grants it as ('occult', …);
//               overrides the spell's own tradition list so it reads as e.g. an
//               occult cast regardless of the (usually non-caster) wearer.
//   rank      — fixed cast rank; defaults to the spell's own level, so a cantrip
//               stays a cantrip. Most item innate cantrips cast at will.
//   frequency — e.g. 'once per day' for a gated grant; omitted grants are
//               at-will. (Frequency-gated wiring rides the use-tracking rail,
//               #916 — this slice ships the at-will cantrip case.)
//
// React-free; the cast itself resolves through CastSpellModal.

/** The normalized granted-spell list on an item ([] when none / malformed). */
export const itemGrantedSpells = (item) => {
  const list = item?.grantedSpells;
  if (!Array.isArray(list)) return [];
  return list.filter((g) => g && typeof g === 'object' && typeof g.ref === 'string');
};

/** Whether an item grants any innate spell. */
export const hasGrantedSpells = (item) => itemGrantedSpells(item).length > 0;

/**
 * Build a cast-ready synthetic spell from a grant + the resolved catalog spell
 * doc, mirroring buildRuneCastSpell (#1055 S3). Returns null when the grant or
 * doc is missing (an unresolved ref).
 *
 * @param {object}      grant    - { ref, tradition?, rank?, frequency? }
 * @param {object|null} spellDoc - the catalog spell resolved from grant.ref
 * @param {string|null} hostUid  - the granting item's uid; namespaces the cast
 *                                 id so a frequency-gated grant keys its own
 *                                 ledger entry (an at-will grant never gates).
 */
export const buildItemGrantedSpell = (grant, spellDoc, hostUid = null) => {
  if (!grant || typeof grant.ref !== 'string' || !spellDoc || typeof spellDoc !== 'object') return null;
  const rank = typeof grant.rank === 'number' ? grant.rank : spellDoc.level;
  return {
    ...spellDoc,
    // Granted as an innate of the item's tradition, independent of the wearer's
    // (usually absent) spellcasting.
    ...(grant.tradition ? { traditions: [grant.tradition] } : {}),
    ...(typeof rank === 'number' ? { level: rank } : {}),
    innate: true,
    id: hostUid ? `${hostUid}:granted:${grant.ref}` : spellDoc.id,
    ...(grant.frequency ? { frequency: grant.frequency } : {}),
  };
};

export default buildItemGrantedSpell;
