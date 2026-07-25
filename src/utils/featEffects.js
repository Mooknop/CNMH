// Feat/class-feature passive-modifier spine — the feat mirror of wornGear's
// wornSpeedEffects (SP3, #1222).
//
// Until now a feat could only carry *abilities* (actions / freeActions /
// reactions / strikes / innate); a class feature whose whole mechanic is a
// standing typed bonus had no declarative home, so the only options were an
// engine hardcode keyed on the feat's name (rustBlessing.js, consumables.js)
// or nothing at all. This adds the missing channel: a feat may author a
// `modifiers: [{ stat, kind, amount }]` array in exactly the shape the effect
// catalog uses, and the engine synthesizes an `{ entry, def }` pair from it.
//
// Champion's Blessing of the Devoted (Blessed Swiftness) is the first consumer:
// `{ stat: 'speed', kind: 'status', amount: 5 }`. Routing it through
// computeEffectBonuses rather than adding a raw +5 keeps PF2e stacking honest —
// it takes the best *status* bonus against other status speed bonuses (a
// quicksilver mutagen, Drums of War) and stacks with item/circumstance ones.
//
// Scoped to Speed on purpose, matching wornSpeedEffects' reasoning: the Speed
// spine in useCharacter is the only apply-site that reads these synth pairs, so
// a feat authoring `{ stat: 'ac' }` today would silently do nothing. Widening
// this to the full stat universe means routing feats through useResolvedEffects
// as well — a deliberate follow-up, not an accident of this helper.

const slug = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Synthetic active-effect pairs for feats/class features granting a Speed
 * modifier. Same `{ entry, def }` shape as wornSpeedEffects, consumed by the
 * Speed spine in useCharacter via computeEffectBonuses.
 *
 * @param {object} character - the character doc (reads `feats[].modifiers`)
 * @returns {Array<{ entry: object, def: object }>}
 */
export const featSpeedEffects = (character) => {
  const out = [];
  for (const feat of Array.isArray(character?.feats) ? character.feats : []) {
    if (!feat || !Array.isArray(feat.modifiers)) continue;
    const speedMods = feat.modifiers.filter(
      (m) => m && m.stat === 'speed' && typeof m.amount === 'number'
    );
    if (!speedMods.length) continue;
    // Feats authored before the id convention (campaign boons like Rust
    // Blessing) fall back to a name slug, so the synth id stays stable.
    const id = `featspeed-${feat.id || slug(feat.name)}`;
    out.push({
      entry: { id, effectId: id },
      def: { id, name: feat.name, modifiers: speedMods },
    });
  }
  return out;
};
