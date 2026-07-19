// Content-integrity gate for spell-attack damage steps (#987).
//
// A spell whose `defense` is AC is resolved as a spell attack, but ONLY when it
// also carries the `Attack` trait: resolveActionRoll's spell-inference branch is
// `hasAttackTrait && hasSpellcasting && ability.defense` → actor-roll vs 'ac'.
// mapSpellDefense('AC') is null (AC isn't a save), so without the trait the
// resolver falls through every branch and returns mode 'none'. UseAbilityModal
// then computes effectiveDefense as null, buildDamageProfile is never called,
// and the authored `damageData` silently never renders a damage step.
//
// That is exactly how eye-biting-shadow and shadows-betrayal shipped — damage
// authored, damage step dead. This gate fails loudly if a future AC spell is
// added with damageData but no Attack trait.
import { spells } from './index';

const isAcDefense = (s) => /^\s*ac\s*$/i.test(String(s.defense || ''));
const hasAttackTrait = (s) => Array.isArray(s.traits) && s.traits.includes('Attack');

describe('spell-attack damage steps (#987)', () => {
  it('every AC-defense spell with damageData carries the Attack trait', () => {
    const broken = spells
      .filter((s) => isAcDefense(s) && s.damageData && !hasAttackTrait(s))
      .map((s) => s.id);
    expect(broken).toEqual([]);
  });

  it.each(['eye-biting-shadow', 'shadows-betrayal', 'buzzsaw'])(
    '%s resolves as a spell attack (AC defense + Attack trait + damageData)',
    (id) => {
      const s = spells.find((x) => x.id === id);
      expect(s).toBeTruthy();
      expect(isAcDefense(s)).toBe(true);
      expect(hasAttackTrait(s)).toBe(true);
      expect(s.damageData?.base).toEqual(expect.any(String));
    }
  );
});
