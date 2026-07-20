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
//
// The save side has the same failure mode from the other direction: a `defense`
// that mapSpellDefense can't parse also drops the resolver to mode 'none'. A
// COMPOUND string is the usual culprit — Thousand-Year Flood shipped as
// "basic Reflex and AC (see text)", so its 10d10 never reached a save request.
// Hence the general invariant below: authored damage must be *reachable*.
import { spells } from './index';
import { mapSpellDefense } from '../utils/rollResolution';

const isAcDefense = (s) => /^\s*ac\s*$/i.test(String(s.defense || ''));
const hasAttackTrait = (s) => Array.isArray(s.traits) && s.traits.includes('Attack');

// Spells that deal damage with NO save and NO attack roll — the damage just
// happens (Wall of Fire's "takes 4d6 fire damage"). A missing defense is
// correct for these, so they're exempt from the reachability rule.
const NO_ROLL_DAMAGE = ['wall-of-fire'];

describe('damage-step reachability (#987)', () => {
  it('every spell with damageData can actually reach its damage step', () => {
    // Reachable = the defense maps to a save (target-save path), or it is AC
    // with the Attack trait (actor-roll path). Anything else resolves to mode
    // 'none' and the authored damage is dead on arrival.
    const unreachable = spells
      .filter((s) => s.damageData && !NO_ROLL_DAMAGE.includes(s.id))
      .filter((s) => !mapSpellDefense(s.defense) && !(isAcDefense(s) && hasAttackTrait(s)))
      .map((s) => `${s.id} (defense: ${JSON.stringify(s.defense ?? null)})`);
    expect(unreachable).toEqual([]);
  });

  it('Thousand-Year Flood resolves its initial 10d10 basic Reflex', () => {
    const f = spells.find((s) => s.id === 'thousand-year-flood');
    // Was the compound "basic Reflex and AC (see text)", which mapped to null.
    expect(mapSpellDefense(f.defense)).toBe('reflex');
    expect(f.damageData).toMatchObject({ base: '10d10', type: 'bludgeoning' });
    // Rank 9 is the ceiling — no heightening to author.
    expect(f.damageData.heightened).toBeUndefined();
  });
});

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
