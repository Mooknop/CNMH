// Rune-granted spell casts (#1055 S3). Two accessory runes cast a spell as
// their once-per-day activation rather than applying a bespoke effect:
// Menacing (Greater) casts fear, Presentable (Greater) casts suggestion. Their
// `actuated` block carries a `spellRef` (+ fixed `castRank`/`dc`); this turns
// that into a cast-ready synthetic spell the shared cast flow (CastSpellModal →
// UseAbilityModal) resolves like any other.
//
// The rune casts at a FIXED rank and DC — most garment-wearers aren't
// spellcasters, so the DC can't derive from their (absent) spell DC. The
// synthetic spell therefore carries a `spell-dc` roll override (a fixed target
// DC) and an `innate` source (a no-slot cast), and shares the host item's
// `${uid}:actuated` frequency key so the once-per-day gate is the same ledger
// entry the ItemModal activation card reads.

/** Whether an actuated block casts a catalog spell (#1055 S3). */
export const actuatedCastsSpell = (actuated) =>
  !!(actuated && typeof actuated === 'object' && actuated.spellRef);

/**
 * Build a cast-ready synthetic spell from a rune's actuated block + the
 * resolved catalog spell doc. Returns null when the block casts no spell or
 * the doc is missing (an unresolved ref).
 *
 * @param {object|null} actuated - the rune's `actuated` block
 * @param {object|null} spellDoc - the catalog spell resolved from `spellRef`
 * @param {string|null} hostUid  - the wearing item's uid (frequency key)
 */
export const buildRuneCastSpell = (actuated, spellDoc, hostUid) => {
  if (!actuatedCastsSpell(actuated) || !spellDoc || typeof spellDoc !== 'object') return null;
  const rank = typeof actuated.castRank === 'number' ? actuated.castRank : spellDoc.level;
  return {
    ...spellDoc,
    // Cast at the rune's fixed rank so heighten and target-count are correct
    // (fear at rank 3 hits up to five creatures).
    ...(typeof rank === 'number' ? { level: rank } : {}),
    // Fixed DC from the rune, independent of the wearer's spell DC.
    ...(typeof actuated.dc === 'number' ? { roll: { type: 'spell-dc', bonus: actuated.dc } } : {}),
    // No slot: cast as an innate ("no cost") option through the shared flow.
    innate: true,
    // Share the host's actuated frequency key so the once/day gate matches the
    // ItemModal activation card (useItemActivation keys `${uid}:actuated`).
    id: hostUid ? `${hostUid}:actuated` : spellDoc.id,
    frequency: actuated.frequency || 'once per day',
  };
};

export default buildRuneCastSpell;
