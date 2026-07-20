// Content-integrity gate for action-variable spell damage (#987).
//
// A spell whose damage depends on the actions spent authors `variants`, each
// `{ actions, note, damage }`. useAbilityCastPlan resolves the chosen action
// count via variantFor(), and UseAbilityModal feeds `variant.damage` to
// buildDamageProfile as the damageOverride (#268) — so the variant supplies the
// whole damage block (base + type + heightened), and no top-level damageData is
// needed (the blazing-bolt / force-barrage precedent).
import { spells } from './index';
import { buildDamageProfile } from '../utils/damage';
import { variantFor } from '../utils/ActionsUtils';

const character = { id: 'c', level: 9, abilities: {} };

// Mirror the modal: pick the variant for the chosen action count, hand its
// damage block in as the override.
const profileForActions = (spell, actions, castRank) =>
  buildDamageProfile(spell, character, {
    chosenActions: actions,
    castRank,
    damageOverride: variantFor(spell, actions)?.damage ?? null,
  });

describe('action-variable damage (#987)', () => {
  const stampede = () => spells.find((s) => s.id === 'crushing-stampede');

  it('every action-variant carries a complete damage block', () => {
    for (const v of stampede().variants) {
      expect([1, 2, 3]).toContain(v.actions);
      expect(v.damage.base).toEqual(expect.any(String));
      expect(v.damage.type).toBe('bludgeoning');
      expect(v.note).toEqual(expect.any(String));
    }
  });

  it('Crushing Stampede scales 5d6 (1 action) vs 10d6 (2–3 actions) at base rank', () => {
    const s = stampede();
    expect(profileForActions(s, 1, 5).expression).toBe('5d6');
    expect(profileForActions(s, 2, 5).expression).toBe('10d6');
    // The 3-action version deals the 2-action damage; only the ally-escape differs.
    expect(profileForActions(s, 3, 5).expression).toBe('10d6');
  });

  it('heightening adds +1d6 per rank to the 1-action and +2d6 to the 2/3-action versions', () => {
    const s = stampede();
    // Cast at rank 7 = 2 ranks above the spell's native 5.
    expect(profileForActions(s, 1, 7).expression).toBe('7d6');  // 5d6 + 2×1d6
    expect(profileForActions(s, 2, 7).expression).toBe('14d6'); // 10d6 + 2×2d6
    expect(profileForActions(s, 3, 7).expression).toBe('14d6');
  });

  it('is a basic Reflex save, so the GM save request halves/doubles by degree', () => {
    expect(stampede().defense).toBe('basic Reflex');
  });
});
